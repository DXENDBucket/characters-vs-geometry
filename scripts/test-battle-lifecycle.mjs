import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { BattleWorld } = load("src/game/battleWorld.ts");
const { BattleRandom } = load("src/game/battleSimulation.ts");
const { copyBattleLifecycle, restoredBattleLifecycle } = load("src/game/battleLifecycle.ts");
const { getLevelConfig } = load("src/data/levels.ts");
const { getDifficultyConfig, BASE_INTEGRITY } = load("src/config.ts");
const makeWorld = (levelId = "1-1", unlimitedFirepower = false) => new BattleWorld({ levelId,
  level: getLevelConfig(levelId), difficulty: getDifficultyConfig(3), unlimitedFirepower }, new BattleRandom(9));

test("the first terminal result wins and ended worlds do not dispatch another step", () => {
  for (const first of ["victory", "defeat"]) {
    const world = makeWorld(); world.battleTime = 1200;
    assert.equal(world.finish(first), true);
    const saved = world.lifecycleSnapshot(), progress = world.progressSnapshot();
    assert.equal(saved.result.outcome, first); assert.equal(saved.result.endedAt, 1200);
    assert.equal(saved.result.flawless, first === "victory");
    assert.equal(world.finish("victory"), false); assert.equal(world.finish("defeat"), false);
    world.invalidateFlawless(); world.registerBreach();
    world.step(new Proxy({}, { get: () => assert.fail("Ended world dispatched a combat stage") }));
    assert.deepEqual(world.progressSnapshot(), progress); assert.equal(world.lifecycleSnapshot(), saved);
    assert.throws(() => { saved.result.outcome = "defeat"; }, TypeError);
    assert.throws(() => { saved.flawlessEligible = false; }, TypeError);
  }
});

test("loss, debug use and unlimited firepower cannot produce a flawless victory", () => {
  const breached = makeWorld(), debugged = makeWorld(), unlimited = makeWorld("1-1", true), endless = makeWorld("IF-1");
  breached.registerBreach(); debugged.invalidateFlawless();
  for (const world of [breached, debugged, unlimited, endless]) {
    world.finish("victory"); assert.equal(world.result.flawless, false);
  }
  const lost = makeWorld();
  for (let i = 0; i < BASE_INTEGRITY + 3; i++) lost.registerBreach();
  assert.equal(lost.baseIntegrity, 0); lost.finish("defeat");
  assert.equal(lost.result.flawless, false);
});

test("lifecycle survives restore without a new finish; legacy checkpoints cannot invent eligibility", () => {
  const original = makeWorld(); original.battleTime = 100;
  const clean = original.lifecycleSnapshot();
  original.invalidateFlawless();
  const dirty = original.lifecycleSnapshot();
  original.finish("victory");
  for (const state of [clean, dirty, original.lifecycleSnapshot()]) {
    const resumed = makeWorld(); resumed.battleTime = 100;
    const input = JSON.parse(JSON.stringify(state));
    resumed.restoreLifecycle(input, 100, BASE_INTEGRITY);
    assert.deepEqual(resumed.lifecycleSnapshot(), state);
    input.flawlessEligible = !input.flawlessEligible;
    assert.deepEqual(resumed.lifecycleSnapshot(), state);
    assert.equal(resumed.gameOver, state.result !== null);
  }
  assert.deepEqual(restoredBattleLifecycle(undefined, 100, BASE_INTEGRITY), { version: 1, flawlessEligible: false, result: null });
  assert.throws(() => restoredBattleLifecycle(undefined, 100, 0));
  assert.throws(() => makeWorld("1-1", true).restoreLifecycle(clean, 100, BASE_INTEGRITY), /configuration/);
});

test("lifecycle schema rejects malformed or impossible terminal states before mutating the world", () => {
  const world = makeWorld(), saved = world.lifecycleSnapshot();
  const victory = { outcome: "victory", endedAt: 0, flawless: true };
  for (const state of [null, [], {}, { ...saved, version: 2 }, { ...saved, extra: 1 },
    { ...saved, flawlessEligible: 1 }, { ...saved, result: undefined }, { ...saved, result: {} },
    { ...saved, result: { ...victory, extra: 1 } }, { ...saved, result: { ...victory, outcome: "pending" } },
    { ...saved, result: { ...victory, endedAt: 1 } }, { ...saved, result: { ...victory, endedAt: -1 } },
    { ...saved, result: { ...victory, endedAt: Infinity } }, { ...saved, result: { ...victory, flawless: 1 } },
    { ...saved, result: { ...victory, outcome: "defeat" } }, { ...saved, flawlessEligible: false, result: victory }]) {
    assert.throws(() => world.restoreLifecycle(state, 0, BASE_INTEGRITY));
    assert.equal(world.lifecycleSnapshot(), saved);
  }
  assert.throws(() => copyBattleLifecycle({ ...saved, result: victory }, 0, BASE_INTEGRITY - 1));
  assert.throws(() => copyBattleLifecycle({ ...saved, result: { ...victory, flawless: false } }, 0, 0));
});

