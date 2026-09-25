import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fork } from "node:child_process";
import { once } from "node:events";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { DurableBattleHost, MAX_PENDING_HOST_TASKS } = load("src/game/durableBattleHost.ts");
const { BattleSyncClient } = load("src/game/battleSyncClient.ts");
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { BATTLE_PROTOCOL_VERSION, MAX_BATTLE_REQUESTS_PER_WINDOW, BATTLE_REQUEST_WINDOW_MS } = load("src/game/battleAuthority.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const { encodeBattleWireGraph } = load("src/game/battleWireGraph.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSyncMessage } = load("src/game/battleSyncProtocol.ts");
const { createBattleCheckpointStore } = createRequire(import.meta.url)("../electron/battle-checkpoint.cjs");
const options = () => ({ version: BATTLE_RULES_VERSION, difficultyVersion: 2, levelId: "IF-1", difficulty: 3,
  unlimitedFirepower: false, seed: 871, debug: true, selectedCards: ["A", "B"], policy: LEGACY_BATTLE_POLICY });
const control = value => ({ type: "control", control: value });
const deploy = { type: "operation", operation: { type: "deploy", card: "B", cell: { lane: 3, column: 2 }, expected: null } };
const state = text => decodeSaveGraph(decodeSyncMessage(JSON.parse(text).snapshot).replay.checkpoint, () => ({}));
const envelope = (stream, sequence, intent) => JSON.stringify({ type: "request", stream,
  request: { version: BATTLE_PROTOCOL_VERSION, battleId: "durable", sequence, intent } });
const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };

async function fixture(config = options()) {
  let stored, now = 0, saveHook;
  const ports = { inputTime: () => now, save: async text => { if (saveHook) await saveHook(text); stored = text; } };
  let host = await DurableBattleHost.create("durable", config, ports), peer, replica;
  const outbound = [], inbound = [], receipts = [];
  const client = new BattleSyncClient({ restore: ({ replay }) => {
    replica = createIndependentBattle(replay, { replica: true, checkpoint: replay.checkpoint });
  }, follow: (tick, commands) => replica.session.followFrame(tick, commands, replica.sessionRuntime),
  checksum: () => battleChecksum(replica.snapshot(replica.world.loadout.ids[0])), receipt: value => receipts.push(value) });
  const connect = async () => { client.connect(message => inbound.push(JSON.stringify(message))); peer = await host.connect("local", message => outbound.push(message)); };
  const pump = async () => {
    for (let attempts = 0; attempts < 30; attempts++) {
      for (const message of outbound.splice(0)) assert.notEqual(client.receiveText(JSON.stringify(message)), "invalid");
      for (const message of inbound.splice(0)) assert.equal(await host.receiveText(peer, message), true);
      if (!outbound.length && !inbound.length) return;
    }
    assert.fail("did not settle");
  };
  await connect(); await pump();
  return { get host() { return host; }, get stored() { return stored; }, ports, client, receipts, outbound, inbound, pump,
    get peer() { return peer; }, get replica() { return replica; }, hook: hook => saveHook = hook, time: value => now = value,
    async send(intent) { assert.equal(client.request(intent), true); await pump(); return receipts.at(-1); },
    async restart(text = stored) { await host.close(); client.disconnect(); host = await DurableBattleHost.restore(text, ports); await connect(); await pump(); } };
}

test("durability barrier gates join snapshots, frames and receipts and serializes concurrent tasks", async () => {
  const f = await fixture(), block = gate();
  f.hook(() => block.promise);
  assert.equal(f.client.request(deploy), true);
  const task = f.host.receiveText(f.peer, f.inbound.shift());
  await Promise.resolve(); await Promise.resolve();
  const old = f.stored, tick = JSON.parse(old).snapshot.cursor.tick;
  const advance = f.host.advance(BATTLE_STEP_MS);
  assert.equal(f.outbound.length, 0); assert.equal(state(f.stored).towers.length, 0);
  block.resolve(); await task; await advance; await f.pump();
  assert.equal(state(f.stored).towers.length, 1);
  assert.equal(JSON.parse(f.stored).snapshot.cursor.tick, tick + 1);
  assert.equal(f.receipts.at(-1).result, "deployed");
  assert.notEqual(f.stored, old);
  await f.host.close();
});

