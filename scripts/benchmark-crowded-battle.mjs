import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { load, captureBattleSnapshot, battleChecksum } from "./helpers/battle-runtime.mjs";
import { populateCrowdedBattle, crowdedCensus, CROWDED_CARDS } from "./helpers/crowded-battle.mjs";
import { legacyEncodeBattleWireGraph } from "./helpers/legacy-battle-wire.mjs";

const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { BattleAuthority, BATTLE_PROTOCOL_VERSION } = load("src/game/battleAuthority.ts");
const { BattleSyncHost } = load("src/game/battleSyncHost.ts");
const { BattleSyncClient } = load("src/game/battleSyncClient.ts");
const { DurableBattleHost } = load("src/game/durableBattleHost.ts");
const { encodeBattleWireGraph, decodeBattleWireGraph } = load("src/game/battleWireGraph.ts");
const { canonicalSaveGraph } = load("src/game/saveGraph.ts");
const { classifyBattleData } = load("src/game/battleDataSchema.ts");
const { parseBattleEntityId } = load("src/game/battleEntityIds.ts");
const legacyWire = graph => legacyEncodeBattleWireGraph(graph, { canonicalSaveGraph, classifyBattleData, parseBattleEntityId });
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const config = load("src/config.ts");
const { createBattleCheckpointStore } = createRequire(import.meta.url)("../electron/battle-checkpoint.cjs");
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split("=")[1];
const counts = (arg("counts") ?? "100,400,800").split(",").map(Number);
const samples = Number(arg("samples") ?? 12);
assert.ok(counts.every(n => Number.isSafeInteger(n) && n > 0 && n <= 5000));
assert.ok(Number.isSafeInteger(samples) && samples >= 3 && samples <= 100);
const hash = runtime => battleChecksum(runtime.snapshot(CROWDED_CARDS[0]));
const capture = runtime => captureBattleSnapshot(runtime.snapshot(CROWDED_CARDS[0]));
const legacyReplay = runtime => runtime.session.checkpointReplay(capture(runtime), runtime.world.loadout.ids);
const replay = runtime => runtime.session.captureCheckpointReplay(() => capture(runtime), runtime.world.loadout.ids);
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], maxMs: sorted.at(-1) };
};
function measure(run) {
  for (let i = 0; i < 3; i++) run();
  const values = [];
  for (let i = 0; i < samples; i++) { const start = performance.now(); run(); values.push(performance.now() - start); }
  return summary(values);
}

// Real codecs and independent replica, but in-process transport: no network/renderer timings.
function attachReplica(connect) {
  let replica;
  const outbound = [], upstream = [];
  const client = new BattleSyncClient({ restore: ({ replay }) => {
    replica = createIndependentBattle(replay, { replica: true, checkpoint: replay.checkpoint });
  }, follow: (tick, commands) => replica.session.followFrame(tick, commands, replica.sessionRuntime),
  checksum: () => hash(replica), receipt: () => {} });
  client.connect(message => upstream.push(message));
  const joined = connect(message => outbound.push(JSON.stringify(message)));
  const drain = () => {
    let bytes = 0;
    for (const text of outbound.splice(0)) {
      bytes += Buffer.byteLength(text);
      assert.notEqual(client.receiveText(text), "invalid");
    }
    assert.deepEqual(upstream, [], "Unexpected divergence/resync request");
    assert.ok(client.ready);
    return bytes;
  };
  return { joined, drain, client, get replica() { return replica; } };
}