test("terminal events retain the remainder of the current tick but not subsequent ticks", () => {
  const world = makeWorld(), stages = [];
  const systems = new Proxy({}, { get: (_, key) => {
    if (key === "hasTimedProducers") return false;
    if (key === "cardCooldownMultiplier") return () => 1;
    return () => { stages.push(key); if (key === "updateBoss") world.finish("defeat"); };
  } });
  world.step(systems);
  assert.ok(stages.includes("updateMortarProjectiles")); assert.ok(stages.includes("autoUpgrade"));
  const count = stages.length; world.step(systems); assert.equal(stages.length, count);
});

test("discovery observers are optional and isolated per battle owner", () => {
  const { setBattleDiscoveryObserver, observeBattleEnemy } = load("src/game/battleDiscovery.ts");
  const a = {}, b = {}, events = [];
  setBattleDiscoveryObserver(a, kind => events.push(["a", kind]));
  setBattleDiscoveryObserver(b, kind => events.push(["b", kind]));
  observeBattleEnemy(a, "circle"); observeBattleEnemy(b, "triangle");
  setBattleDiscoveryObserver(a); observeBattleEnemy(a, "square");
  assert.deepEqual(events, [["a", "circle"], ["b", "triangle"]]);
});

test("canonical combat checksums include eligibility and the terminal result", () => {
  const { battleChecksum } = load("src/game/battleChecksum.ts");
  const world = makeWorld();
  const hash = () => battleChecksum({ ...world.progressSnapshot(), lifecycle: world.lifecycleSnapshot() });
  const clean = hash(); world.invalidateFlawless(); const debug = hash(); world.finish("victory"); const ended = hash();
  assert.notEqual(clean, debug); assert.notEqual(debug, ended);
});

test("local profile settlement is separate, once-only, and disabled for replay/remote adapters", () => {
  const events = [], progress = {
    completeLevel: (...args) => { events.push(["complete", ...args]); return ["I"]; },
    isLevelCompleted: () => false,
    unlockedCardSlotCount: () => events.some(e => e[0] === "complete") ? 8 : 7,
    recordEnemySeen: (...args) => events.push(["enemy", ...args]),
    recordBossSeen: (...args) => events.push(["boss", ...args]),
    recordCompletedWaves: (...args) => events.push(["waves", ...args]),
    recordDefeatedBossRank: (...args) => events.push(["rank", ...args])
  };
  const { BattleProfile } = createTypeScriptLoader({ "src/progress.ts": progress,
    "src/survivalSaves.ts": { deleteSurvivalSave: id => events.push(["delete", id]) } })("src/battleProfile.ts");
  const victory = { outcome: "victory", endedAt: 1200, flawless: true }, defeat = { ...victory, outcome: "defeat", flawless: false };
  const readOnly = new BattleProfile(false, "IF-1", 3, true);
  readOnly.enemySeen("circle"); readOnly.bossSeen("cube"); readOnly.completedWaves(3); readOnly.defeatedBoss(2);
  readOnly.clearSurvivalSave(); readOnly.settle(victory); readOnly.settle(defeat);
  assert.deepEqual(events, []);
  const local = new BattleProfile(true, "2-4", 3, false);
  assert.deepEqual(local.settle(victory), { cards: ["I"], reselect: true, slots: { current: 8, total: 10 } });
  assert.deepEqual(local.settle(victory), { cards: [] }); local.settle(defeat);
  assert.deepEqual(events, [["complete", "2-4", { difficulty: 3, flawless: true }]]);
  const restored = new BattleProfile(true, "IF-1", 3, true);
  restored.restored(defeat); restored.settle(defeat); restored.settle(victory);
  assert.equal(events.length, 1);
  const loss = new BattleProfile(true, "IF-1", 3, true);
  loss.settle(defeat); loss.settle(defeat);
  assert.deepEqual(events.at(-1), ["delete", "IF-1"]); assert.equal(events.length, 2);
});