test("host restart preserves lost receipts, global command cursor and stream ordering without redeployment", async () => {
  const f = await fixture();
  await f.send(control({ type: "autoUpgradeEnabled", enabled: false }));
  assert.equal(f.client.request(deploy), true);
  const pending = f.client.pendingRequest;
  await f.host.receiveText(f.peer, f.inbound.shift());
  const delayed = f.outbound.splice(0), saved = f.stored, before = state(saved), oldStream = JSON.parse(saved).stream;
  await f.restart();
  assert.equal(f.client.pendingRequest, undefined);
  assert.equal(f.receipts.at(-1).result, "deployed");
  assert.equal(state(f.stored).towers.length, 1); assert.equal(state(f.stored).chars, before.chars);
  assert.equal(JSON.parse(f.stored).snapshot.cursor.sequence, 2);
  assert.ok(JSON.parse(f.stored).stream > oldStream);
  for (const message of delayed) assert.equal(f.client.receiveText(JSON.stringify(message)), "ignored");
  const duplicate = envelope(JSON.parse(f.stored).stream, pending.sequence, pending.intent);
  await f.host.receiveText(f.peer, duplicate); await f.pump();
  assert.equal(state(f.stored).chars, before.chars);
  await f.send(control({ type: "reserve", value: 199 }));
  assert.equal(f.receipts.at(-1).commandSequence, 2);
  for (let i = 0; i < 12; i++) await f.host.advance(BATTLE_STEP_MS);
  await f.pump();
  assert.equal(battleChecksum(f.replica.snapshot("A")), JSON.parse(f.stored).snapshot.checksum);
  // Local replay after restart uses new checkpoint-relative command sequences, not global wire sequences.
  const restored = createIndependentBattle(decodeSyncMessage(JSON.parse(saved).snapshot).replay,
    { checkpoint: decodeSyncMessage(JSON.parse(saved).snapshot).replay.checkpoint });
  restored.session.restoreCommandOffset(2);
  restored.session.submit({ type: "control", actorId: "local", control: { type: "reserve", value: 199 } }, command => restored.executeCommand(command));
  assert.equal(restored.session.recordedCommands(2)[0].sequence, 2);
  assert.equal(restored.session.exportReplay().commands[0].sequence, 0);
  for (let i = 0; i < 120; i++) restored.session.advance(BATTLE_STEP_MS, restored.sessionRuntime);
  const replay = restored.session.exportReplay(), hash = battleChecksum(restored.snapshot("A"));
  for (const delta of [1000 / 30, 1000 / 144]) {
    const played = createIndependentBattle(replay, { playback: replay });
    for (let i = 0; i < 1000 && !played.session.playbackComplete; i++) played.session.advance(delta, played.sessionRuntime);
    assert.equal(played.session.clock.tick, replay.endTick);
    assert.equal(battleChecksum(played.snapshot("A")), hash);
  }
  await f.host.close();
});

test("failed persistence publishes nothing and fails closed; retry on last committed world executes once", async () => {
  const f = await fixture(), before = f.stored;
  f.hook(() => { throw Error("disk full"); });
  assert.equal(f.client.request(deploy), true);
  await assert.rejects(f.host.receiveText(f.peer, f.inbound.shift()), /disk full/);
  assert.equal(f.outbound.length, 0); assert.equal(f.stored, before); assert.equal(f.host.available, false);
  await assert.rejects(f.host.advance(BATTLE_STEP_MS), /closed/);
  f.hook(undefined); await f.restart();
  assert.equal(state(f.stored).towers.length, 1); assert.equal(f.receipts.at(-1).result, "deployed");
  await f.host.close();
});

