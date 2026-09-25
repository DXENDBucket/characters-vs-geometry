import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { BattleRandom, BattleClock, BATTLE_STEP_MS, BATTLE_RULES_VERSION, battleRandom, setBattleRandom } = load("src/game/battleSimulation.ts");
const { validateReplay } = load("src/game/battleCommands.ts");

test("battle RNG has a stable integer sequence, isolated streams and resumable state", () => {
  const random = new BattleRandom(123);
  assert.deepEqual(Array.from({ length: 5 }, () => random.next()), [
    0.7872516233474016, 0.1785435655619949, 0.49531551403924823, 0.23136196262203157, 0.375791602069512
  ]);
  const restored = new BattleRandom(random.state);
  assert.deepEqual(Array.from({ length: 100 }, () => random.between(0, 6)),
    Array.from({ length: 100 }, () => restored.between(0, 6)));
  const a = {}, b = {};
  setBattleRandom(a, new BattleRandom(42)); setBattleRandom(b, new BattleRandom(42));
  for (let i = 0; i < 100; i++) {
    Math.random();
    assert.equal(battleRandom(a).next(), battleRandom(b).next());
  }
});

test("fixed clock is frame-rate independent and never drops backlog ticks", () => {
  function simulate(deltas) {
    const clock = new BattleClock();
    const random = new BattleRandom(42);
    let sum = 0;
    for (const delta of deltas) clock.advance(delta, () => { sum += random.next(); });
    while (clock.snapshot().remainder + 1e-7 >= BATTLE_STEP_MS) clock.advance(0, () => { sum += random.next(); });
    return { tick: clock.tick, sum, random: random.state };
  }
  const expected = simulate(Array(600).fill(1000 / 60));
  assert.equal(expected.tick, 600);
  assert.deepEqual(simulate(Array(300).fill(1000 / 30)), expected);
  assert.deepEqual(simulate(Array(1440).fill(1000 / 144)), expected);
  assert.deepEqual(simulate([1, 500, 3, 9000, 496]), expected);
});

test("clock checkpoint preserves sub-tick time and bounded catch-up", () => {
  const clock = new BattleClock();
  clock.advance(25, () => {});
  const resumed = new BattleClock();
  resumed.restore(JSON.parse(JSON.stringify(clock.snapshot())));
  for (const delta of [5, 23, 400, 0, 0, 0]) {
    clock.advance(delta, () => {}); resumed.advance(delta, () => {});
    assert.deepEqual(clock.snapshot(), resumed.snapshot());
  }
  const paused = clock.tick;
  clock.advance(100, () => false);
  assert.equal(clock.tick, paused + 1);
  assert.throws(() => resumed.restore({ tick: -1, remainder: 0 }));
  assert.throws(() => resumed.restore({ tick: 0, remainder: Infinity }));
});

test("replay commands retain same-tick ordering and reject malformed input or incompatible rules", () => {
  const replay = { version: BATTLE_RULES_VERSION, seed: 42, endTick: 100, levelId: "1-1", difficulty: 3,
    unlimitedFirepower: false, debug: false, selectedCards: ["S"],
    commands: [
      { tick: 0, sequence: 0, command: { type: "selectCard", id: "S" } },
      { tick: 0, sequence: 1, command: { type: "pointer", pointer: { x: 300, y: 300, right: false, shift: false, ctrl: false } } },
      { tick: 10, sequence: 2, command: { type: "reserve", value: 500 } }
    ] };
  assert.doesNotThrow(() => validateReplay(JSON.parse(JSON.stringify(replay))));
  assert.throws(() => validateReplay({ ...replay, version: 1 }), "Old immediate-split replays are incompatible with delayed copies");
  assert.throws(() => validateReplay({ ...replay, version: 2 }), "Old rank-growth rules cannot be replayed under new weights");
  assert.throws(() => validateReplay({ ...replay, version: 3 }), "Old attack panels cannot be replayed under multiplier upgrades");
  assert.throws(() => validateReplay({ ...replay, version: 4 }), "Old manual-only skills cannot be replayed with automatic attachments");
  assert.throws(() => validateReplay({ ...replay, version: 5 }), "Tutorial IDs now refer to different operations");
  const { canRestoreBattleVersion } = load("src/game/battleSimulation.ts");
  for (const version of [1, 2, 3, 4, 5, 6, BATTLE_RULES_VERSION]) assert.equal(canRestoreBattleVersion(version), true);
  const { migrateDifficulty } = load("src/config.ts");
  for (let difficulty = 1; difficulty <= 8; difficulty++) {
    assert.doesNotThrow(() => validateReplay({ ...replay, difficulty }));
    assert.equal(migrateDifficulty(difficulty), difficulty - 1);
  }
  assert.throws(() => validateReplay({ ...replay, difficulty: 0 }), "removed legacy difficulty cannot be replayed faithfully");
  assert.throws(() => validateReplay({ ...replay, difficulty: 9 }), "rebalanced legacy difficulty cannot be replayed faithfully");
  for (let difficulty = 0; difficulty <= 9; difficulty++) {
    assert.doesNotThrow(() => validateReplay({ ...replay, difficulty, difficultyVersion: 2 }));
    assert.equal(migrateDifficulty(difficulty, 2), difficulty);
  }
  assert.throws(() => validateReplay({ ...replay, difficulty: 10, difficultyVersion: 2 }));
  assert.throws(() => validateReplay({ ...replay, difficultyVersion: 999 }));
  for (const mutate of [
    r => r.version++, r => r.seed = NaN, r => r.endTick = 2,
    r => r.commands[1].sequence = 0, r => r.commands[2].tick = -1,
    r => r.commands[1].command.pointer.x = Infinity,
    r => r.commands[1].command.type = "unknown",
    r => r.commands[2].command.value = -1
  ]) {
    const invalid = structuredClone(replay); mutate(invalid);
    assert.throws(() => validateReplay(invalid));
  }
});
