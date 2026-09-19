import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({
  phaser: { default: { Math: { FloatBetween: () => 1 } } },
  "src/render/unitShapes.ts": {},
  "src/game/statusEffects.ts": { hasStatusEffectName: (unit, name) => unit.statusEffects?.some(effect => effect.name === name) ?? false },
  "src/game/unitStats.ts": {}
});
const registry = load("src/registry/enemies.ts");
const { enemyKindAtRank, isEnemyKind } = registry;
const { enemyArchetypes } = load("src/data/enemyArchetypes.ts");
const legacy = JSON.parse(fs.readFileSync(new URL("./fixtures/enemy-legacy.json", import.meta.url), "utf8"));

test("IF-1 uses +1 increment growth while 1-9 retains its original linear weights", () => {
  const { getLevelConfig } = load("src/data/levels.ts");
  const { waveWeightLimit, waveScheduleAction } = load("src/game/waves.ts");
  const endless = getLevelConfig("IF-1");
  assert.equal(endless.unlockAfter, "1-9");
  assert.deepEqual(endless.enemyKinds, getLevelConfig("1-9").enemyKinds);
  assert.equal(endless.totalWaves, undefined);
  assert.equal(endless.waveWeightCap, undefined);
  const difficulty = { weightMultiplier: 1 };
  assert.deepEqual([1, 2, 3, 4, 5, 10, 11, 20].map(wave => waveWeightLimit(endless, difficulty, wave)),
    [19, 29, 40, 52, 65, 290, 164, 760]);
  assert.equal(waveWeightLimit(endless, { weightMultiplier: 1.4 }, 10), 406);
  assert.deepEqual([1, 2, 3, 10].map(wave => waveWeightLimit(getLevelConfig("1-9"), difficulty, wave)),
    [19, 29, 39, 218]);
  assert.equal(waveScheduleAction(endless, 10000, null, 0, 30000), "spawn");
});

test("infinite wave sampling supports every affordable rank without enumerating the catalog", () => {
  const { buildInfiniteWaveKinds } = load("src/game/infiniteWaves.ts");
  const families = ["circle", "triangle", "square"];
  for (const weight of [0, 9, 19, 100, 550, 1000, 10000000]) {
    const kinds = buildInfiniteWaveKinds(families, weight, 1, 10, length => length - 1);
    const spent = kinds.reduce((sum, kind) => sum + registry.getEnemyDefinition(kind).weight, 0);
    assert.ok(spent <= weight);
    assert.ok(weight - spent < 10);
  }
  assert.deepEqual(buildInfiniteWaveKinds(["triangle"], 60000030, 1, 10, length => length - 1), ["triangle1000001"]);
  assert.deepEqual(buildInfiniteWaveKinds(["circle"], 130, 1, 10, length => length - 1), ["circle4"]);
  const circles = buildInfiniteWaveKinds(["circle"], 1300, 1, 10, length => length - 1);
  assert.deepEqual(circles, Array(10).fill("circle4"));
  assert.throws(() => buildInfiniteWaveKinds(families, Infinity, 1, 10, () => 0), RangeError);
});

test("IF-2 extends the 2-4 enemy families to dynamic ranks with an independent clear requirement", () => {
  const { getLevelConfig } = load("src/data/levels.ts");
  const level = getLevelConfig("IF-2");
  assert.deepEqual(level.enemyKinds, getLevelConfig("2-4").enemyKinds);
  assert.equal(level.unlockAfter, "2-4");
  assert.equal(level.endless, true);
  assert.equal(level.survival, true);
  assert.equal(level.totalWaves, undefined);
  assert.equal(level.startingChars, 300);
  assert.equal(level.waveWeightIncrement, getLevelConfig("2-4").waveWeightIncrement);
  assert.equal(level.waveWeightIncrementGrowth, 1);
  const { waveWeightLimit } = load("src/game/waves.ts");
  for (const wave of [1, 2, 3, 10, 100]) {
    assert.equal(waveWeightLimit(level, { weightMultiplier: 1.4 }, wave),
      waveWeightLimit(getLevelConfig("2-4"), { weightMultiplier: 1.4 }, wave));
  }
  const { buildInfiniteWaveKinds } = load("src/game/infiniteWaves.ts");
  for (const family of level.unlimitedRankFamilies.filter(family => family !== "circle")) {
    const weight = registry.getEnemyDefinition(enemyKindAtRank(family, 10)).weight;
    assert.deepEqual(buildInfiniteWaveKinds([family], weight, 100, 10, length => length - 1), [enemyKindAtRank(family, 10)]);
  }
});