test("a persisted write with lost completion recovers the receipt instead of re-executing", async () => {
  const f = await fixture(); let uncertain;
  f.hook(text => { uncertain = text; throw Error("lost completion"); });
  f.client.request(deploy);
  await assert.rejects(f.host.receiveText(f.peer, f.inbound.shift()), /lost completion/);
  assert.equal(f.outbound.length, 0);
  f.hook(undefined); await f.restart(uncertain);
  assert.equal(state(f.stored).towers.length, 1); assert.equal(f.receipts.at(-1).result, "deployed");
  assert.equal(JSON.parse(f.stored).snapshot.cursor.sequence, 1);
  await f.host.close();
});

test("restart retains bounded receipt tails, conflict/expiry checks, and consumed rate limit", async () => {
  const f = await fixture();
  for (let i = 0; i < MAX_BATTLE_REQUESTS_PER_WINDOW; i++) await f.send(control({ type: "reserve", value: i }));
  assert.equal(JSON.parse(f.stored).authority.actors[0].receipts.length, 64);
  await f.restart();
  for (const [sequence, intent, reason] of [[0, control({ type: "reserve", value: 0 }), "expired"],
    [127, control({ type: "reserve", value: 999 }), "conflict"], [128, deploy, "busy"]]) {
    await f.host.receiveText(f.peer, envelope(JSON.parse(f.stored).stream, sequence, intent));
    assert.equal(f.outbound.at(-1).receipt.reason, reason); f.outbound.length = 0;
  }
  f.time(BATTLE_REQUEST_WINDOW_MS);
  await f.host.receiveText(f.peer, envelope(JSON.parse(f.stored).stream, 128, deploy));
  assert.equal(f.outbound.at(-1).receipt.result, "deployed");
  await f.host.close();
});

test("malformed or mismatched durable checkpoints are rejected before persistence", async () => {
  const f = await fixture(); await f.send(deploy); const valid = JSON.parse(f.stored);
  const changes = [v => v.version++, v => v.stream--, v => v.snapshot.checksum = "00000000",
    v => v.authority.battleId = "other", v => v.authority.tick++, v => v.authority.commandSequence++,
    v => v.authority.actors[0].id = "stranger", v => v.authority.actors[0].receipts[0].intent = "{}",
    v => v.authority.actors[0].receipts[0].receipt.commandSequence = 5, v => v.authority.actors[0].receipts = [],
    v => v.authority.actors[0].count = 999, v => v.authority.actors.push(v.authority.actors[0]), v => v.extra = true];
  for (const change of changes) {
    const altered = structuredClone(valid); change(altered);
    await assert.rejects(DurableBattleHost.restore(JSON.stringify(altered), { inputTime: () => 0,
      save: async () => assert.fail("invalid state reached storage") }));
  }
  await f.host.close();
});

test("bounded task queue and close stop ingress without abandoning earlier committed work", async () => {
  const f = await fixture(), block = gate(); f.hook(() => block.promise);
  const tasks = Array.from({ length: MAX_PENDING_HOST_TASKS }, () => f.host.advance(0));
  await assert.rejects(f.host.advance(0), /queue is full/);
  await assert.rejects(f.host.advance(Infinity), /Invalid host frame/);
  const close = f.host.close();
  await assert.rejects(f.host.advance(0), /closed/);
  block.resolve(); await Promise.all(tasks); await close;
  assert.equal(f.host.available, false);
});

test("paused states restore without losing authoritative controls", async () => {
  const f = await fixture(); await f.send(control({ type: "pause", paused: true }));
  await f.restart(); await f.host.advance(1000); await f.pump();
  assert.equal(state(f.stored).simulation.controls.paused, true); assert.equal(state(f.stored).simulation.clock.tick, 0);
  await f.send(control({ type: "pause", paused: false })); await f.host.advance(1000); await f.pump();
  assert.ok(state(f.stored).simulation.clock.tick > 0);
  await f.host.close();
});

