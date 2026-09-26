import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const storageKey = "characters-vs-geometry-progress-v1";

test("i unlocks after 2-9 while v still requires 3-4", () => {
  const { progress } = fixture();
  assert.equal(progress.isCardUnlocked("i"), false);
  assert.deepEqual(progress.completeLevel("2-9"), ["i"]);
  assert.equal(progress.isCardUnlocked("i"), true);
  assert.equal(progress.isCardUnlocked("v"), false);
  assert.deepEqual(progress.completeLevel("3-4"), ["v"]);
  assert.equal(progress.isCardUnlocked("v"), true);
});

test("j unlocks after 3-10 rather than 2-6", () => {
  const { progress } = fixture();
  assert.deepEqual(progress.completeLevel("2-6"), ["n"]);
  assert.equal(progress.isCardUnlocked("j"), false);
  assert.deepEqual(progress.completeLevel("3-10"), ["j"]);
  assert.equal(progress.isCardUnlocked("j"), true);
});

test("Q unlocks after 2-2 and O after 2-3", () => {
  const { progress } = fixture();
  progress.completeLevel("1-10");
  assert.equal(progress.isCardUnlocked("R"), true);
  assert.equal(progress.isCardUnlocked("O"), false);
  assert.equal(progress.isCardUnlocked("Q"), false);
  assert.deepEqual(progress.completeLevel("2-2"), ["Q"]);
  assert.equal(progress.isCardUnlocked("Q"), true);
  assert.equal(progress.isCardUnlocked("O"), false);
  assert.deepEqual(progress.completeLevel("2-3"), ["O"]);
  assert.equal(progress.isCardUnlocked("O"), true);
  assert.deepEqual(progress.completeLevel("2-4"), ["c"]);
});

test("flawless clears retain per-difficulty records, including difficulty zero and repeat clears", () => {
  const { progress, storage, writes } = fixture();
  progress.completeLevel("1-1");
  assert.equal(progress.bestFlawlessDifficulty("1-1"), undefined);
  progress.completeLevel("1-1", { difficulty: 0, flawless: true });
  assert.equal(progress.bestFlawlessDifficulty("1-1"), 0);
  progress.completeLevel("1-1", { difficulty: 7, flawless: true });
  progress.completeLevel("1-1", { difficulty: 3, flawless: true });
  progress.completeLevel("1-1", { difficulty: 9, flawless: false });
  progress.completeLevel("1-1", { difficulty: 10, flawless: true });
  progress.completeLevel("IF-1", { difficulty: 9, flawless: true });
  const before = writes();
  assert.deepEqual(progress.completeLevel("1-1", { difficulty: 7, flawless: true }), []);
  assert.equal(writes(), before);
  const saved = JSON.parse(storage.get(storageKey));
  assert.deepEqual(saved.flawlessDifficulties, { "1-1": [0, 3, 7] });
  assert.equal(fixture(saved).progress.bestFlawlessDifficulty("1-1"), 7);
  progress.resetProgress();
  assert.equal(progress.bestFlawlessDifficulty("1-1"), undefined);
});

test("old saves and one-click completion do not invent flawless records", () => {
  const { progress } = fixture({ version: 1, completedLevelIds: ["1-1"], allCardsUnlocked: false });
  progress.completeAllLevels();
  assert.equal(progress.bestFlawlessDifficulty("1-1"), undefined);
  assert.equal(progress.flawlessSummaryForChapters(["1"]).count, 0);
  assert.equal(progress.flawlessSummaryForChapters(["IF", "IFB"]).difficulty, undefined);
  const loaded = fixture({ version: 1, completedLevelIds: ["1-1"], flawlessDifficulties: {
    "1-1": [0, 3, 3, "9", -1, 10, 1.5], "1-2": [9], "IF-1": [9], unknown: [9]
  } }).progress;
  assert.equal(loaded.bestFlawlessDifficulty("1-1"), 3);
  for (const id of ["1-2", "IF-1", "unknown"]) assert.equal(loaded.bestFlawlessDifficulty(id), undefined);
});

