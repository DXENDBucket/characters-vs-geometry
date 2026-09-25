import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { BattleSession } = load("src/game/battleSession.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { createBossState } = load("src/game/bossState.ts");
const { advanceBossPosition } = load("src/game/bossRules.ts");
const options = () => ({ version: BATTLE_RULES_VERSION, levelId: "1-10", difficulty: 3, difficultyVersion: 2,
  unlimitedFirepower: false, selectedCards: ["A", "B"], debug: false, seed: 42 });
const recording = (commands = [], endTick = 3) => ({ ...options(), commands: commands.map((entry, sequence) => ({ ...entry, sequence })), endTick });
const idle = { step() {}, executeCommand() {}, canAdvance: () => true };

test("session construction, commands and exports do not retain caller-owned mutable data", () => {
  const config = options(), session = new BattleSession(config);
  config.selectedCards.push("X");
  const command = { type: "reselect", cards: ["X"] };
  session.submit(command, applied => { applied.cards.push("D"); });
  command.cards.push("F");
  const replay = session.exportReplay();
  assert.deepEqual(replay.selectedCards, ["A", "B"]);
  assert.deepEqual(replay.commands, [{ tick: 0, sequence: 0, command: { type: "reselect", cards: ["X"] } }]);
  replay.commands.length = 0; replay.selectedCards.length = 0;
  assert.equal(session.exportReplay().commands.length, 1);
  const source = recording([{ tick: 0, command: { type: "reserve", value: 5 } }]);
  const playback = new BattleSession(options(), source);
  source.commands[0].command.value = 100;
  const seen = [];
  playback.advance(0, { ...idle, executeCommand: c => { seen.push(c.value); c.value = 999; } });
  assert.deepEqual(seen, [5]); assert.equal(playback.exportReplay().commands[0].command.value, 5);
});

test("same-tick input order is recorded and invalid or nested submissions cannot enter the log", () => {
  const session = new BattleSession(options()), order = [];
  session.submit({ type: "selectCard", id: "A" }, command => {
    assert.equal(session.executingCommand, true); order.push(command.type);
    assert.equal(session.submit({ type: "reserveConfirm" }, () => assert.fail()), false);
  });
  session.submit({ type: "reserve", value: 500 }, command => order.push(command.type));
  assert.deepEqual(order, ["selectCard", "reserve"]);
  assert.deepEqual(session.exportReplay().commands.map(c => [c.tick, c.sequence]), [[0, 0], [0, 1]]);
  assert.throws(() => session.submit({ type: "reserve", value: -1 }, () => assert.fail()));
  assert.equal(session.exportReplay().commands.length, 2);
  assert.equal(session.executingCommand, false);
  assert.throws(() => session.submit({ type: "reserveConfirm" }, () => { throw Error("handler"); }), /handler/);
  assert.equal(session.executingCommand, false);
});

test("playback applies commands before the first tick and after their matching tick, including endTick", () => {
  const replay = recording([
    { tick: 0, command: { type: "reserve", value: 10 } },
    { tick: 0, command: { type: "reserve", value: 20 } },
    { tick: 1, command: { type: "reserve", value: 30 } },
    { tick: 3, command: { type: "reserve", value: 40 } }
  ]);
  const session = new BattleSession(options(), replay), seen = [];
  const runtime = { step: () => seen.push(`tick:${session.clock.tick}`),
    executeCommand: c => seen.push(`input:${session.clock.tick}:${c.value}`), canAdvance: () => true };
  assert.equal(session.submit({ type: "reserveConfirm" }, () => assert.fail()), false);
  assert.equal(session.advance(1000, runtime), true);
  assert.deepEqual(seen, ["input:0:10", "input:0:20", "tick:1", "input:1:30", "tick:2", "tick:3", "input:3:40"]);
  assert.equal(session.playbackComplete, true); assert.equal(session.clock.tick, 3);
  assert.equal(session.advance(1000, runtime), false); assert.equal(seen.length, 7);
  const zero = new BattleSession(options(), recording([{ tick: 0, command: { type: "reserveConfirm" } }], 0));
  let calls = 0;
  assert.equal(zero.advance(100, { ...idle, executeCommand: () => calls++ }), false);
  assert.equal(calls, 1); assert.equal(zero.clock.tick, 0);
});

test("sessions have independent RNG and action queues and produce identical state across frame schedules", () => {
  function run(deltas) {
    const session = new BattleSession(options()), boss = createBossState("cube", 0), attacks = [];
    let time = 0, sum = 0;
    session.actions.schedule(0, 200, { type: "bossDeathLaser", boss, laneRadius: 2, hitCount: 1 });
    const runtime = { ...idle, step() {
      time += BATTLE_STEP_MS; sum += session.random.next();
      advanceBossPosition(boss, BATTLE_STEP_MS / 1000, 1, time);
      session.actions.update(time, action => attacks.push([time, action.boss.x]));
    } };
    for (const delta of deltas) session.advance(delta, runtime);
    while (session.snapshot().clock.remainder + 1e-7 >= BATTLE_STEP_MS) session.advance(0, runtime);
    return { tick: session.clock.tick, random: session.random.state, sum, boss, attacks, pending: session.actions.snapshot() };
  }
  const expected = run(Array(600).fill(1000 / 60));
  assert.deepEqual(run(Array(300).fill(1000 / 30)), expected);
  assert.deepEqual(run(Array(1440).fill(1000 / 144)), expected);
  assert.deepEqual(run([1, 500, 3, 9000, 496]), expected);
  assert.equal(expected.tick, 600); assert.equal(expected.attacks.length, 1);
  const a = new BattleSession(options()), b = new BattleSession(options());
  a.actions.schedule(0, 5, { type: "volley", hitCount: 1 }); a.random.next();
  assert.deepEqual(b.actions.snapshot(), []); assert.equal(b.random.state, 42);
});

test("pause and termination retain clock backlog; session advancement is not reentrant", () => {
  const session = new BattleSession(options());
  assert.equal(session.advance(1000, { ...idle, canAdvance: () => false }), false);
  assert.deepEqual(session.snapshot().clock, { tick: 0, remainder: 0 });
  let steps = 0;
  session.advance(100, { ...idle, step: () => steps++, canAdvance: () => steps < 1 });
  assert.equal(steps, 1); assert.equal(session.clock.tick, 1);
  session.advance(0, idle); assert.equal(session.clock.tick, 6);
  assert.throws(() => session.advance(BATTLE_STEP_MS, { ...idle, step: () => session.advance(1, idle) }), /already advancing/);
  assert.doesNotThrow(() => session.advance(BATTLE_STEP_MS, idle));
});

test("checkpoint restores clock remainder and RNG before subsequent simulation without changing action references", () => {
  const session = new BattleSession(options());
  session.advance(25, { ...idle, step: () => session.random.next() });
  const snapshot = JSON.parse(JSON.stringify(session.snapshot())), copy = new BattleSession(options());
  copy.restore(snapshot, 0);
  snapshot.clock.tick = 999; assert.notEqual(copy.clock.tick, 999);
  for (const delta of [0, 10, 400, 0, 0, 30]) {
    session.advance(delta, { ...idle, step: () => session.random.next() });
    copy.advance(delta, { ...idle, step: () => copy.random.next() });
    assert.deepEqual(copy.snapshot(), session.snapshot());
  }
  const tower = { id: "tower:1" };
  copy.actions.restore([{ at: 100, action: { type: "volley", tower, hitCount: 1 } }]);
  assert.equal(copy.actions.snapshot()[0].action.tower, tower);
});

test("invalid or incompatible session checkpoints are rejected before mutating clock or RNG", () => {
  const session = new BattleSession(options());
  session.advance(25, idle); const before = session.snapshot();
  for (const mutate of [s => s.version = 999, s => s.clock.tick = -1, s => s.clock.remainder = Infinity,
    s => s.randomState = -1, s => s.randomState = 2 ** 32, s => s.randomState = NaN, s => s.randomState = .1]) {
    const invalid = structuredClone(before); mutate(invalid);
    assert.throws(() => session.restore(invalid, 0));
    assert.deepEqual(session.snapshot(), before);
  }
  for (const time of [-1, NaN, Infinity]) assert.throws(() => session.restore(undefined, time));
  for (const version of [1, 2, 3, 4, 5, 6, BATTLE_RULES_VERSION]) {
    assert.doesNotThrow(() => session.restore({ ...before, version }, 0));
  }
  session.restore(undefined, 1001);
  assert.deepEqual(session.snapshot().clock, { tick: Math.floor(1001 / BATTLE_STEP_MS), remainder: 0 });
  assert.equal(session.random.state, before.randomState);
});

test("recording from a checkpoint clears old commands and replays only at or after that checkpoint", () => {
  const session = new BattleSession(options());
  session.submit({ type: "reserveConfirm" }, () => {});
  session.advance(BATTLE_STEP_MS * 5, idle);
  const graph = captureBattleSnapshot({ boss: createBossState("cube", 0) }), cards = ["X"];
  session.startRecordingFromCheckpoint(graph, cards);
  graph.nodes.length = 0; cards.push("D");
  session.submit({ type: "reserve", value: 50 }, () => {});
  const replay = session.exportReplay();
  assert.ok(replay.checkpoint.nodes.length > 0); assert.deepEqual(replay.selectedCards, ["X"]);
  assert.deepEqual(replay.commands, [{ tick: 5, sequence: 0, command: { type: "reserve", value: 50 } }]);
  const playback = new BattleSession(options(), replay);
  playback.restore(session.snapshot(), 0);
  let calls = 0;
  playback.advance(0, { ...idle, executeCommand: c => { calls++; assert.equal(c.value, 50); } });
  assert.equal(calls, 1);
  const before = playback.snapshot();
  assert.throws(() => playback.restore({ ...before, clock: { tick: 6, remainder: 0 } }, 0), /predates/);
  assert.deepEqual(playback.snapshot(), before);
  const early = new BattleSession(options(), recording([{ tick: 0, command: { type: "reserveConfirm" } }], 20));
  assert.throws(() => early.restore(session.snapshot(), 0), /predates/);
  assert.equal(early.clock.tick, 0);
});

test("logical checksums preserve the old algorithm, exclude cosmetics and never mutate supplied state", () => {
  const state = { simulation: { version: BATTLE_RULES_VERSION, clock: { tick: 10, remainder: 8 }, randomState: 42, mirrorNextGroupId: 1 },
    gameSpeed: 3, boss: { ...createBossState("cube", 0), rotationX: .1, rotationY: .2, rotationZ: .3,
      velocityX: .4, velocityY: .5, velocityZ: .6, targetVelocityX: .7, targetVelocityY: .8, targetVelocityZ: .9, nextTurnIn: 2 } };
  const before = structuredClone(state);
  const hash = battleChecksum(state); assert.deepEqual(state, before);
  const legacy = structuredClone(state); legacy.simulation.clock.remainder = 0; legacy.gameSpeed = 1;
  const graph = captureBattleSnapshot(legacy);
  const cosmetic = ["rotationX", "rotationY", "rotationZ", "velocityX", "velocityY", "velocityZ", "targetVelocityX", "targetVelocityY", "targetVelocityZ", "nextTurnIn"];
  for (const node of graph.nodes) if (node.kind === "boss") for (const key of cosmetic) delete node.data[key];
  let expected = 2166136261; const text = JSON.stringify(graph);
  for (let i = 0; i < text.length; i++) expected = Math.imul(expected ^ text.charCodeAt(i), 16777619);
  assert.equal(hash, (expected >>> 0).toString(16).padStart(8, "0"));
  state.gameSpeed = 6; state.simulation.clock.remainder = 100;
  for (const key of cosmetic) state.boss[key] = 999;
  assert.equal(battleChecksum(state), hash);
  for (const field of ["hp", "x", "armor"]) {
    const changed = structuredClone(state); changed.boss[field] += 1;
    assert.notEqual(battleChecksum(changed), hash);
  }
});