for (const [id, sourceId] of [["IF-3", "2-9"], ["IF-4", "3-9"]]) {
  test(`${id} inherits ${sourceId} enemies, funding and weights without wave or rank limits`, () => {
    const { getLevelConfig } = load("src/data/levels.ts");
    const { waveWeightLimit } = load("src/game/waves.ts");
    const level = getLevelConfig(id);
    const source = getLevelConfig(sourceId);
    assert.equal(level.unlockAfter, sourceId);
    assert.deepEqual(level.enemyKinds, source.enemyKinds);
    assert.deepEqual(level.unlimitedRankFamilies, [...new Set(source.enemyKinds.map(registry.enemyFamily))]);
    assert.equal(level.startingChars, source.startingChars);
    assert.equal(level.endless, true);
    assert.equal(level.survival, true);
    assert.equal(level.totalWaves, undefined);
    assert.equal(level.waveWeightCap, undefined);
    for (const wave of [1, 2, 3, 10, 100]) {
      assert.equal(waveWeightLimit(level, { weightMultiplier: 1.4 }, wave),
        waveWeightLimit(source, { weightMultiplier: 1.4 }, wave));
    }
  });
}

for (const [index, sourceId] of ["4-1", "4-4", "4-6", "4-7", "5-2", "5-4", "5-6", "5-7"].entries()) {
  test(`IF-${index + 5} inherits ${sourceId} including starting characters and flag leaders`, () => {
    const { getLevelConfig, levelNodes } = load("src/data/levels.ts");
    const { infiniteLeaderKinds, buildInfiniteWaveKinds } = load("src/game/infiniteWaves.ts");
    const id = `IF-${index + 5}`;
    const level = getLevelConfig(id);
    const source = getLevelConfig(sourceId);
    const families = [...new Set(source.enemyKinds.map(registry.enemyFamily))];
    assert.equal(levelNodes.filter(node => node.id === id).length, 1);
    assert.deepEqual(level.enemyKinds, families);
    assert.deepEqual(level.unlimitedRankFamilies, families);
    assert.equal(level.unlockAfter, sourceId);
    for (const field of ["startingChars", "firstWaveWeight", "waveWeightIncrement", "waveWeightIncrementGrowth", "wavesPerFlag"])
      assert.equal(level[field], source[field], field);
    assert.equal(level.survival, true);
    assert.equal(level.endless, true);
    for (const field of ["totalWaves", "waveWeightCap", "bossKind", "specialMechanic"])
      assert.equal(level[field], undefined);
    const leaders = level.enemyKinds.filter(registry.enemyIsLeader);
    for (const wave of [1, 9, 10, 11, 19, 20, 21, 30, 100]) {
      const spawned = infiniteLeaderKinds(leaders, wave, 10);
      assert.deepEqual(spawned, wave % 10 === 0 ? leaders.map(kind => enemyKindAtRank(kind, wave / 10)) : []);
    }
    const kinds = buildInfiniteWaveKinds(families, 2000, 30, 10, length => length - 1);
    assert.ok(kinds.every(kind => !registry.enemyIsLeader(kind)));
    assert.ok(kinds.reduce((sum, kind) => sum + registry.getEnemyDefinition(kind).weight, 0) <= 2000);
  });
}