test("chapter and group flawless ratings require every operation and use the weakest best clear", () => {
  const { progress, chapters } = fixture();
  const nodes = chapters.levelNodesForChapter("AE");
  for (const node of nodes.slice(1)) progress.completeLevel(node.id, { difficulty: 9, flawless: true });
  assert.deepEqual(progress.flawlessSummaryForChapters(["AE"]), { count: nodes.length - 1, total: nodes.length, difficulty: undefined });
  progress.completeLevel(nodes[0].id, { difficulty: 0, flawless: true });
  assert.equal(progress.flawlessSummaryForChapters(["AE"]).difficulty, 0);
  progress.completeLevel(nodes[0].id, { difficulty: 4, flawless: true });
  assert.equal(progress.flawlessSummaryForChapters(["AE"]).difficulty, 4);
  assert.equal(progress.flawlessSummaryForChapters(["AE", "1"]).difficulty, undefined);
  assert.deepEqual(progress.flawlessSummaryForChapters(["IF", "IFB"]), { count: 0, total: 0, difficulty: undefined });
});

function fixture(saved) {
  const storage = new Map(saved ? [[storageKey, JSON.stringify(saved)]] : []);
  let writes = 0;
  const window = { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); writes++; },
    removeItem: key => storage.delete(key)
  } };
  const load = createTypeScriptLoader({}, { window });
  return {
    progress: load("src/progress.ts"), visibility: load("src/encyclopediaVisibility.ts"),
    levels: load("src/data/levels.ts"), chapters: load("src/data/chapters.ts"),
    chapterGroups: load("src/data/chapterGroups.ts"), storage, writes: () => writes
  };
}

test("Symbol Domain Capital follows Symbol Domain and unlocks AE-EX-1 after DEL", () => {
  const { progress, chapters, chapterGroups, levels } = fixture();
  assert.deepEqual(chapterGroups.chaptersInGroup("ascii").map(chapter => chapter.id), ["AE", "AE2"]);
  assert.equal(chapters.getChapterDefinition("AE2").parentId, "AE");
  assert.equal(chapterGroups.groupForChapter("AE2").id, "ascii");
  assert.equal(chapters.chapterIdForLevelId("AE-10"), "AE");
  assert.equal(chapters.chapterIdForLevelId("AE-EX-1"), "AE2");
  assert.deepEqual(chapters.levelNodesForChapter("AE2").map(node => node.id), ["AE-EX-1", "AE-EX-2", "AE-EX-3"]);
  assert.equal(chapters.levelNodesForChapter("AE").length, 10);
  const level = levels.getLevelConfig("AE-EX-1");
  assert.equal(level.totalWaves, 10);
  assert.equal(level.startingChars, 2000);
  assert.deepEqual([level.firstWaveWeight, level.waveWeightIncrement, level.waveWeightIncrementGrowth], [30, 35, 5]);
  assert.deepEqual(level.enemyKinds, ["circle", "tilde", "tilde2", "tilde3", "triangleRam", "triangleRam2", "triangleRam3"]);
  assert.deepEqual(level.extraWaveSpawns, [{ kind: "chevronLeader", lane: 3 }]);
  assert.equal(level.waveWeightCap, undefined);
  for (const id of ["4-10", ...chapters.levelNodesForChapter("AE").slice(0, -1).map(node => node.id)]) progress.completeLevel(id);
  assert.equal(progress.isChapterUnlocked("AE2"), false);
  assert.equal(progress.discoveredEnemies().enemies.has("chevronLeader3"), false);
  progress.completeLevel("AE-10");
  assert.equal(progress.isChapterUnlocked("AE2"), true);
  assert.equal(progress.isChapterCompleted("AE2"), false);
  assert.equal(progress.isLevelUnlocked("AE-EX-1"), true);
  assert.equal(progress.discoveredEnemies().enemies.has("chevronLeader"), true);
  assert.equal(progress.discoveredEnemies().enemies.has("chevronLeader3"), false);
  assert.equal(progress.isChapterCompleted("AE"), true);
  assert.equal(progress.isLevelUnlocked("AE-EX-2"), false);
  progress.completeLevel("AE-EX-1");
  assert.equal(progress.isLevelUnlocked("AE-EX-2"), true);
  assert.equal(progress.isChapterCompleted("AE2"), false);
  assert.equal(progress.isLevelUnlocked("AE-EX-3"), false);
  progress.completeLevel("AE-EX-2");
  assert.equal(progress.isLevelUnlocked("AE-EX-3"), true);
  assert.equal(progress.isChapterCompleted("AE2"), false);
  progress.completeLevel("AE-EX-3");
  assert.equal(progress.isChapterCompleted("AE2"), true);
});