test("terminal restart still returns prior receipts but rejects new actions without changing the world", async () => {
  const f = await fixture(); await f.send(deploy);
  const saved = JSON.parse(f.stored), decoded = decodeSyncMessage(saved.snapshot);
  const runtime = createIndependentBattle(decoded.replay, { checkpoint: decoded.replay.checkpoint });
  runtime.world.finish("victory");
  const data = runtime.snapshot("A");
  saved.snapshot.replay.checkpoint = encodeBattleWireGraph(captureBattleSnapshot(data));
  saved.snapshot.checksum = battleChecksum(data);
  await f.restart(JSON.stringify(saved));
  const before = state(f.stored);
  await f.host.receiveText(f.peer, envelope(JSON.parse(f.stored).stream, 0, deploy));
  assert.equal(f.outbound.at(-1).receipt.result, "deployed"); f.outbound.length = 0;
  const receipt = await f.send(control({ type: "debugChars" }));
  assert.equal(receipt.reason, "unavailable");
  await f.host.advance(1000); await f.pump();
  assert.deepEqual(state(f.stored).lifecycle, before.lifecycle);
  assert.equal(state(f.stored).chars, before.chars);
  assert.equal(state(f.stored).simulation.clock.tick, before.simulation.clock.tick);
  await f.host.close();
});

test("independent actors keep separate request sequences and permissions through restart", async () => {
  const config = options(); config.participants = [{ id: "local", permissions: ["build"] }, { id: "viewer", permissions: [] }];
  const f = await fixture(config), messages = [];
  let viewer = await f.host.connect("viewer", message => messages.push(message));
  await f.host.receiveText(viewer, envelope(messages[0].stream, 0, deploy));
  assert.equal(messages.at(-1).receipt.result, "forbidden");
  await f.send(deploy); await f.restart();
  messages.length = 0; viewer = await f.host.connect("viewer", message => messages.push(message));
  await f.host.receiveText(viewer, envelope(messages[0].stream, 0, deploy));
  assert.equal(messages.at(-1).receipt.result, "forbidden");
  assert.equal(state(f.stored).towers.length, 1);
  assert.equal(JSON.parse(f.stored).snapshot.cursor.sequence, 2);
  assert.equal(await f.host.connect("intruder", () => assert.fail("unauthenticated snapshot")), undefined);
  await f.host.close();
});

test("durable ownership survives restart and still rejects another authorized builder's upgrade", async () => {
  const config = options(); config.policy = { ...config.policy, towerAccess: "owner" };
  config.participants = [{ id: "local", permissions: ["build", "edit"] }, { id: "guest", permissions: ["build", "edit"] }];
  const f = await fixture(config); await f.send(deploy); await f.restart();
  const tower = state(f.stored).towers[0]; assert.equal(tower.ownerId, "local");
  const messages = [], guest = await f.host.connect("guest", message => messages.push(message));
  const before = JSON.parse(f.stored).snapshot.checksum;
  await f.host.receiveText(guest, envelope(messages[0].stream, 0, { type: "operation", operation: {
    ...deploy.operation, expected: { kind: "tower", id: tower.entityId } } }));
  assert.equal(messages.at(-1).receipt.result, "forbidden");
  assert.equal(JSON.parse(f.stored).snapshot.checksum, before);
  await f.host.close();
});