const dir = await mkdtemp(path.join(tmpdir(), "charset-crowded-"));
try {
  console.log(JSON.stringify({ diagnostic: "Synthetic mixed Node battle. Not browser FPS or network latency.",
    node: process.version, platform: process.platform, samples }));
  for (const count of counts) {
    const options = { version: BATTLE_RULES_VERSION, difficultyVersion: config.DIFFICULTY_VERSION,
      levelId: "5-10", difficulty: 3, seed: 178, debug: false, unlimitedFirepower: false,
      selectedCards: CROWDED_CARDS, policy: LEGACY_BATTLE_POLICY };
    const runtime = createIndependentBattle(options);
    populateCrowdedBattle(runtime, count, config);
    for (let i = 0; i < 180; i++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
    assert.equal(runtime.world.gameOver, false);
    const initial = crowdedCensus(runtime), graph = capture(runtime), wire = encodeBattleWireGraph(graph);
    assert.equal(JSON.stringify(wire), JSON.stringify(legacyWire(graph)), "Wire bytes changed");
    const checkpoint = replay(runtime);
    assert.equal(JSON.stringify(checkpoint), JSON.stringify(legacyReplay(runtime)), "Replay bytes changed");
    const authority = new BattleAuthority("profile", runtime.session, { inputTime: () => 0,
      available: () => !runtime.world.gameOver, execute: command => runtime.executeCommand(command) });
    const ledger = authority.snapshot();
    const saved = JSON.stringify({ version: 1, stream: 0, authority: ledger, snapshot: {
      type: "snapshot", version: BATTLE_PROTOCOL_VERSION, battleId: "profile", stream: 1,
      cursor: { tick: ledger.tick, sequence: ledger.commandSequence }, nextRequest: 0,
      replay: { ...checkpoint, checkpoint: wire }, checksum: hash(runtime) } });
    const staticCosts = { capture: measure(() => capture(runtime)), checksum: measure(() => hash(runtime)),
      legacyReplay: measure(() => legacyReplay(runtime)), replay: measure(() => replay(runtime)),
      legacyEncode: measure(() => legacyWire(graph)), encode: measure(() => encodeBattleWireGraph(graph)),
      decode: measure(() => decodeBattleWireGraph(wire)) };
    const sync = new BattleSyncHost(runtime.session, authority, { inputTime: () => 0,
      checkpoint: () => replay(runtime), checksum: () => hash(runtime) });
    const replica = attachReplica(send => sync.connect("local", send));
    const joinStart = performance.now(), joinBytes = replica.drain(), joinMs = performance.now() - joinStart;
    const ticks = [], publishes = [], applies = [];
    let frameBytes = 0;
    try {
      for (let i = 0; i < samples; i++) {
        for (let tick = 0; tick < 6; tick++) {
          const start = performance.now(); runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
          ticks.push(performance.now() - start);
        }
        let start = performance.now(); sync.publish(false); publishes.push(performance.now() - start);
        start = performance.now(); frameBytes += replica.drain(); applies.push(performance.now() - start);
        assert.equal(hash(replica.replica), hash(runtime));
      }
    } finally { replica.client.dispose(); sync.close(); authority.close(); }
    const durable = [];
    for (const batch of [1, 6]) {
      const store = createBattleCheckpointStore(path.join(dir, `${count}-${batch}.json`));
      const writes = [], advances = [], replicas = [];
      const host = await DurableBattleHost.restore(saved, { inputTime: () => 0, save: async text => {
        const start = performance.now(); await store.save(text); writes.push(performance.now() - start);
      } });
      const client = attachReplica(send => host.connect("local", send));
      try {
        await client.joined; client.drain(); writes.length = 0;
        for (let i = 0; i < samples; i++) {
          let start = performance.now(); await host.advance(BATTLE_STEP_MS * batch); advances.push(performance.now() - start);
          start = performance.now(); client.drain(); replicas.push(performance.now() - start);
        }
        // Force publication even if the final sample ended between the six-tick frame cadence.
        await host.advance(BATTLE_STEP_MS * 6); client.drain(); writes.pop();
        const persisted = JSON.parse(await store.read());
        assert.equal(hash(client.replica), persisted.snapshot.checksum);
        durable.push({ ticksPerCommit: batch, advance: summary(advances), atomicWrite: summary(writes),
          clientApply: summary(replicas), checkpointBytes: Buffer.byteLength(host.checkpointText) });
      } finally { client.client.dispose(); await host.close(); }
    }
    console.log(JSON.stringify({ requestedEnemies: count, initial, final: crowdedCensus(runtime),
      wireBytes: Buffer.byteLength(JSON.stringify(wire)), staticCosts,
      synchronization: { joinBytes, clientJoinMs: joinMs, frameBytes,
        tick: summary(ticks), publish: summary(publishes), clientApplySixTicks: summary(applies) }, durable }));
  }
} finally { await rm(dir, { recursive: true, force: true }); }