test("AE-EX-2 uses the capital template and periodic per-tower NUL", () => {
  const { levels } = fixture();
  const level = levels.getLevelConfig("AE-EX-2");
  assert.equal(level.totalWaves, 20);
  assert.equal(level.startingChars, 2000);
  assert.deepEqual([level.firstWaveWeight, level.waveWeightIncrement, level.waveWeightIncrementGrowth], [30, 35, 5]);
  assert.equal(level.waveWeightCap, undefined);
  assert.deepEqual(level.periodicTowerNullification, { intervalMs: 60000, durationMs: 10000 });
  assert.deepEqual(level.enemyKinds, ["circle", "tilde", "tilde2", "tilde3", "equals", "dollar",
    "angelPentagonRam", "angelPentagonRam2", "angelPentagonRam3", "hexMace", "hexMace2", "hexMace3"]);
});

test("AE-EX-3 uses ranks III-V and an extra rank-I archangel every wave", () => {
  const { levels } = fixture();
  const level = levels.getLevelConfig("AE-EX-3");
  assert.equal(level.totalWaves, 30);
  assert.equal(level.unlockAfter, "AE-EX-2");
  assert.equal(level.startingChars, 2000);
  assert.deepEqual([level.firstWaveWeight, level.waveWeightIncrement, level.waveWeightIncrementGrowth], [30, 35, 5]);
  assert.equal(level.waveWeightCap, undefined);
  assert.equal(level.periodicTowerNullification, undefined);
  assert.deepEqual(level.enemyKinds, ["circle", "tilde3", "tilde4", "tilde5", "triangleRam3", "triangleRam4", "triangleRam5",
    "angelPentagon3", "chevronLeader"]);
  assert.deepEqual(level.extraWaveSpawns, [{ kind: "archangelHeptagon" }]);
  assert.deepEqual(levels.levelPreviewEnemyKinds(level), [...level.enemyKinds, "archangelHeptagon"]);
});

test("AE-10 unlocks DEL after AE-9 and adds mortar, pentagon and diamond ranks to its Boss battle pool", () => {
  const { progress, levels, visibility } = fixture();
  const level = levels.getLevelConfig("AE-10");
  assert.equal(level.bossKind, "del");
  assert.equal(level.endless, true);
  assert.equal(level.survival, undefined);
  assert.equal(level.startingChars, 2000);
  assert.equal(level.waveWeightCap, 800);
  assert.deepEqual(level.enemyKinds, [...levels.getLevelConfig("AE-9").enemyKinds,
    "mortarTriangle", "pentagon", "diamond", "diamond2", "diamond3"]);
  for (const id of ["4-10", "AE-1", "AE-2", "AE-3", "AE-4", "AE-5", "AE-6", "AE-7", "AE-8"])
    progress.completeLevel(id);
  assert.equal(progress.isLevelUnlocked("AE-10"), false);
  assert.equal(progress.discoveredEnemies().bosses.has("del"), false);
  progress.completeLevel("AE-9");
  assert.equal(progress.isLevelUnlocked("AE-10"), true);
  assert.deepEqual(visibility.visibleEncyclopediaEntries([{ icon: "del" }]), [{ icon: "del" }]);
  progress.completeLevel("AE-10");
  assert.equal(progress.isLevelCompleted("AE-10"), true);
});

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

test("AE-7 follows AE-6, uses the requested pool and reveals Dollar on unlock", () => {
  const { progress, levels } = fixture();
  const level = levels.getLevelConfig("AE-7"), template = levels.getLevelConfig("AE-6");
  assert.equal(level.totalWaves, 20);
  assert.equal(level.unlockAfter, "AE-6");
  assert.equal(levels.levelNodes.filter(node => node.id === "AE-7").length, 1);
  for (const field of ["firstWaveWeight", "waveWeightIncrement", "waveWeightIncrementGrowth", "startingChars", "wavesPerFlag"])
    assert.equal(level[field], template[field], field);
  assert.deepEqual(level.enemyKinds, ["circle", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3",
    "triangleRam", "triangleRam2", "triangleRam3", "hexMace", "dollar", "heart"]);
  assert.equal(progress.isLevelUnlocked("AE-7"), false);
  assert.equal(progress.discoveredEnemies().enemies.has("dollar"), false);
  for (const id of ["4-10", "AE-1", "AE-2", "AE-3", "AE-4", "AE-5"])
    progress.completeLevel(id);
  assert.equal(progress.isLevelUnlocked("AE-7"), false);
  assert.equal(progress.discoveredEnemies().enemies.has("dollar"), false);
  progress.completeLevel("AE-6");
  assert.equal(progress.isLevelUnlocked("AE-7"), true);
  assert.equal(progress.discoveredEnemies().enemies.has("dollar"), true);
  assert.equal(progress.discoveredEnemies().enemies.has("dollar2"), false);
});

