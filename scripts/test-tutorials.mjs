import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader();
const { damageLessons, damageLessonResult } = load("src/game/damageTutorialLessons.ts");
const { createTutorialController } = load("src/game/tutorialRegistry.ts");
const { copyTutorialCheckpoint } = load("src/game/tutorialState.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { BattleEntityIds } = load("src/game/battleEntityIds.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");

function fixture(kind, saved) {
  const data = saved ? structuredClone(saved) : { towers: [], enemies: [], time: 0, selected: [], tool: "none", ready: 1 };
  const events = [], ids = new BattleEntityIds();
  const model = createTutorialController(kind, {
    getTowers: () => data.towers, getEnemies: () => data.enemies, getBattleTime: () => data.time,
    getToolState: () => ({ eraserMode: data.tool === "erase", autoUpgradeMode: data.tool === "autoUpgrade",
      autoUpgradeEnabled: true, shifterMode: data.tool === "shifter", shifterReadyRatio: data.ready,
      shifterSelection: data.towers.filter(tower => data.selected.includes(tower.entityId)) }),
    spawnWave: spawns => { events.push(spawns); data.enemies.push(...structuredClone(spawns)); },
    finish: () => events.push("finish")
  });
  const add = (id, lane, column) => {
    const tower = createTowerState(cardDefinitions.find(card => card.id === id), lane, column, data.time, data.towers.length);
    ids.identify("tower", tower); data.towers.push(tower); return tower;
  };
  return { kind, data, events, model, add };
}

function checkpoint(f) {
  const state = JSON.parse(JSON.stringify(f.model.snapshot())), before = f.events.length;
  const restored = fixture(f.kind, f.data);
  restored.model.restore(state);
  assert.equal(f.events.length, before); assert.deepEqual(restored.events, []);
  assert.deepEqual(restored.model.snapshot(), state);
  // A restore derives visual instructions but never runs a lesson transition.
  const copy = copyTutorialCheckpoint({ state, interaction: { tool: f.data.tool, selected: f.data.selected } });
  assert.deepEqual(copy.state, state);
  f.model.update(); restored.model.update();
  assert.deepEqual(restored.model.snapshot(), f.model.snapshot());
  assert.deepEqual(restored.model.presentation, f.model.presentation);
  assert.deepEqual(restored.data, f.data);
  return restored;
}

test("all six lesson controllers and their state factories load without engine or DOM stubs", () => {
  for (const kind of ["tutorialBasics", "tutorialPractice", "tutorialTowerTypes", "tutorialAutoUpgrade", "tutorialShifter", "tutorialDamage"]) {
    const f = fixture(kind); checkpoint(f);
    assert.ok(f.model.presentation.copy.titleKey);
    const original = f.model.snapshot();
    for (const bad of [{ ...original, version: 2 }, { ...original, kind: "wrong" }, { ...original, extra: true }]) {
      assert.throws(() => f.model.restore(bad), /tutorial/i);
      assert.deepEqual(f.model.snapshot(), original);
    }
    f.model.destroy(); f.model.advance(); assert.deepEqual(f.model.snapshot(), original);
  }
});

test("basic lessons restore between every deployment and wave without spawning twice", () => {
  const f = fixture("tutorialBasics");
  f.model.advance(); checkpoint(f); assert.equal(f.model.step, "producer");
  f.add("X", 1, 1); checkpoint(f); assert.equal(f.model.step, "attacker");
  const a = f.add("A", 3, 2); checkpoint(f); assert.equal(f.model.step, "incomingReady");
  f.model.advance(); checkpoint(f); assert.equal(f.model.step, "firstWave"); assert.equal(f.events.length, 1);
  f.data.enemies.length = 0; checkpoint(f); assert.equal(f.model.step, "defender");
  f.add("B", 3, 5); checkpoint(f); f.model.advance(); checkpoint(f);
  assert.equal(f.model.step, "blockingWave"); assert.equal(f.events.length, 2);
  f.data.enemies.length = 0; checkpoint(f); a.level = 2; checkpoint(f); assert.equal(f.model.step, "reinforce");
  f.add("A", 2, 2); f.add("A", 4, 2); checkpoint(f); f.model.advance(); checkpoint(f);
  assert.equal(f.events[2].length, 3);
  f.data.enemies.length = 0; checkpoint(f); assert.equal(f.model.step, "complete");
  f.model.advance(); assert.equal(f.events.at(-1), "finish");
});

test("F/G lessons retain deleted tower identities and trap arming time across checkpoints", () => {
  const f = fixture("tutorialTowerTypes");
  f.model.advance(); checkpoint(f); f.model.advance(); checkpoint(f);
  const source = f.add("F", 3, 4); checkpoint(f); assert.equal(f.model.step, "fReady");
  f.model.advance(); checkpoint(f); assert.equal(f.events.length, 1);
  f.data.towers.length = 0; checkpoint(f); assert.equal(f.model.step, "fActive");
  assert.equal(f.model.snapshot().fTowerId, source.entityId);
  f.data.enemies.length = 0; checkpoint(f); assert.equal(f.model.step, "deployG");
  const g = f.add("G", 3, 7); checkpoint(f); assert.equal(f.model.step, "armingG");
  f.data.time = g.armedAt - 1; checkpoint(f); assert.equal(f.model.step, "armingG");
  f.data.time = g.armedAt; checkpoint(f); assert.equal(f.model.step, "gReady");
  f.model.advance(); checkpoint(f); f.data.enemies.length = 0; f.data.towers.length = 0;
  checkpoint(f); assert.equal(f.model.step, "complete");
});

test("practice wave gating and all damage demonstrations are explicit checkpoint state", () => {
  const practice = fixture("tutorialPractice"); checkpoint(practice);
  assert.equal(practice.model.usesWaveSchedule, false);
  practice.model.advance(); checkpoint(practice); assert.equal(practice.model.usesWaveSchedule, true);
  const damage = fixture("tutorialDamage"); checkpoint(damage); damage.model.advance();
  for (let index = 0; index < damageLessons.length; index++) {
    checkpoint(damage); assert.equal(damage.model.index, index); assert.equal(damage.model.fired, false);
    damage.model.advance(); checkpoint(damage); assert.equal(damage.model.fired, true);
    damage.model.advance();
  }
  checkpoint(damage); damage.model.advance(); assert.deepEqual(damage.events, ["finish"]);
});

test("auto-upgrade lesson references cannot attach to a replacement tower in the same cell", () => {
  const f = fixture("tutorialAutoUpgrade"); f.model.advance();
  const a = f.add("A", 3, 4); f.add("A", 4, 4); checkpoint(f);
  f.data.tool = "autoUpgrade"; checkpoint(f);
  a.autoUpgrade = true; checkpoint(f); a.level = 2; checkpoint(f);
  assert.equal(f.model.step, "controls"); f.model.advance();
  f.data.towers[1].autoUpgrade = true; checkpoint(f); assert.equal(f.model.step, "batchClear");
  for (const tower of f.data.towers) tower.autoUpgrade = false;
  checkpoint(f); f.data.tool = "erase"; checkpoint(f); assert.equal(f.model.step, "erase");
  f.data.towers.shift(); f.add("A", 3, 4);
  checkpoint(f); assert.equal(f.model.step, "complete");
});

test("tutorial checkpoint validation bounds references and includes lesson observations in checksums", () => {
  const valid = { state: { version: 1, kind: "tutorialShifter", step: "multiMove",
    singleTowerId: "tower:1", groupATowerId: "tower:2", groupBTowerId: "tower:3" },
    interaction: { tool: "shifter", selected: ["tower:2", "tower:3"] } };
  copyTutorialCheckpoint(valid);
  const hash = battleChecksum({ tutorial: valid });
  for (const mutate of [c => c.state.step = "complete", c => c.interaction.selected.reverse()]) {
    const changed = structuredClone(valid); mutate(changed);
    assert.notEqual(battleChecksum({ tutorial: changed }), hash);
  }
  for (const mutate of [c => c.state.step = "unknown", c => c.state.groupATowerId = "enemy:2",
    c => c.state.groupBTowerId = {}, c => c.interaction.selected.push("tower:2"), c => c.interaction.extra = 1,
    c => c.state = { version: 1, kind: "tutorialDamage", index: -1, fired: true }]) {
    const invalid = structuredClone(valid); mutate(invalid); assert.throws(() => copyTutorialCheckpoint(invalid));
  }
  const copy = copyTutorialCheckpoint(valid); copy.interaction.selected.length = 0;
  assert.equal(valid.interaction.selected.length, 2);
});

test("damage lab uses combat defenses and resolves each hit separately", () => {
  assert.deepEqual(damageLessons.map(lesson => damageLessonResult(lesson).total), [100, 40, 200, 400, 40]);
  const magic = damageLessons.find(lesson => lesson.id === "magic");
  assert.equal(damageLessonResult({ ...magic, resistance: 100 }).total, 20);
  const pure = damageLessons.find(lesson => lesson.id === "true");
  assert.equal(damageLessonResult({ ...pure, armor: 10000, resistance: 10000 }).total, 400);
});

test("0-6 follows the Shifter lesson without granting late-game cards", () => {
  const { levelNodes, getLevelConfig } = load("src/data/levels.ts");
  const index = levelNodes.findIndex(node => node.id === "0-5");
  assert.equal(levelNodes[index + 1].id, "0-6");
  assert.equal(getLevelConfig("0-6").specialMechanic, "tutorialDamage");
  assert.deepEqual(getLevelConfig("0-6").enemyKinds, []);
});

test("0-2 is a five-wave single-lane practice with unmultiplied flag weight and a fixed loadout", () => {
  const real = createTypeScriptLoader();
  const { levelNodes, getLevelConfig } = real("src/data/levels.ts");
  const { tutorialLoadout } = real("src/game/tutorialRegistry.ts");
  const { waveWeightLimit, waveScheduleAction } = real("src/game/waves.ts");
  const { getDifficultyConfig } = real("src/config.ts");
  const level = getLevelConfig("0-2");
  assert.deepEqual(levelNodes.filter(node => node.id.startsWith("0-")).map(node => node.id),
    ["0-1", "0-2", "0-3", "0-4", "0-5", "0-6"]);
  assert.equal(level.specialMechanic, "tutorialPractice");
  assert.deepEqual(level.enemyKinds, ["circle", "triangle"]);
  assert.deepEqual(level.spawnLanes, [3]); assert.deepEqual(level.deployableLanes, [3]);
  assert.deepEqual(tutorialLoadout(level.specialMechanic, ["S"]), ["A", "X", "B"]);
  assert.equal(level.totalWaves, 5); assert.equal(level.startingChars, 350);
  assert.deepEqual([1, 2, 3, 4, 5].map(wave => waveWeightLimit(level, getDifficultyConfig(1), wave)), [10, 15, 20, 25, 30]);
  assert.equal(waveScheduleAction(level, 5, null, 1, 999999), "wait");
  assert.equal(waveScheduleAction(level, 5, null, 0, 999999), "complete");
  assert.deepEqual([3, 4, 5, 6].map(id => getLevelConfig(`0-${id}`).specialMechanic),
    ["tutorialTowerTypes", "tutorialAutoUpgrade", "tutorialShifter", "tutorialDamage"]);
});
