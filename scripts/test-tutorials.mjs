import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader();
const { damageLessons, damageLessonResult } = load("src/game/damageTutorialLessons.ts");

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
  const real = createTypeScriptLoader({ phaser: { default: {} } });
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