test("AE-8 follows AE-7 with 30 waves, the ASCII template and exactly the requested enemy ranks", () => {
  const { progress, levels } = fixture();
  const level = levels.getLevelConfig("AE-8"), template = levels.getLevelConfig("AE-7");
  assert.equal(level.totalWaves, 30);
  assert.equal(level.unlockAfter, "AE-7");
  assert.equal(levels.levelNodes.filter(node => node.id === "AE-8").length, 1);
  for (const field of ["firstWaveWeight", "waveWeightIncrement", "waveWeightIncrementGrowth", "startingChars", "wavesPerFlag"])
    assert.equal(level[field], template[field], field);
  assert.deepEqual(level.enemyKinds, ["circle", "tilde", "tilde2", "parentheses", "parentheses2", "parentheses3",
    "dollar", "square2", "trapezoid2", "mortarTriangle", "mortarTriangle2", "mortarTriangle3",
    "pentagon", "pentagon2", "pentagon3", "hexSpellBulwark"]);
  for (const id of ["4-10", "AE-1", "AE-2", "AE-3", "AE-4", "AE-5", "AE-6"]) progress.completeLevel(id);
  assert.equal(progress.isLevelUnlocked("AE-8"), false);
  progress.completeLevel("AE-7");
  assert.equal(progress.isLevelUnlocked("AE-8"), true);
  for (const kind of level.enemyKinds) assert.equal(progress.discoveredEnemies().enemies.has(kind), true, kind);
  assert.equal(progress.isCardUnlocked("[]"), false);
  assert.deepEqual(progress.completeLevel("AE-8"), ["[]"]);
  assert.equal(progress.isCardUnlocked("[]"), true);
  assert.equal(progress.isLevelCompleted("AE-8"), true);
});

