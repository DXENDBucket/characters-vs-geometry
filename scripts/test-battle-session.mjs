import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { BattleSession } = load("src/game/battleSession.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { canonicalSaveGraph } = load("src/game/saveGraph.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { createBossState } = load("src/game/bossState.ts");
const { advanceBossPosition } = load("src/game/bossRules.ts");
const options = () => ({ version: BATTLE_RULES_VERSION, levelId: "1-10", difficulty: 3, difficultyVersion: 2,
  unlimitedFirepower: false, selectedCards: ["A", "B"], debug: false, seed: 42 });
const recording = (commands = [], endTick = 3) => ({ ...options(), commands: commands.map((entry, sequence) => ({ ...entry, sequence })), endTick });
const idle = { step() {}, executeCommand() {}, canAdvance: () => true };

test("replicas use authoritative ticks and same-tick controls, never local wall time or trusted submission", () => {
  const session = new BattleSession(options(), undefined, true), seen = [];
  assert.equal(session.advance(100000, idle), false);
  assert.equal(session.submit({ type: "control", actorId: "local", control: { type: "reserve", value: 3 } }, () => assert.fail()), false);
  session.controls.speed = 4;
  session.clock.restore({ tick: 0, remainder: 10000 });
  const command = (tick, sequence, paused) => ({ tick, sequence,
    command: { type: "control", actorId: "local", control: { type: "pause", paused } } });
  const runtime = { step: () => seen.push(session.clock.tick), canAdvance: () => true,
    executeCommand: command => { session.controls.paused = command.control.paused; } };
  session.followFrame(2, [command(0, 0, true), command(0, 1, false), command(2, 2, true)], runtime);
  assert.deepEqual(seen, [1, 2]); assert.equal(session.controls.paused, true);
  session.followFrame(3, [command(2, 3, false)], runtime);
  assert.deepEqual(seen, [1, 2, 3]); assert.equal(session.nextCommandSequence, 4);
  assert.deepEqual(session.clock.snapshot(), { tick: 3, remainder: 0 });
  assert.throws(() => new BattleSession(options()).followFrame(1, [], runtime), /unavailable/);
  assert.throws(() => new BattleSession(options(), recording(), true), /replica/);
});

test("invalid replica frames are rejected before changing state; runtime divergence fails closed for resync", () => {
  const session = new BattleSession(options(), undefined, true), before = session.snapshot();
  const entry = { tick: 0, sequence: 0, command: { type: "control", actorId: "local", control: { type: "reserve", value: 3 } } };
  for (const [tick, entries] of [[-1, []], [601, []], [1, [{ ...entry, sequence: 1 }]], [1, [{ ...entry, tick: 2 }]],
    [1, [{ ...entry, command: { type: "selectCard", id: "A" } }]], [1, [{ ...entry, command: { ...entry.command, actorId: "?" } }]],
    [1, Array(257).fill(entry)]]) {
    assert.throws(() => session.followFrame(tick, entries, idle));
    assert.deepEqual(session.snapshot(), before); assert.equal(session.nextCommandSequence, 0);
  }
  session.controls.paused = true;
  assert.throws(() => session.followFrame(1, [], idle), /cannot advance/);
  assert.equal(session.atBoundary, true);
  session.controls.paused = false;
  assert.throws(() => session.followFrame(1, [], { ...idle, step: () => session.followFrame(2, [], idle) }), /unavailable/);
  assert.equal(session.atBoundary, true);
});

test("sync checkpoint export does not reset command ordering, and range reads return independent bounded copies", () => {
  const session = new BattleSession(options());
  session.submit({ type: "control", actorId: "local", control: { type: "reserve", value: 3 } }, () => {});
  session.advance(BATTLE_STEP_MS, idle);
  const epoch = session.commandEpoch, before = session.exportReplay(), checkpoint = captureBattleSnapshot({ simulation: session.snapshot() });
  const exported = session.checkpointReplay(checkpoint, ["B"]);
  assert.deepEqual(exported.commands, []); assert.equal(exported.endTick, 1);
  assert.deepEqual(exported.selectedCards, ["B"]); assert.equal(session.commandEpoch, epoch);
  exported.checkpoint.nodes.length = 0;
  assert.ok(checkpoint.nodes.length > 0, "Borrowed checkpoints must still be copied");
  const entries = session.recordedCommands(0); entries[0].command.control.value = 10;
  assert.deepEqual(session.exportReplay(), before);
  for (const [from, limit] of [[-1, 1], [2, 1], [0, 257], [0, -1]]) assert.throws(() => session.recordedCommands(from, limit));
});

test("fresh checkpoint capture transfers only its detached graph and copies replay metadata", () => {
  const session = new BattleSession(options()), cards = ["B"];
  session.advance(BATTLE_STEP_MS, idle);
  const state = { simulation: session.snapshot(), chars: 123 }, graph = captureBattleSnapshot(state);
  const expected = session.checkpointReplay(graph, cards);
  let calls = 0;
  const actual = session.captureCheckpointReplay(() => { calls++; return graph; }, cards);
  assert.equal(calls, 1); assert.equal(actual.checkpoint, graph);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  state.chars = 999; cards.push("X");
  assert.deepEqual(actual.selectedCards, ["B"]);
  assert.equal(JSON.stringify(actual.checkpoint), JSON.stringify(expected.checkpoint));
  const before = session.exportReplay();
  actual.selectedCards.push("D"); actual.commands.push({ invalid: true }); actual.checkpoint.nodes.length = 0;
  assert.deepEqual(session.exportReplay(), before);
  const next = session.captureCheckpointReplay(() => captureBattleSnapshot(state), ["B"]);
  assert.ok(next.checkpoint.nodes.length > 0);
  assert.throws(() => session.captureCheckpointReplay(() => { throw Error("capture failed"); }, cards), /capture failed/);
  assert.deepEqual(session.exportReplay(), before);
});

test("the session owns pause and speed even when the scene runtime always permits ticking", () => {
  const session = new BattleSession(options()), other = new BattleSession(options());
  session.controls.speed = 2;
  session.advance(BATTLE_STEP_MS, idle); other.advance(BATTLE_STEP_MS, idle);
  assert.equal(session.clock.tick, 2); assert.equal(other.clock.tick, 1);
  session.controls.paused = true;
  const before = session.snapshot();
  for (const delta of [10000, 0, 50]) assert.equal(session.advance(delta, idle), false);
  assert.deepEqual(session.snapshot(), before);
  session.controls.paused = false; session.advance(BATTLE_STEP_MS, idle);
  assert.equal(session.clock.tick, 4, "paused wall time must not become simulation backlog");
  assert.equal(other.controls.paused, false); assert.equal(other.controls.speed, 1);
});

test("checkpoint controls are copied, validated atomically and have explicit legacy defaults", () => {
  const session = new BattleSession({ ...options(), debug: true });
  assert.equal(session.controls.debugEnabled, true);
  Object.assign(session.controls, { paused: true, speed: 2.5, autoUpgradeEnabled: false, reserveChars: 500 });
  const state = session.snapshot(), other = new BattleSession(options());
  const reference = other.controls;
  other.restore(state, 0);
  assert.equal(other.controls, reference); assert.deepEqual(other.controls, session.controls);
  state.controls.reserveChars = 1; assert.equal(other.controls.reserveChars, 500);
  const before = other.snapshot();
  for (const controls of [null, [], false, 0]) {
    assert.throws(() => other.restore({ ...before, controls }, 0), /controls/);
    assert.deepEqual(other.snapshot(), before);
  }
  for (const mutate of [c => c.paused = 1, c => c.speed = .1, c => c.speed = 2.55,
    c => c.speed = Infinity, c => c.reserveChars = -1, c => c.reserveChars = 1.5,
    c => c.autoUpgradeEnabled = 0, c => c.debugEnabled = "yes", c => c.extra = true, c => delete c.paused]) {
    const invalid = structuredClone(before); mutate(invalid.controls); invalid.clock.tick++;
    assert.throws(() => other.restore(invalid, 0), /controls/);
    assert.deepEqual(other.snapshot(), before);
  }
  const legacy = structuredClone(before); delete legacy.controls;
  other.restore(legacy, 0, { ...session.controls, paused: false });
  assert.equal(other.controls.paused, false); assert.equal(other.controls.speed, 2.5);
  other.restore(legacy, 0);
  assert.deepEqual(other.controls, { paused: false, speed: 1, autoUpgradeEnabled: true, reserveChars: 0, debugEnabled: false });
});

test("paused checkpoint replay drains same-tick commands and executes pending data actions exactly once", () => {
  const session = new BattleSession(options()), tower = { id: "tower:1" };
  session.advance(BATTLE_STEP_MS * 4, idle);
  session.controls.paused = true;
  const due = session.clock.tick * BATTLE_STEP_MS;
  session.actions.schedule(due, 0, { type: "volley", tower, hitCount: 2 });
  session.actions.schedule(due, 2 * BATTLE_STEP_MS, { type: "volley", tower, hitCount: 3 });
  const checkpoint = session.snapshot(), actions = session.actions.snapshot();
  session.startRecordingFromCheckpoint(captureBattleSnapshot({ simulation: checkpoint, actions }), ["A"]);
  const execute = (instance, command) => { instance.controls.paused = command.control.paused; };
  session.submit({ type: "control", actorId: "local", control: { type: "pause", paused: false } }, c => execute(session, c));
  const calls = [], runtime = (instance, events) => ({ ...idle, executeCommand: c => execute(instance, c),
    step: () => instance.actions.update(instance.clock.tick * BATTLE_STEP_MS, a => events.push(a.hitCount)) });
  session.advance(BATTLE_STEP_MS * 3, runtime(session, calls));
  assert.deepEqual(calls, [2, 3]);
  for (const delta of [1000 / 30, 1000 / 144]) {
    const replay = new BattleSession(options(), session.exportReplay()), played = [];
    replay.restore(checkpoint, 0); replay.actions.restore(actions);
    assert.equal(replay.controls.paused, true);
    for (let i = 0; i < 100 && !replay.playbackComplete; i++) replay.advance(delta, runtime(replay, played));
    assert.equal(replay.clock.tick, session.clock.tick); assert.deepEqual(played, calls);
    assert.deepEqual(replay.actions.snapshot(), []); assert.equal(replay.controls.paused, false);
  }
});

test("authoritative control snapshots affect checksums without changing caller-owned state", () => {
  const state = { simulation: new BattleSession(options()).snapshot() }, hash = battleChecksum(state);
  for (const [key, value] of Object.entries({ paused: true, speed: 2, autoUpgradeEnabled: false, reserveChars: 1, debugEnabled: true })) {
    const changed = structuredClone(state); changed.simulation.controls[key] = value;
    assert.notEqual(battleChecksum(changed), hash, key);
  }
  assert.equal(battleChecksum(state), hash);
});

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
  for (const version of [1, 2, 3, 4, 5, 6, 7, BATTLE_RULES_VERSION]) {
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

test("logical checksums hash canonical state, exclude cosmetics and never mutate supplied state", () => {
  const state = { simulation: { version: BATTLE_RULES_VERSION, clock: { tick: 10, remainder: 8 }, randomState: 42, mirrorNextGroupId: 1 },
    gameSpeed: 3, boss: { ...createBossState("cube", 0), rotationX: .1, rotationY: .2, rotationZ: .3,
      velocityX: .4, velocityY: .5, velocityZ: .6, targetVelocityX: .7, targetVelocityY: .8, targetVelocityZ: .9, nextTurnIn: 2 } };
  const before = structuredClone(state);
  const hash = battleChecksum(state); assert.deepEqual(state, before);
  const legacy = structuredClone(state); legacy.simulation.clock.remainder = 0; legacy.gameSpeed = 1;
  const graph = captureBattleSnapshot(legacy);
  const cosmetic = ["rotationX", "rotationY", "rotationZ", "velocityX", "velocityY", "velocityZ", "targetVelocityX", "targetVelocityY", "targetVelocityZ", "nextTurnIn"];
  for (const node of graph.nodes) if (node.kind === "boss") for (const key of cosmetic) delete node.data[key];
  let expected = 2166136261; const text = JSON.stringify(canonicalSaveGraph(graph));
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