test("infinite leaders start at rank I even when the template has rank II or duplicate ranks", () => {
  const { infiniteLeaderKinds } = load("src/game/infiniteWaves.ts");
  assert.deepEqual(infiniteLeaderKinds(["heart2", "heart3", "burrowArrow2"], 10, 10), ["heart", "burrowArrow"]);
  assert.deepEqual(infiniteLeaderKinds(["heart2"], 100, 10), ["heart10"]);
});

test("cube ranks extend I/II linearly and promotion prioritizes highest eligible ranks then distance", () => {
  const { bossStatsAtRank, cubePromotionKind } = load("src/bosses/bossRanks.ts");
  for (const rank of [1, 2, 3, 10, 1000]) {
    assert.deepEqual(bossStatsAtRank("cube", rank), { hp: 150000 + 50000 * (rank - 1), armor: 300 * rank, magicResistance: 20, speed: 0.6 });
    assert.equal(cubePromotionKind(enemyKindAtRank("square", rank), rank), enemyKindAtRank("square", rank + 1));
  }
  for (const rank of [0, -1, 1.5, Infinity, NaN]) assert.throws(() => bossStatsAtRank("cube", rank));
  assert.equal(cubePromotionKind("circle4", 10), undefined);
  assert.equal(cubePromotionKind("heart", 10), undefined);
  assert.equal(cubePromotionKind("triangle3", 2), undefined);
  const { findPromotionTargets } = load("src/game/enemyBehaviors.ts");
  const enemy = (kind, x, extra = {}) => ({ kind, x, y: 0, inPlay: true, statusEffects: [], ...extra });
  const oneNear = enemy("triangle", 1), oneFar = enemy("triangle", 10);
  const twoNear = enemy("square2", 80), twoFar = enemy("triangle2", 100);
  const excluded = [enemy("triangle3", 0), enemy("triangle2", 0, { inPlay: false }), enemy("triangle2", 0, { highFlightUntil: 100 })];
  assert.deepEqual(findPromotionTargets({ x: 0, y: 0 }, [oneNear, twoFar, oneFar, twoNear, ...excluded], 2, 3), [twoNear, twoFar, oneNear]);
  assert.deepEqual(findPromotionTargets({ x: 0, y: 0 }, [twoFar, oneFar, oneNear], 1, 3), [oneNear, oneFar]);
  assert.deepEqual(findPromotionTargets({ x: 0, y: 0 }, [oneNear, twoNear], 2, 0), []);
});

test("IF-BE-1 is isolated in Boss Endless and inherits 1-10 enemies and funding without a weight cap", () => {
  const { getLevelConfig } = load("src/data/levels.ts");
  const { chapterIdForLevelId, levelNodesForChapter } = load("src/data/chapters.ts");
  assert.equal(chapterIdForLevelId("IF-BE-1"), "IFB");
  assert.equal(levelNodesForChapter("IF").length, 12);
  assert.deepEqual(levelNodesForChapter("IFB").map(node => node.id), ["IF-BE-1", "IF-BE-2", "IF-BE-3"]);
  const level = getLevelConfig("IF-BE-1"), source = getLevelConfig("1-10");
  for (const key of ["firstWaveWeight", "waveWeightIncrement", "wavesPerFlag"])
    assert.deepEqual(level[key], source[key], key);
  assert.equal(level.waveWeightIncrementGrowth, 1);
  const { waveWeightLimit } = load("src/game/waves.ts");
  assert.deepEqual([1, 2, 3, 4, 5, 10, 20].map(wave => waveWeightLimit(level, { weightMultiplier: 1 }, wave)),
    [19, 29, 40, 52, 65, 290, 760]);
  assert.equal(source.waveWeightIncrementGrowth, undefined);
  assert.equal(waveWeightLimit(source, { weightMultiplier: 1 }, 10), 218);
  assert.equal(level.startingChars, source.startingChars ?? 300);
  assert.equal(level.bossKind, "cube");
  assert.equal(level.bossEndless, true);
  assert.equal(level.survival, true);
  assert.equal(level.endless, true);
  assert.equal(level.unlockAfter, "1-10");
});