test("AE-9 follows AE-8 with 20 waves and reveals only rank I of the Greater-Than Sign leader", () => {
  const { progress, levels } = fixture();
  const level = levels.getLevelConfig("AE-9"), template = levels.getLevelConfig("AE-8");
  assert.equal(level.totalWaves, 20);
  assert.equal(level.unlockAfter, "AE-8");
  assert.equal(levels.levelNodes.filter(node => node.id === "AE-9").length, 1);
  for (const field of ["firstWaveWeight", "waveWeightIncrement", "waveWeightIncrementGrowth", "startingChars", "wavesPerFlag"])
    assert.equal(level[field], template[field], field);
  assert.deepEqual(level.enemyKinds, ["circle", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3",
    "parentheses", "parentheses2", "parentheses3", "dollar", "chevronLeader"]);
  for (const id of ["4-10", "AE-1", "AE-2", "AE-3", "AE-4", "AE-5", "AE-6", "AE-7"]) progress.completeLevel(id);
  assert.equal(progress.isLevelUnlocked("AE-9"), false);
  assert.equal(progress.discoveredEnemies().enemies.has("chevronLeader"), false);
  progress.completeLevel("AE-8");
  assert.equal(progress.isLevelUnlocked("AE-9"), true);
  for (const kind of level.enemyKinds) assert.equal(progress.discoveredEnemies().enemies.has(kind), true, kind);
  assert.equal(progress.discoveredEnemies().enemies.has("chevronLeader2"), false);
  assert.equal(progress.discoveredEnemies().enemies.has("chevronLeader3"), false);
  assert.deepEqual(progress.completeLevel("AE-9"), []);
  assert.equal(progress.isLevelCompleted("AE-9"), true);
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

test("endless records are isolated by difficulty, persisted and monotonic", () => {
  const f = fixture();
  for (const [difficulty, count] of [[0, 80], [3, 40], [9, 12]]) {
    f.progress.recordCompletedWaves("IF-1", count, difficulty);
    f.progress.recordDefeatedBossRank("IF-BE-1", count, difficulty);
    f.progress.recordCompletedWaves("IF-1", count - 1, difficulty);
    f.progress.recordDefeatedBossRank("IF-BE-1", count - 1, difficulty);
  }
  const writes = f.writes();
  for (const difficulty of [-1, 10, 1.5, NaN, Infinity]) {
    f.progress.recordCompletedWaves("IF-1", 999, difficulty);
    f.progress.recordDefeatedBossRank("IF-BE-1", 999, difficulty);
  }
  assert.equal(f.writes(), writes);
  const p = fixture(JSON.parse(f.storage.get(storageKey))).progress;
  for (const [difficulty, count] of [[0, 80], [3, 40], [9, 12], [1, 0]]) {
    assert.equal(p.bestWaveForLevel("IF-1", difficulty), count);
    assert.equal(p.bestBossRankForLevel("IF-BE-1", difficulty), count);
    assert.equal(p.bestWaveForLevel("IF-2", difficulty), 0);
  }
  p.resetProgress();
  assert.equal(p.bestWaveForLevel("IF-1", 0), 0);
  assert.equal(p.bestBossRankForLevel("IF-BE-1", 9), 0);
});

test("legacy endless totals are retained without assigning an unknown difficulty", () => {
  const f = fixture({ version: 1, completedLevelIds: [], allCardsUnlocked: false,
    bestWaves: { "IF-1": 100 }, bestBossRanks: { "IF-BE-1": 20 },
    bestWavesByDifficulty: { "IF-1": { 0: 12, 3: -1, 4: "50", 10: 20, "03": 30 }, "1-1": { 3: 100 } },
    bestBossRanksByDifficulty: { "IF-BE-1": { 9: 5 }, "IF-1": { 3: 100 } } });
  assert.equal(f.progress.bestWaveForLevel("IF-1", 3), 0);
  assert.equal(f.progress.bestBossRankForLevel("IF-BE-1", 3), 0);
  f.progress.recordCompletedWaves("IF-1", 4, 3);
  const saved = JSON.parse(f.storage.get(storageKey));
  assert.equal(saved.bestWaves["IF-1"], 100);
  assert.equal(saved.bestBossRanks["IF-BE-1"], 20);
  assert.deepEqual(saved.bestWavesByDifficulty, { "IF-1": { 0: 12, 3: 4 } });
  assert.deepEqual(saved.bestBossRanksByDifficulty, { "IF-BE-1": { 9: 5 } });
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
  assert.equal(progress.isLevelCompleted("0-5"), true);
  assert.equal(progress.isLevelCompleted("0-6"), true);
  assert.equal(progress.isCardUnlocked("I"), true);
  assert.equal(progress.discoveredEnemies().enemies.has("square"), true);
  assert.equal(progress.discoveredEnemies().enemies.has("missing"), false);
  assert.equal(progress.discoveredEnemies().bosses.size, 0);
});

test("inserting practice shifts old tutorial clears and flawless records exactly once", () => {
  const f = fixture({ version: 1, completedLevelIds: ["0-1", "0-2", "0-3"], allCardsUnlocked: false,
    flawlessDifficulties: { "0-2": [1], "0-3": [3] } });
  assert.equal(f.progress.isLevelCompleted("0-2"), true);
  assert.equal(f.progress.isLevelCompleted("0-4"), true);
  assert.equal(f.progress.isLevelCompleted("0-5"), false);
  assert.equal(f.progress.bestFlawlessDifficulty("0-2"), undefined);
  assert.equal(f.progress.bestFlawlessDifficulty("0-3"), 1);
  assert.equal(f.progress.bestFlawlessDifficulty("0-4"), 3);
  assert.equal(f.progress.isLevelUnlocked("0-5"), true);
  f.progress.completeLevel("0-5");
  const stored = JSON.parse(f.storage.get(storageKey));
  assert.equal(stored.tutorialOrderVersion, 2);
  const reloaded = fixture(stored).progress;
  assert.equal(reloaded.isLevelCompleted("0-6"), false);
  assert.equal(reloaded.bestFlawlessDifficulty("0-4"), 3);
  const fresh = fixture().progress;
  fresh.completeLevel("0-1");
  assert.equal(fresh.isLevelUnlocked("0-2"), true);
  assert.equal(fresh.isLevelUnlocked("0-3"), false);
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
