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

test("0-5 follows the Shifter lesson without granting late-game cards", () => {
  const { levelNodes, getLevelConfig } = load("src/data/levels.ts");
  const index = levelNodes.findIndex(node => node.id === "0-4");
  assert.equal(levelNodes[index + 1].id, "0-5");
  assert.equal(getLevelConfig("0-5").specialMechanic, "tutorialDamage");
  assert.deepEqual(getLevelConfig("0-5").enemyKinds, []);
});
