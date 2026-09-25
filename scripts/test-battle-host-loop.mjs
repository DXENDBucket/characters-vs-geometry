import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { BattleHostLoop } = load("src/game/battleHostLoop.ts");
const { BattleClock, BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { DurableBattleHost } = load("src/game/durableBattleHost.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { BattleSyncClient } = load("src/game/battleSyncClient.ts");
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { decodeSyncMessage } = load("src/game/battleSyncProtocol.ts");
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function clock() {
  let time = 0, id = 0;
  const jobs = new Map();
  return { now: () => time, get size() { return jobs.size; },
    set(delay, callback) { jobs.set(++id, { at: time + delay, callback }); return id; },
    clear: id => jobs.delete(id),
    jump: value => { time = value; },
    async advance(delta) {
      const end = time + delta;
      for (let count = 0; ; count++) {
        assert.ok(count < 100, "Unbounded scheduled work");
        const entry = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!entry) break;
        time = Math.max(time, entry[1].at); jobs.delete(entry[0]); entry[1].callback(); await settle();
      }
      time = Math.max(time, end); await settle();
    }
  };
}
function fixture(settings = {}) {
  const time = clock(), battle = new BattleClock(), calls = [], failures = [];
  let paused = false, ended = false, speed = 1, hook = async () => {};
  const host = { available: true, get timing() { return { ...battle.snapshot(), paused, ended, speed }; },
    async advance(delta) { calls.push(delta); await hook(); battle.advance(delta * speed, () => {}); } };
  const loop = new BattleHostLoop(host, { scheduler: time, failed: error => failures.push(error), ...settings });
  return { time, loop, host, battle, calls, failures, hook: value => hook = value,
    pause: value => paused = value, end: () => ended = true, speed: value => speed = value };
}

test("host loop advances elapsed time with one timer and no repeated starts", async () => {
  const f = fixture(); f.loop.start(); f.loop.start();
  assert.equal(f.time.size, 1);
  await f.time.advance(1000);
  assert.equal(f.battle.tick, 60); assert.equal(f.calls.length, 10); assert.equal(f.time.size, 1);
  await f.loop.stop(); f.loop.start(); await f.time.advance(1000);
  assert.equal(f.battle.tick, 60); assert.equal(f.time.size, 0); assert.equal(f.loop.status, "stopped");
});

test("slow commits never enqueue another advance and their elapsed time is retained", async () => {
  const f = fixture(), blocked = gate(); f.hook(() => blocked.promise); f.loop.start();
  await f.time.advance(100); assert.equal(f.loop.busy, true); assert.equal(f.time.size, 0);
  await f.time.advance(350); assert.equal(f.calls.length, 1);
  blocked.resolve(); await settle(); assert.equal(f.time.size, 1);
  f.hook(async () => {}); await f.time.advance(3);
  assert.equal(f.calls[1], 351);
  assert.equal(f.battle.tick, 27); // 453 ms, including storage time, not three synthetic 100 ms frames.
  assert.ok(f.battle.snapshot().remainder < BATTLE_STEP_MS);
  assert.deepEqual(f.failures, []); await f.loop.stop();
});

test("accelerated play drains the twelve-tick cap without throwing away the clock remainder", async () => {
  const f = fixture(); f.speed(4); f.loop.start(); await f.time.advance(102);
  assert.ok(f.calls.length >= 2); assert.equal(f.battle.tick, 24);
  assert.ok(f.battle.snapshot().remainder < BATTLE_STEP_MS);
  assert.equal(f.calls.reduce((a, b) => a + b, 0), 101);
  await f.loop.stop();
});

test("paused and ended hosts do not persist idle frames or replay paused wall time", async () => {
  const f = fixture(); f.pause(true); f.loop.start(); await f.time.advance(2000);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.failures, []);
  f.pause(false); await f.time.advance(100); assert.equal(f.battle.tick, 6);
  f.end(); await f.time.advance(100); assert.equal(f.loop.status, "stopped"); assert.equal(f.time.size, 0);
});

test("shutdown waits for an in-flight commit but never schedules more work", async () => {
  const f = fixture(), blocked = gate(); f.hook(() => blocked.promise); f.loop.start();
  await f.time.advance(100);
  let stopped = false; const closing = f.loop.stop().then(() => { stopped = true; });
  await settle(); assert.equal(stopped, false);
  await f.time.advance(500); blocked.resolve(); await closing;
  assert.equal(f.time.size, 0); assert.equal(f.calls.length, 1); assert.equal(f.battle.tick, 6);
});

test("stop before a queued timer executes fences stale callbacks", async () => {
  const f = fixture();
  const set = f.time.set; let callback;
  f.time.set = (delay, run) => { callback = run; return set(delay, run); };
  f.loop.start(); await f.loop.stop();
  callback(); await settle(); await f.time.advance(200);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.failures, []);
  assert.equal(f.time.size, 0); assert.equal(f.loop.busy, false);
});

