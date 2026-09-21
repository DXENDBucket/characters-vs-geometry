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

test("the first ASCII character unlocks only after clearing AE-1", () => {
  const { progress } = fixture();
  assert.equal(progress.isCardUnlocked("#"), false);
  progress.completeLevel("4-10");
  assert.equal(progress.isCardUnlocked("#"), false);
  progress.completeLevel("AE-1");
  assert.equal(progress.isCardUnlocked("#"), true);
});

test("continuous-fire attachment unlocks only after clearing AE-5", () => {
  const { progress } = fixture();
  assert.equal(progress.isCardUnlocked("!"), false);
  progress.completeLevel("AE-4");
  assert.equal(progress.isCardUnlocked("!"), false);
  progress.completeLevel("AE-5");
  assert.equal(progress.isCardUnlocked("!"), true);
});

test("imitator unlocks at AE-6 and cannot bypass target unlocks or price limits", () => {
  const { progress } = fixture();
  assert.equal(progress.isCardUnlocked("?"), false);
  assert.equal(progress.isCardUnlocked("?A"), false);
  progress.completeLevel("AE-6");
  assert.equal(progress.isCardUnlocked("?"), true);
  assert.equal(progress.isCardUnlocked("?A"), true);
  assert.equal(progress.isCardUnlocked("?b"), false);
  progress.completeLevel("4-1");
  assert.equal(progress.isCardUnlocked("?b"), true);
  progress.unlockAllCards();
  for (const id of ["?@", "?&", "?m", "?U", "??A", "?unknown"]) assert.equal(progress.isCardUnlocked(id), false, id);
});

test("AE-3 reveals Equals and unlocks number towers; AE-4 unlocks + and &", () => {
  const { progress } = fixture();
  assert.equal(progress.isLevelUnlocked("AE-3"), false);
  assert.equal(progress.isCardUnlocked("+"), false);
  assert.equal(progress.discoveredEnemies().enemies.has("equals"), false);
  progress.completeLevel("4-10");
  progress.completeLevel("AE-1");
  assert.equal(progress.discoveredEnemies().enemies.has("equals"), false);
  progress.completeLevel("AE-2");
  assert.equal(progress.isLevelUnlocked("AE-3"), true);
  assert.equal(progress.discoveredEnemies().enemies.has("equals"), true);
  assert.equal(progress.isCardUnlocked("+"), false);
  progress.completeLevel("AE-3");
  assert.equal(progress.isCardUnlocked("+"), false);
  assert.equal(progress.isCardUnlocked("="), true);
  assert.equal(progress.isCardUnlocked("1"), true);
  assert.equal(progress.isLevelUnlocked("AE-4"), true);
  assert.equal(progress.isCardUnlocked("&"), false);
  progress.completeLevel("AE-4");
  assert.equal(progress.isCardUnlocked("+"), true);
  assert.equal(progress.isCardUnlocked("&"), true);
});

test("enemy encyclopedia groups preserve origins and hide undiscovered groups", () => {
  const { progress, visibility } = fixture();
  const entries = [{ enemyKind: "circle" }, { enemyKind: "tilde", chapterGroupId: "ascii" }, { icon: "cube" }];
  const groups = () => visibility.visibleEnemyEncyclopediaGroups(visibility.visibleEncyclopediaEntries(entries)).map(group => group.id);
  assert.deepEqual(groups(), ["main"]);
  progress.completeLevel("4-10");
  assert.deepEqual(groups(), ["main", "ascii"]);
  assert.equal(visibility.enemyEncyclopediaGroup(entries[0]), "main");
  assert.equal(visibility.enemyEncyclopediaGroup(entries[1]), "ascii");
  assert.equal(visibility.enemyEncyclopediaGroup(entries[2]), "main");
  progress.completeLevel("1-9");
  assert.deepEqual(groups(), ["main", "ascii"]);
  progress.resetProgress();
  assert.deepEqual(groups(), ["main"]);
});

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
  assert.equal(progress.isLevelUnlocked("IF-2"), false);
  progress.completeLevel("2-4");
  assert.equal(progress.isLevelUnlocked("IF-2"), true);
  assert.equal(progress.isLevelUnlocked("IF-3"), false);
  assert.equal(progress.isLevelUnlocked("IF-4"), false);
  progress.completeLevel("3-9");
  assert.equal(progress.isLevelUnlocked("IF-4"), true);
  assert.equal(progress.isLevelUnlocked("IF-3"), false);
  progress.completeLevel("2-9");
  assert.equal(progress.isLevelUnlocked("IF-3"), true);
  assert.equal(progress.isLevelUnlocked("1-10"), true);
  assert.equal(progress.isLevelUnlocked("not-a-level"), false);
  progress.resetProgress();
  assert.equal(progress.isChapterGroupUnlocked("infinite"), false);
  assert.equal(progress.isLevelUnlocked("IF-1"), false);
});