test("atomic file adapter bounds data and leaves no partial files after replacement", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "charset-host-"));
  try {
    const store = createBattleCheckpointStore(path.join(dir, "battle.json"), 100);
    assert.equal(await store.read(), undefined);
    await store.save("before"); await store.save("after"); assert.equal(await store.read(), "after");
    await assert.rejects(store.save("x".repeat(101))); assert.equal(await store.read(), "after");
    assert.deepEqual(await readdir(dir), ["battle.json"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("individual balances survive host restart without double-charging a retried deployment", async () => {
  const config = options();
  config.policy = { ...LEGACY_BATTLE_POLICY, towerAccess: "owner", walletMode: "individual" };
  config.participants = [{ id: "local", permissions: ["build", "debug"] }, { id: "guest", permissions: ["build"] }];
  const f = await fixture(config);
  await f.send(control({ type: "debugChars" }));
  const before = state(f.stored).wallets;
  await f.send(deploy);
  const saved = state(f.stored), spent = saved.wallets;
  assert.equal(spent.find(wallet => wallet.actorId === "guest").chars, before.find(wallet => wallet.actorId === "guest").chars);
  assert.ok(spent.find(wallet => wallet.actorId === "local").chars < before.find(wallet => wallet.actorId === "local").chars);
  await f.restart();
  assert.deepEqual(state(f.stored).wallets, spent);
  const stream = JSON.parse(f.stored).stream;
  await f.host.receiveText(f.peer, envelope(stream, 1, deploy)); await f.pump();
  assert.deepEqual(state(f.stored).wallets, spent);
  assert.equal(state(f.stored).towers.length, 1);
  await f.host.close();
});

test("independent decks, cooldowns and automatic-upgrade settings persist across host replacement", async () => {
  const config = options();
  config.policy = { ...LEGACY_BATTLE_POLICY, towerAccess: "owner", walletMode: "individual", resourceMode: "individual" };
  config.participants = [{ id: "local", permissions: ["build", "debug", "settings"] }, { id: "guest", permissions: ["build"] }];
  config.playerLoadouts = [{ actorId: "guest", cards: ["B", "X"] }, { actorId: "local", cards: ["B", "A"] }];
  const f = await fixture(config);
  await f.send(control({ type: "debugChars" })); await f.send(deploy);
  await f.send(control({ type: "reserve", value: 400 }));
  const messages = [], guest = await f.host.connect("guest", message => messages.push(message));
  await f.host.receiveText(guest, envelope(messages[0].stream, 0, { ...deploy,
    operation: { ...deploy.operation, cell: { lane: 4, column: 2 } } }));
  assert.equal(messages.at(-1).receipt.result, "deployed"); await f.pump();
  const saved = state(f.stored);
  assert.equal(saved.playerResources.find(player => player.actorId === "local").reserveChars, 400);
  assert.equal(saved.playerResources.find(player => player.actorId === "guest").reserveChars, 0);
  await f.restart();
  assert.deepEqual(state(f.stored).playerResources, saved.playerResources);
  assert.deepEqual(f.replica.players.get("guest").loadout.ids, ["B", "X"]);
  await f.host.receiveText(f.peer, envelope(JSON.parse(f.stored).stream, 1, deploy)); await f.pump();
  assert.deepEqual(state(f.stored).playerResources, saved.playerResources);
  assert.deepEqual(state(f.stored).wallets, saved.wallets);
  assert.equal(state(f.stored).towers.length, 2);
  await f.host.close();
});

test("a killed Node host restores its real flushed file in a new process with exactly-once deployment", { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "charset-host-process-")), filename = path.join(dir, "battle.json");
  const children = [];
  try {
    const worker = (stage, payload) => {
      const child = fork(new URL("./helpers/durable-host-worker.mjs", import.meta.url), [stage, filename], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
      children.push(child); let stderr = ""; child.stderr.on("data", data => stderr += data);
      const output = new Promise((resolve, reject) => {
        child.once("message", resolve); child.once("error", reject);
        child.once("exit", code => reject(Error(`worker exited before result (${code}): ${stderr}`)));
      });
      if (payload) child.send(payload);
      return { child, output };
    };
    const first = worker("crash"), saved = await first.output;
    assert.equal(saved.event, "persisted-unacknowledged");
    const exited = once(first.child, "exit"); first.child.kill(); await exited;
    const disk = await readFile(filename, "utf8"); assert.equal(state(disk).towers.length, 1);
    const second = worker("restore", saved.request), result = await second.output;
    assert.equal(result.towers, 1); assert.equal(result.sequence, 1); assert.equal(result.receipt.result, "deployed");
    assert.equal(result.chars, state(disk).chars); assert.ok(result.stream > JSON.parse(disk).stream);
    if (second.child.exitCode === null) await once(second.child, "exit");
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const ended = once(child, "exit"); child.kill(); await ended; }
    await rm(dir, { recursive: true, force: true });
  }
});