test("tetrahedron ranks preserve I/II panels and extend Charge linearly", () => {
  const { bossStatsAtRank, tetrahedronChargeSpeedAtRank, rankedBossFamily } = load("src/bosses/bossRanks.ts");
  for (const rank of [1, 2, 3, 10, 100]) {
    assert.deepEqual(bossStatsAtRank("tetrahedron", rank), { hp: 120000, armor: 150, magicResistance: 20, speed: 1.2 });
    assert.equal(tetrahedronChargeSpeedAtRank(rank), 2 + 0.5 * (rank - 1));
  }
  assert.equal(rankedBossFamily("tetrahedron2"), "tetrahedron");
  assert.equal(rankedBossFamily("octahedron"), undefined);
  assert.throws(() => bossStatsAtRank("octahedron", 3));
  for (const rank of [0, -1, 1.5, Infinity, NaN]) assert.throws(() => tetrahedronChargeSpeedAtRank(rank));
});

test("all Boss Endless stages inherit source funding and weights but use IF dynamic ranks", () => {
  const { getLevelConfig } = load("src/data/levels.ts");
  const { chapterIdForLevelId } = load("src/data/chapters.ts");
  const { buildInfiniteWaveKinds } = load("src/game/infiniteWaves.ts");
  for (const [index, sourceId] of ["1-10", "2-10", "5-5"].entries()) {
    const id = `IF-BE-${index + 1}`, level = getLevelConfig(id), source = getLevelConfig(sourceId);
    assert.equal(chapterIdForLevelId(id), "IFB");
    assert.equal(level.unlockAfter, sourceId);
    assert.equal(level.startingChars, source.startingChars ?? 300);
    assert.deepEqual(level.unlimitedRankFamilies, [...new Set(source.enemyKinds.map(registry.enemyFamily))]);
    assert.deepEqual(level.enemyKinds, level.unlimitedRankFamilies);
    for (const field of ["firstWaveWeight", "waveWeightIncrement", "wavesPerFlag"])
      assert.equal(level[field], source[field], field);
    assert.equal(level.waveWeightIncrementGrowth, sourceId === "1-10" ? 1 : source.waveWeightIncrementGrowth);
    const kinds = buildInfiniteWaveKinds(level.unlimitedRankFamilies, 6000, 20, 10, length => length - 1);
    assert.ok(kinds.some(kind => registry.enemyRank(kind) > 3 && registry.enemyFamily(kind) !== "circle"));
    assert.ok(kinds.every(kind => registry.enemyFamily(kind) !== "circle" || registry.enemyRank(kind) <= 4));
    assert.ok(kinds.reduce((sum, kind) => sum + registry.getEnemyDefinition(kind).weight, 0) <= 6000);
  }
});

test("every Infinite Front stage has uncapped wave weights while story bosses keep their caps", () => {
  const { levelConfigs } = load("src/data/levels.ts");
  const { waveWeightLimit } = load("src/game/waves.ts");
  for (const level of Object.values(levelConfigs).filter(level => level.survival)) {
    assert.equal(level.waveWeightCap, undefined, level.id);
    const n = 1000;
    const expected = (level.firstWaveWeight + (n - 1) * level.waveWeightIncrement +
      (level.waveWeightIncrementGrowth ?? 0) * (n - 1) * (n - 2) / 2) * 2;
    assert.equal(waveWeightLimit(level, { weightMultiplier: 1 }, n), expected, level.id);
  }
  assert.equal(waveWeightLimit(levelConfigs["1-10"], { weightMultiplier: 1 }, 1000), 600);
  assert.equal(waveWeightLimit(levelConfigs["2-10"], { weightMultiplier: 1 }, 1000), 800);
});

test("all 66 existing enemy panels and registrations exactly match the pre-refactor snapshot", () => {
  assert.deepEqual(Object.keys(registry.allEnemyDefinitions), Object.keys(legacy));
  for (const [kind, expected] of Object.entries(legacy)) {
    assert.deepEqual(registry.getEnemyRegistration(kind), expected, kind);
  }
});