test("IF-5 through IF-12 unlock only after their corresponding story stages", () => {
  const { progress } = fixture();
  progress.completeLevel("1-9");
  for (const [index, source] of ["4-1", "4-4", "4-6", "4-7", "5-2", "5-4", "5-6", "5-7"].entries()) {
    const id = `IF-${index + 5}`;
    assert.equal(progress.isLevelUnlocked(id), false);
    progress.completeLevel(source);
    assert.equal(progress.isLevelUnlocked(id), true);
  }
});

test("Boss Endless records highest defeated rank independently of waves and survives reload", () => {
  const f = fixture();
  f.progress.completeLevel("1-9");
  assert.equal(f.progress.isLevelUnlocked("IF-BE-1"), false);
  f.progress.completeLevel("1-10");
  assert.equal(f.progress.isLevelUnlocked("IF-BE-1"), true);
  assert.equal(f.progress.bestBossRankForLevel("IF-BE-1"), 0);
  assert.equal(f.progress.isLevelUnlocked("IF-BE-2"), false);
  f.progress.completeLevel("2-10");
  assert.equal(f.progress.isLevelUnlocked("IF-BE-2"), true);
  f.progress.recordDefeatedBossRank("IF-BE-2", 7);
  assert.equal(f.progress.isLevelUnlocked("IF-BE-3"), false);
  f.progress.completeLevel("5-5");
  assert.equal(f.progress.isLevelUnlocked("IF-BE-3"), true);
  f.progress.recordDefeatedBossRank("IF-BE-3", 9);
  assert.equal(f.progress.isLevelUnlocked("IF-BE-4"), false);
  f.progress.completeLevel("5-8");
  assert.equal(f.progress.isLevelUnlocked("IF-BE-4"), true);
  f.progress.recordDefeatedBossRank("IF-BE-4", 4);
  f.progress.recordDefeatedBossRank("IF-BE-1", 3);
  const writes = f.writes();
  for (const rank of [2, 0, -1, 3.5, NaN, Infinity]) f.progress.recordDefeatedBossRank("IF-BE-1", rank);
  f.progress.recordCompletedWaves("IF-BE-1", 100);
  f.progress.recordDefeatedBossRank("IF-1", 5);
  assert.equal(f.writes(), writes);
  assert.equal(f.progress.bestWaveForLevel("IF-BE-1"), 0);
  const reloaded = fixture(JSON.parse(f.storage.get(storageKey)));
  assert.equal(reloaded.progress.bestBossRankForLevel("IF-BE-1"), 3);
  assert.equal(reloaded.progress.bestBossRankForLevel("IF-BE-2"), 7);
  assert.equal(reloaded.progress.bestBossRankForLevel("IF-BE-3"), 9);
  assert.equal(reloaded.progress.bestBossRankForLevel("IF-BE-4"), 4);
  assert.equal(reloaded.progress.isLevelCompleted("IF-BE-1"), false);
  reloaded.progress.resetProgress();
  assert.equal(reloaded.progress.bestBossRankForLevel("IF-BE-1"), 0);
});

test("ASCII Expansion opens after 4-10 independently of the main finale", () => {
  const { progress } = fixture();
  assert.equal(progress.isChapterGroupUnlocked("ascii"), false);
  assert.equal(progress.isLevelUnlocked("AE-1"), false);
  progress.completeLevel("4-10");
  assert.equal(progress.isChapterGroupUnlocked("ascii"), true);
  assert.equal(progress.isChapterUnlocked("AE"), true);
  assert.equal(progress.isLevelUnlocked("AE-1"), true);
  assert.equal(progress.isLevelCompleted("5-10"), false);
  assert.equal(progress.discoveredEnemies().enemies.has("tilde3"), true);
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