test("clock discontinuities, excess lag, unavailable hosts and failed advances stop explicitly", async () => {
  for (const fault of ["backward", "nan", "gap", "lag", "closed", "write"]) {
    const f = fixture({ maxLagMs: 500 }); f.loop.start();
    if (fault === "backward") f.time.now = () => -1;
    if (fault === "nan") f.time.now = () => NaN;
    if (fault === "gap") f.time.jump(1500);
    if (fault === "lag") f.battle.restore({ tick: 0, remainder: 450 });
    if (fault === "closed") f.host.available = false;
    if (fault === "write") f.hook(async () => { throw Error("disk failed"); });
    await f.time.advance(100);
    assert.equal(f.loop.status, "failed", fault); assert.equal(f.time.size, 0); assert.equal(f.failures.length, 1);
    assert.equal(f.battle.tick, 0); await f.loop.stop(); await f.time.advance(1000);
    assert.equal(f.failures.length, 1);
  }
  for (const options of [{ intervalMs: 0 }, { intervalMs: 1001 }, { intervalMs: NaN }, { maxLagMs: 10 }, { maxLagMs: Infinity }]) {
    assert.throws(() => fixture(options));
  }
  // A rollback after the commit must also fail, even if still later than the last start.
  const f = fixture(); f.hook(async () => f.time.jump(150)); f.loop.start();
  await f.time.advance(100); f.time.now = () => 120; await f.time.advance(100);
  assert.equal(f.loop.status, "failed"); assert.equal(f.failures.length, 1);
  assert.equal(f.calls.length, 1); await f.loop.stop();
});

test("real durable host exposes only committed timing and scheduled frames match a restored replica", async () => {
  const time = clock(), failures = [], outbound = [], inbound = [];
  let block, writes = 0, replica;
  const host = await DurableBattleHost.create("loop", { version: BATTLE_RULES_VERSION, levelId: "IF-1",
    difficultyVersion: 2, difficulty: 3, seed: 812, debug: false, unlimitedFirepower: false,
    selectedCards: ["A"], policy: LEGACY_BATTLE_POLICY }, {
    inputTime: time.now, save: async () => { writes++; if (block) await block.promise; }
  });
  const client = new BattleSyncClient({ restore: ({ replay }) => {
    replica = createIndependentBattle(replay, { replica: true, checkpoint: replay.checkpoint });
  }, follow: (tick, commands) => replica.session.followFrame(tick, commands, replica.sessionRuntime),
  checksum: () => battleChecksum(replica.snapshot("A")) });
  client.connect(message => inbound.push(JSON.stringify(message)));
  const peer = await host.connect("local", message => outbound.push(JSON.stringify(message)));
  const pump = async () => {
    for (let i = 0; i < 20; i++) {
      for (const text of outbound.splice(0)) assert.notEqual(client.receiveText(text), "invalid");
      for (const text of inbound.splice(0)) assert.equal(await host.receiveText(peer, text), true);
      if (!outbound.length && !inbound.length) return;
    }
    assert.fail("Sync did not settle");
  };
  const loop = new BattleHostLoop(host, { scheduler: time, failed: error => failures.push(error) });
  try {
    await pump(); block = gate(); loop.start();
    const original = host.timing; original.tick = 999;
    await time.advance(100); assert.equal(host.timing.tick, 0); assert.equal(outbound.length, 0);
    block.resolve(); block = undefined; await settle(); await pump();
    assert.equal(host.timing.tick, 6);
    await time.advance(500); await pump(); assert.equal(host.timing.tick, 36);
    assert.equal(battleChecksum(replica.snapshot("A")), JSON.parse(host.checkpointText).snapshot.checksum);
    assert.equal(client.request({ type: "control", control: { type: "pause", paused: true } }), true); await pump();
    const pausedWrites = writes; await time.advance(1000); assert.equal(writes, pausedWrites);
    assert.equal(client.request({ type: "control", control: { type: "pause", paused: false } }), true); await pump();
    await time.advance(100); await pump(); assert.equal(host.timing.tick, 42);
    const saved = decodeSyncMessage(JSON.parse(host.checkpointText).snapshot);
    const restored = createIndependentBattle(saved.replay, { checkpoint: saved.replay.checkpoint });
    assert.equal(battleChecksum(restored.snapshot("A")), battleChecksum(replica.snapshot("A")));
    assert.deepEqual(failures, []);
  } finally { block?.resolve(); await loop.stop(); client.dispose(); await host.close(); }
});

test("failed persistence never exposes speculative timing and stops the scheduling owner", async () => {
  const time = clock(), failures = [];
  let rejectWrite = false;
  const host = await DurableBattleHost.create("loop-failure", { version: BATTLE_RULES_VERSION, levelId: "IF-1",
    difficultyVersion: 2, difficulty: 3, seed: 813, debug: false, unlimitedFirepower: false,
    selectedCards: ["A"], policy: LEGACY_BATTLE_POLICY }, {
    inputTime: time.now, save: async () => { if (rejectWrite) throw Error("storage unavailable"); }
  });
  const saved = host.checkpointText, timing = host.timing;
  const loop = new BattleHostLoop(host, { scheduler: time, failed: error => failures.push(error.message) });
  try {
    rejectWrite = true; loop.start(); await time.advance(100); await settle();
    assert.equal(loop.status, "failed"); assert.equal(host.available, false);
    assert.equal(host.checkpointText, saved); assert.deepEqual(host.timing, timing);
    assert.deepEqual(failures, ["storage unavailable"]); assert.equal(time.size, 0);
  } finally { await loop.stop(); await host.close(); }
});