test("every minion and leader supports unregistered ranks through the same family growth rules", () => {
  for (const [family, archetype] of Object.entries(enemyArchetypes)) {
    if (["solarBomb", "dodecahedronCompanion"].includes(family)) continue;
    for (const rank of [4, 10, 100, 10000]) {
      const kind = enemyKindAtRank(family, rank);
      assert.equal(registry.enemyFamily(kind), family);
      assert.equal(registry.enemyRank(kind), rank);
      const definition = registry.getEnemyDefinition(kind);
      const one = legacy[family].definition;
      const two = legacy[`${family}2`].definition;
      for (const [field, value] of Object.entries(one)) {
        if (typeof value !== "number") continue;
        assert.equal(definition[field], value + (two[field] - value) * (rank - 1), `${kind}.${field}`);
      }
      assert.equal(definition.label, String(rank));
      assert.equal(registry.enemyIsLeader(kind), !!legacy[family].leader || legacy[family].attackMode === "leader");
    }
  }
});

test("rank ids preserve old spellings and reject invalid or noncanonical save values", () => {
  assert.equal(enemyKindAtRank("triangle", 1), "triangle");
  assert.equal(enemyKindAtRank("triangle", 2), "triangle2");
  for (const value of ["triangle0", "triangle1", "triangle01", "triangle1.5", "triangle-2", "triangle1e3",
    "triangle9007199254740992", "missing100", "__proto__", "constructor", null, 100, "solarBomb2", "dodecahedronCompanion1", "cube10"]) {
    assert.equal(isEnemyKind(value), false, String(value));
  }
  for (const rank of [0, -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => enemyKindAtRank("triangle", rank), RangeError);
  }
  assert.throws(() => registry.getEnemyDefinition("constructor"), RangeError);
  assert.throws(() => enemyKindAtRank("missing", 2), RangeError);
  assert.throws(() => enemyKindAtRank("solarBomb", 2), RangeError);
  assert.equal(enemyKindAtRank("dodecahedronCompanion", 3), "dodecahedronCompanion3");
});

test("dodecahedron ranks extend companion health and attacks without changing the boss panel", () => {
  const { bossStatsAtRank, dodecahedronAttacksAtRank } = load("src/bosses/bossRanks.ts");
  for (const rank of [1, 2, 3, 10, 100]) {
    assert.deepEqual(bossStatsAtRank("dodecahedron", rank), { hp: 100000, armor: 200, magicResistance: 90, speed: 0.6 });
    const kind = enemyKindAtRank("dodecahedronCompanion", rank);
    const stats = registry.getEnemyDefinition(kind);
    assert.equal(stats.hp, 32000 + 8000 * (rank - 1));
    assert.equal(stats.armor, 2000);
    assert.equal(stats.magicResistance, 40);
    assert.equal(registry.enemyIsBossCompanion(kind), true);
    assert.deepEqual(dodecahedronAttacksAtRank(rank), { companionLaserHits: 4 * rank,
      companionMortarHits: 2 * rank, deathLaserHits: 7 * rank, deathMortarTargets: 4 });
  }
  const level = load("src/data/levels.ts").getLevelConfig("IF-BE-3");
  assert.equal(level.bossKind, "dodecahedron");
  assert.equal(level.startingChars, 10000);
  assert.equal(level.firstWaveWeight, 50);
  assert.equal(level.waveWeightIncrement, 50);
  assert.equal(level.waveWeightIncrementGrowth, 7);
  assert.equal(level.waveWeightCap, undefined);
});

test("high-rank lookup stays cached without growing the finite catalog forever", () => {
  const before = Object.keys(registry.allEnemyDefinitions);
  const original = registry.getEnemyDefinition("triangle50000");
  assert.equal(registry.getEnemyDefinition("triangle50000"), original);
  for (let rank = 1000; rank < 1700; rank++) registry.getEnemyDefinition(enemyKindAtRank("triangle", rank));
  const regenerated = registry.getEnemyDefinition("triangle50000");
  assert.notEqual(regenerated, original);
  assert.deepEqual(regenerated, original);
  assert.deepEqual(Object.keys(registry.allEnemyDefinitions), before);
});

