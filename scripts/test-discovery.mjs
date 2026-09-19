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

test("IF-1 requires clearing 1-9 independently of main-story ordering or card unlocks", () => {
  const { progress } = fixture();
  assert.equal(progress.isChapterGroupUnlocked("main"), true);
  assert.equal(progress.isChapterGroupUnlocked("infinite"), false);
  assert.equal(progress.isChapterUnlocked("IF"), false);
  assert.equal(progress.isChapterUnlocked("IFB"), false);
  assert.equal(progress.isLevelUnlocked("IF-1"), false);
  progress.unlockAllCards();
  progress.completeLevel("1-8");
  progress.completeLevel("5-10");
  assert.equal(progress.isLevelUnlocked("IF-1"), false);
  progress.completeLevel("1-9");
  assert.equal(progress.isChapterGroupUnlocked("infinite"), true);
  assert.equal(progress.isChapterUnlocked("IF"), true);
  assert.equal(progress.isChapterUnlocked("IFB"), true);
  assert.equal(progress.isLevelUnlocked("IF-1"), true);
  assert.equal(progress.isLevelUnlocked("1-10"), true);
  assert.equal(progress.isLevelUnlocked("not-a-level"), false);
  progress.resetProgress();
  assert.equal(progress.isChapterGroupUnlocked("infinite"), false);
  assert.equal(progress.isLevelUnlocked("IF-1"), false);
});

test("survival records persist as best completed waves, never as cleared stages", () => {
  const f = fixture();
  f.progress.completeAllLevels();
  assert.equal(f.progress.isLevelUnlocked("IF-1"), true);
  assert.equal(f.progress.isLevelCompleted("IF-1"), false);
  f.progress.completeLevel("IF-1");
  assert.equal(f.progress.isLevelCompleted("IF-1"), false);
  assert.equal(f.progress.isChapterCompleted("IF"), false);
  assert.equal(f.progress.getProgressSummary().completedLevels, f.progress.getProgressSummary().totalLevels);
  f.progress.recordCompletedWaves("IF-1", 12);
  const writes = f.writes();
  for (const count of [12, 3, -1, NaN, Infinity, 3.5]) f.progress.recordCompletedWaves("IF-1", count);
  assert.equal(f.writes(), writes);
  const reloaded = fixture(JSON.parse(f.storage.get(storageKey)));
  assert.equal(reloaded.progress.bestWaveForLevel("IF-1"), 12);
  reloaded.progress.resetProgress();
  assert.equal(reloaded.progress.bestWaveForLevel("IF-1"), 0);
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

test("unregistered enemy ranks survive save reload and reveal their family entry", () => {
  const f = fixture();
  f.progress.recordEnemySeen("triangle100");
  f.progress.recordEnemySeen("heart10000");
  const saved = JSON.parse(f.storage.get(storageKey));
  saved.seenEnemyKinds.push("triangle-1", "triangle1.5", "triangle01", "cube100");
  const reloaded = fixture(saved);
  assert.ok(reloaded.progress.discoveredEnemies().enemies.has("triangle100"));
  assert.ok(reloaded.progress.discoveredEnemies().enemies.has("heart10000"));
  assert.ok(!reloaded.progress.discoveredEnemies().enemies.has("cube100"));
  assert.deepEqual(reloaded.visibility.visibleEncyclopediaEntries([{ enemyKind: "triangle" }, { enemyKind: "heart" }, { enemyKind: "hexagon" }]),
    [{ enemyKind: "triangle" }, { enemyKind: "heart" }]);
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
