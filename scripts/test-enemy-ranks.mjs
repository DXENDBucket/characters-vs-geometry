import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({
  phaser: { default: { Math: { FloatBetween: () => 1 } } },
  "src/render/unitShapes.ts": {},
  "src/game/statusEffects.ts": {},
  "src/game/unitStats.ts": {}
});
const registry = load("src/registry/enemies.ts");
const { enemyKindAtRank, isEnemyKind } = registry;
const { enemyArchetypes } = load("src/data/enemyArchetypes.ts");
const legacy = JSON.parse(fs.readFileSync(new URL("./fixtures/enemy-legacy.json", import.meta.url), "utf8"));

test("IF-1 uses +2 increment growth while 1-9 retains its original linear weights", () => {
  const { getLevelConfig } = load("src/data/levels.ts");
  const { waveWeightLimit, waveScheduleAction } = load("src/game/waves.ts");
  const endless = getLevelConfig("IF-1");
  assert.equal(endless.unlockAfter, "1-9");
  assert.deepEqual(endless.enemyKinds, getLevelConfig("1-9").enemyKinds);
  assert.equal(endless.totalWaves, undefined);
  assert.equal(endless.waveWeightCap, undefined);
  const difficulty = { weightMultiplier: 1 };
  assert.deepEqual([1, 2, 3, 4, 5, 10, 11, 20].map(wave => waveWeightLimit(endless, difficulty, wave)),
    [19, 29, 41, 55, 71, 362, 209, 1102]);
  assert.equal(waveWeightLimit(endless, { weightMultiplier: 1.4 }, 10), 506);
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
  assert.deepEqual(buildInfiniteWaveKinds(["circle"], 40000010, 1, 10, length => length - 1), ["circle1000001"]);
  assert.deepEqual(buildInfiniteWaveKinds(["circle"], 130, 1, 10, length => length - 1), ["circle4"]);
  assert.throws(() => buildInfiniteWaveKinds(families, Infinity, 1, 10, () => 0), RangeError);
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
    "triangle9007199254740992", "missing100", "__proto__", "constructor", null, 100, "solarBomb2", "dodecahedronCompanion3", "cube10"]) {
    assert.equal(isEnemyKind(value), false, String(value));
  }
  for (const rank of [0, -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => enemyKindAtRank("triangle", rank), RangeError);
  }
  assert.throws(() => registry.getEnemyDefinition("constructor"), RangeError);
  assert.throws(() => enemyKindAtRank("missing", 2), RangeError);
  assert.throws(() => enemyKindAtRank("solarBomb", 2), RangeError);
  assert.throws(() => enemyKindAtRank("dodecahedronCompanion", 3), RangeError);
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
