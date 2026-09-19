import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const storageKey = "characters-vs-geometry-progress-v1";

function fixture(saved) {
  const storage = new Map(saved ? [[storageKey, JSON.stringify(saved)]] : []);
  let writes = 0;
  const window = { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); writes++; },
    removeItem: key => storage.delete(key)
  } };
  const modules = new Map();
  function load(name) {
    const filename = path.resolve(root, name);
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    });
    new Function("require", "exports", "window", "navigator", outputText)(
      specifier => load(path.resolve(path.dirname(filename), `${specifier}.ts`)),
      exports, window, { language: "en" }
    );
    return exports;
  }
  return {
    progress: load("src/progress.ts"), visibility: load("src/encyclopediaVisibility.ts"),
    levels: load("src/data/levels.ts"), storage, writes: () => writes
  };
}

test("new saves show initial cards and tutorial enemies, but no future bosses or towers", () => {
  const { progress, visibility } = fixture();
  assert.deepEqual([...progress.discoveredEnemies().enemies], ["circle"]);
  assert.equal(progress.discoveredEnemies().bosses.size, 0);
  const entries = [
    { card: { id: "A" } }, { card: { id: "I" } },
    { enemyKind: "circle" }, { enemyKind: "square" }, { icon: "icosahedron" }
  ];
  assert.deepEqual(visibility.visibleEncyclopediaEntries(entries), [entries[0], entries[2]]);
});

test("newly unlocked stages expose their enemies before entry, and cards unlock at their configured clear", () => {
  const { progress, visibility } = fixture();
  progress.completeLevel("1-3");
  assert.equal(progress.isLevelUnlocked("1-4"), true);
  assert.equal(progress.isLevelCompleted("1-4"), false);
  assert.equal(progress.discoveredEnemies().enemies.has("square"), true);
  assert.deepEqual(visibility.visibleEncyclopediaEntries([{ card: { id: "I" } }, { card: { id: "J" } }]),
    [{ card: { id: "I" } }]);
  progress.completeLevel("1-9");
  assert.equal(progress.discoveredEnemies().bosses.has("cube2"), true);
});

test("encounters persist once per kind even without winning, and match series entries", () => {
  const f = fixture();
  f.progress.recordEnemySeen("hexSpellBulwark3");
  f.progress.recordBossSeen("octahedron2");
  f.progress.recordEnemySeen("hexSpellBulwark3");
  f.progress.recordBossSeen("octahedron2");
  assert.equal(f.writes(), 2);
  const reloaded = fixture(JSON.parse(f.storage.get(storageKey)));
  const entries = [{ enemyKind: "hexSpellBulwark" }, { icon: "octahedron" }, { icon: "tetrahedron" }];
  assert.deepEqual(reloaded.visibility.visibleEncyclopediaEntries(entries), entries.slice(0, 2));
});

test("old saves migrate without losing progress and malformed discovery values are ignored", () => {
  const { progress } = fixture({ version: 1, completedLevelIds: ["1-3"], allCardsUnlocked: false,
    seenEnemyKinds: ["circle", "circle", "missing", "__proto__", 42], seenBossKinds: "octahedron" });
  assert.equal(progress.isLevelCompleted("0-4"), true);
  assert.equal(progress.isCardUnlocked("I"), true);
  assert.equal(progress.discoveredEnemies().enemies.has("square"), true);
  assert.equal(progress.discoveredEnemies().enemies.has("missing"), false);
  assert.equal(progress.discoveredEnemies().bosses.size, 0);
});

test("card unlock cheat does not reveal enemies; clearing all stages includes every phase pool", () => {
  const { progress, levels } = fixture();
  progress.unlockAllCards();
  assert.equal(progress.isCardUnlocked("u"), true);
  assert.deepEqual([...progress.discoveredEnemies().enemies], ["circle"]);
  progress.completeAllLevels();
  const known = progress.discoveredEnemies();
  for (const node of levels.levelNodes) {
    const level = levels.getLevelConfig(node.id);
    for (const kind of level.enemyKinds) assert.ok(known.enemies.has(kind));
    for (const phase of level.bossPhases ?? []) {
      for (const kind of phase.enemyKinds) assert.ok(known.enemies.has(kind));
    }
    if (level.bossKind) assert.ok(known.bosses.has(level.bossKind));
  }
  progress.resetProgress();
  assert.equal(progress.isCardUnlocked("u"), false);
  assert.deepEqual([...progress.discoveredEnemies().enemies], ["circle"]);
});