test("high ranks preserve attack families, scale detonation damage, and split circles down one rank", () => {
  assert.equal(registry.enemySplitSpawnKind("circle100"), "circle99");
  assert.equal(registry.enemySplitSpawnKind("circle2"), "circle");
  assert.equal(registry.enemySplitSpawnKind("circle"), undefined);
  assert.deepEqual(registry.enemyBlockedDetonation("invertedTriangle100"), { delay: 2000, damage: 61400, damageType: "magic" });
  assert.equal(registry.enemyIsMortar("pentagon100"), true);
  assert.equal(registry.enemyIsLaser("shootingPentagon100"), true);
  assert.equal(registry.enemyIsRanged("shootingTriangle100"), true);
  assert.equal(registry.enemyIsMace("hexMace100"), true);
  assert.equal(registry.enemyPromotionKind("triangle2"), "triangle3");
  assert.equal(registry.enemyPromotionKind("triangle3"), undefined);
});

test("waves resolve dynamic ranks, respect weight and flag restrictions, and exclude leaders from weight spending", () => {
  const { buildWaveKinds } = load("src/game/waves.ts");
  const pool = ["triangle10", "shootingPentagon10", "heart10"];
  const limit = 3400;
  const kinds = buildWaveKinds(pool, registry.getEnemyDefinition, limit, 10, 10, length => length - 1);
  assert.ok(kinds.includes("shootingPentagon10"));
  assert.ok(kinds.includes("triangle10"));
  assert.ok(!kinds.includes("heart10"));
  const spent = kinds.reduce((sum, kind) => sum + registry.getEnemyDefinition(kind).weight, 0);
  assert.ok(spent <= limit);
  assert.ok(limit - spent < registry.getEnemyDefinition("triangle10").weight);
  assert.deepEqual(buildWaveKinds(["shootingPentagon10"], registry.getEnemyDefinition, limit, 1, 10, () => 0), []);
  assert.throws(() => buildWaveKinds(["triangle10"], {}, limit, 1, 10, () => 0), RangeError);
});

test("high-rank attacks and skill charge scale without changing existing low-rank behavior", () => {
  const behavior = load("src/game/enemyBehaviors.ts");
  assert.equal(behavior.enemyAttackSpeed("triangle100"), 6000);
  assert.equal(behavior.enemyAttackSpeed("chargingHexagon100"), 3000);
  assert.equal(behavior.enemyVolleyShotCount({ kind: "shootingTriangle100" }), 100);
  assert.equal(behavior.enemyVolleyShotCount({ kind: "pentagon100" }), 100);
  const state = behavior.initialEnemySkillStates("angelPentagon100").wings;
  assert.equal(state.sp, 15);
  assert.equal(state.regenMultiplier, 20.8);
  assert.equal(behavior.initialEnemySkillStates("angelPentagon3").wings.sp, 4);
  assert.equal(behavior.initialEnemySkillStates("archangelHeptagon100").ascension.sp, 10);
  const { volleyTimingCount, volleyHitsAt } = load("src/game/volley.ts");
  assert.equal(volleyTimingCount(100), 5);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => volleyHitsAt(100, i)), [20, 20, 20, 20, 20]);
});

test("high-rank names do not require translation entries per rank and labels remain bounded", () => {
  assert.equal(registry.getEnemyDisplayName("triangle100"), "TRIANGLE 100");
  assert.equal(registry.getEnemyDisplayName("heart10000"), "HEART 10000");
  assert.equal(registry.getEnemyDisplayName("triangle3"), "TRIANGLE 3");
  const { toRomanNumeral } = load("src/format.ts");
  assert.equal(toRomanNumeral(3), "III");
  assert.equal(toRomanNumeral(100), "C");
  assert.equal(toRomanNumeral(10000), "10000");
  assert.equal(toRomanNumeral(Number.MAX_SAFE_INTEGER).length, 16);
  assert.equal(toRomanNumeral(Infinity), "/");
});
