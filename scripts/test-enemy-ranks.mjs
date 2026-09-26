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
const { enemyWeightUpgradeCount, enemyWeightAtRank, affordableEnemyRank } = load("src/game/enemyWeight.ts");
const legacy = JSON.parse(fs.readFileSync(new URL("./fixtures/enemy-legacy.json", import.meta.url), "utf8"));

test("tower upgrade cadence and enemy weight slopes change after actual levels 20, 60, 140, 300", () => {
  const { effectiveUpgradeCountForLevel, effectiveLevelForLevel, effectiveUpgradeDelta } = load("src/game/upgrades.ts");
  const cases = [
    [1, 0, 0], [19, 18, 18], [20, 19, 19], [21, 19, 21], [22, 20, 23],
    [59, 38, 97], [60, 39, 99], [61, 39, 103], [64, 40, 115],
    [140, 59, 419], [141, 59, 427], [148, 60, 483],
    [300, 79, 1699], [301, 79, 1715], [316, 80, 1955]
  ];
  for (const [level, upgrades, weightUnits] of cases) {
    assert.equal(effectiveUpgradeCountForLevel(level), upgrades, `Tower level ${level}`);
    assert.equal(effectiveLevelForLevel(level), upgrades + 1);
    assert.equal(enemyWeightUpgradeCount(level), weightUnits, `Enemy rank ${level}`);
  }
  let node = 20, cadence = 2;
  for (let band = 0; band < 10; band++) {
    assert.equal(effectiveUpgradeDelta(node, node + cadence - 1), 0);
    assert.equal(effectiveUpgradeDelta(node, node + cadence), 1);
    assert.equal(enemyWeightUpgradeCount(node + 1) - enemyWeightUpgradeCount(node), cadence);
    assert.equal(enemyWeightUpgradeCount(node) - enemyWeightUpgradeCount(node - 1), cadence / 2);
    node = node * 2 + 20;
    cadence *= 2;
  }
  assert.deepEqual([19, 20, 21, 60, 61, 140, 141].map(rank => registry.getEnemyDefinition(enemyKindAtRank("triangle", rank)).weight),
    [1110, 1170, 1290, 5970, 6210, 25170, 25650]);
});

test("weight budget inversion is exact at boundaries, preserves low ranks and remains bounded at huge ranks", () => {
  for (const [base, growth] of [[30, 60], [80, 120], [240, 200]]) {
    assert.equal(affordableEnemyRank(base, growth, base - 1), 0);
    for (let rank = 1; rank <= 2000; rank++) {
      const weight = enemyWeightAtRank(base, growth, rank);
      if (rank <= 20) assert.equal(weight, base + growth * (rank - 1));
      assert.equal(affordableEnemyRank(base, growth, weight), rank);
      assert.equal(affordableEnemyRank(base, growth, weight - 1), rank - 1);
      assert.equal(affordableEnemyRank(base, growth, weight + .5), rank);
    }
    for (const rank of [1000001, 1000000001]) {
      const weight = enemyWeightAtRank(base, growth, rank);
      assert.equal(affordableEnemyRank(base, growth, weight), rank);
    }
  }
  for (const rank of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => enemyWeightUpgradeCount(rank), RangeError);
  for (const growth of [0, -1, NaN, Infinity]) assert.throws(() => affordableEnemyRank(30, growth, 100), RangeError);
  assert.throws(() => affordableEnemyRank(30, 60, Infinity), RangeError);
});

test("endless selection matches a fully enumerated affordable pool under nonlinear weights", () => {
  const { buildInfiniteWaveKinds } = load("src/game/infiniteWaves.ts");
  const { buildWaveKinds } = load("src/game/waves.ts");
  const { BattleRandom } = load("src/game/battleSimulation.ts");
  const families = ["triangle", "square", "tilde", "dollar"];
  for (const budget of [1169, 1170, 1289, 1290, 5970, 6210, 25170, 25650, 150000]) {
    const pool = families.flatMap(family => {
      const kinds = [];
      for (let rank = 1; ; rank++) {
        const kind = enemyKindAtRank(family, rank);
        if (registry.getEnemyDefinition(kind).weight > budget) return kinds;
        kinds.push(kind);
      }
    });
    for (const seed of [1, 17, 998]) {
      const a = new BattleRandom(seed), b = new BattleRandom(seed);
      assert.deepEqual(buildInfiniteWaveKinds(families, budget, 100, 10, count => a.between(0, count - 1)),
        buildWaveKinds(pool, registry.getEnemyDefinition, budget, 100, 10, count => b.between(0, count - 1)));
    }
  }
});

test("chevron leader gains additive 50% base HP per rank, with unchanged magic ATK and defenses", () => {
  const behavior = load("src/game/enemyBehaviors.ts");
  for (const rank of [1, 2, 3, 20]) {
    const kind = enemyKindAtRank("chevronLeader", rank), stats = registry.getEnemyDefinition(kind);
    assert.equal(stats.hp, 32000 + (rank - 1) * 16000);
    assert.deepEqual([stats.armor, stats.magicResistance, stats.damage, stats.damageType, stats.speedMultiplier, stats.weight],
      [100, 50, 450, "magic", 1.5, 0]);
    assert.equal(registry.enemyIsLeader(kind), true);
    assert.equal(behavior.canEnemyMelee({ kind }), false);
    assert.equal(behavior.shouldEnemyShoot({ kind, attackAt: 0 }, 999999), false);
    assert.equal(behavior.enemyAttackSpeed(kind), 5);
  }
});

test("ion charge fires every twelve active seconds and assault switches only once without turning or healing", () => {
  const phaseLoad = createTypeScriptLoader({ "src/game/unitStats.ts": {
    applyEnemyBaseStats: (enemy, stats) => { enemy.baseStats = stats; }
  } });
  const { advanceIonCharge, updateChevronPhase, enemyUsesMaceMovement } = phaseLoad("src/game/chevronLeader.ts");
  const enemy = { kind: "chevronLeader2", hp: 48000, maxHp: 48000, movementDirection: 1,
    baseStats: { maxHp: 48000, armor: 100, speed: 15, magicResistance: 50, damage: 450, damageType: "magic" } };
  assert.equal(enemyUsesMaceMovement(enemy), false);
  let shots = 0;
  for (let i = 0; i < 720; i++) if (advanceIonCharge(enemy, 1 / 60)) shots++;
  assert.equal(shots, 1);
  assert.ok(enemy.ionChargeMs < 1e-6);
  assert.equal(updateChevronPhase(enemy), false);
  enemy.hp = 24001; assert.equal(updateChevronPhase(enemy), false);
  enemy.hp = 24000; enemy.ionChargeMs = 11999;
  assert.equal(updateChevronPhase(enemy), true);
  assert.deepEqual([enemy.hp, enemy.maxHp, enemy.maceFacingDirection, enemy.ionChargeMs, enemy.maceVelocity], [24000, 48000, 1, 0, 0]);
  assert.deepEqual([enemy.baseStats.armor, enemy.baseStats.speed, enemy.baseStats.magicResistance, enemy.baseStats.damageType], [260, 30, 50, "magic"]);
  assert.equal(enemyUsesMaceMovement(enemy), true);
  assert.equal(advanceIonCharge(enemy, 12), false);
  enemy.hp = 48000; assert.equal(updateChevronPhase(enemy), false);
  assert.equal(enemy.chevronAssault, true);
  assert.equal(updateChevronPhase({ ...enemy, hp: 0, chevronAssault: false }), false);
});

test("difficulty 0-7 shifts down, 8-9 use new multipliers and default stays at 3", () => {
  const { DIFFICULTY_MAX, DEFAULT_DIFFICULTY, clampDifficulty, getDifficultyConfig } = load("src/config.ts");
  const { getLevelConfig } = load("src/data/levels.ts");
  const { waveWeightLimit } = load("src/game/waves.ts");
  assert.equal(DIFFICULTY_MAX, 9);
  assert.equal(DEFAULT_DIFFICULTY, 3);
  assert.equal(clampDifficulty(9), 9);
  assert.equal(clampDifficulty(99), 9);
  assert.equal(clampDifficulty(-1), 0);
  assert.equal(clampDifficulty(), 3);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => getDifficultyConfig(i)),
    [[.5, 0], [1, 0], [1.4, .1], [1.8, .3], [2.2, .5], [2.6, .65], [3, .75], [4, .8], [5.2, .85], [6.66, .9]]
      .map(([weightMultiplier, finalDamageReduction]) => ({ weightMultiplier, finalDamageReduction })));
  const storage = new Map();
  const { setLanguage, t } = createTypeScriptLoader({}, { window: { localStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)
  } } })("src/i18n.ts");
  setLanguage("zh-CN");
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => t(`difficulty.${i}`)),
    ["非常简单", "简单", "略微简单", "普通", "略微困难", "困难", "非常困难", "不可能", "完全无解", "哈哈哈哈哈哈哈哈哈"]);
  setLanguage("en"); assert.equal(t("difficulty.3"), "NORMAL");
  const level = getLevelConfig("AE-6");
  assert.equal(waveWeightLimit(level, getDifficultyConfig(8), 1), 130);
  assert.equal(waveWeightLimit(level, getDifficultyConfig(9), 1), 166);
});

test("V prioritizes ranged attack modes, then final attack, then distance within its lane", () => {
  const targetingLoad = createTypeScriptLoader({
    phaser: { default: {} },
    "src/render/unitShapes.ts": {},
    "src/game/enemyBehaviors.ts": {
      enemyIsBurrowed: enemy => !!enemy.burrowed,
      enemyIsHighFlying: enemy => !!enemy.highFlightUntil
    },
    "src/game/statusEffects.ts": {
      statusMultipliers: enemy => ({ speed: 1, armor: 1, attack: enemy.attackMultiplier ?? 1 })
    }
  });
  const { getRangedHighestAttackTarget } = targetingLoad("src/game/targeting.ts");
  const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = targetingLoad("src/config.ts");
  const card = targetingLoad("src/data/cards.ts").cardDefinitions.find(card => card.id === "V");
  assert.equal(card.attackPower, 680);
  assert.equal(card.attackMultiplier, 2.5);
  assert.equal(card.mortarTargeting, "rangedHighestAttack");
  const tower = { type: "V", lane: 2, column: 3, statusEffects: [], x: BOARD_X + 3.5 * CELL_WIDTH, y: BOARD_Y + 2.5 * CELL_HEIGHT };
  const enemy = (kind, damage, offset = 100, extra = {}) => ({
    kind, inPlay: true, lane: 2, x: tower.x + offset, y: tower.y, statusEffects: [],
    baseStats: { maxHp: 5000, damage }, finalStats: {}, ...extra
  });
  const choose = enemies => getRangedHighestAttackTarget(tower, card, enemies, 1000);
  const melee = enemy("triangleRam", 9999);
  for (const kind of ["shootingTriangle", "diamond3", "shootingPentagon3", "mortarTriangle3", "pentagon2", "shootingTriangle20"]) {
    const ranged = enemy(kind, 100, 200);
    assert.equal(choose([melee, ranged]), ranged, kind);
    assert.equal(choose([ranged, melee]), ranged, kind);
  }
  const mortar = enemy("mortarTriangle3", 1150, 220), shooter = enemy("shootingTriangle", 400);
  assert.equal(choose([shooter, mortar]), mortar);
  shooter.attackMultiplier = 3;
  assert.equal(choose([mortar, shooter]), shooter);
  assert.equal(choose([enemy("circle", 400), melee]), melee);
  const near = enemy("pentagon", 800, 80), far = enemy("pentagon3", 800, 200);
  assert.equal(choose([far, near]), near);
  assert.equal(choose([near, far]), near);
  for (const extra of [{ lane: 1 }, { burrowed: true }, { highFlightUntil: 2000 }, { inPlay: false }, { x: tower.x - 80 }]) {
    assert.equal(choose([enemy("mortarTriangle", 99999, 100, extra), melee]), melee);
  }
  tower.facingDirection = -1;
  assert.equal(choose([near, far]), undefined);
  const behind = enemy("mortarTriangle", 1150, -100);
  assert.equal(choose([near, behind]), behind);
});

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
  assert.deepEqual(buildInfiniteWaveKinds(["triangle"], registry.getEnemyDefinition("triangle1000001").weight, 1, 10, length => length - 1), ["triangle1000001"]);
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
  assert.deepEqual(levelNodesForChapter("IFB").map(node => node.id), ["IF-BE-1", "IF-BE-2", "IF-BE-3", "IF-BE-4"]);
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
  assert.equal(rankedBossFamily("icosahedron"), undefined);
  assert.throws(() => bossStatsAtRank("icosahedron", 3));
  for (const rank of [0, -1, 1.5, Infinity, NaN]) assert.throws(() => tetrahedronChargeSpeedAtRank(rank));
});

test("all Boss Endless stages inherit source funding and weights but use IF dynamic ranks", () => {
  const { getLevelConfig } = load("src/data/levels.ts");
  const { chapterIdForLevelId } = load("src/data/chapters.ts");
  const { buildInfiniteWaveKinds } = load("src/game/infiniteWaves.ts");
  for (const [index, sourceId] of ["1-10", "2-10", "5-5", "5-8"].entries()) {
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
  assert.deepEqual(Object.keys(registry.allEnemyDefinitions).filter(kind => !["tilde", "equals", "parentheses", "dollar", "plus", "minus", "chevronLeader"].includes(registry.enemyFamily(kind))), Object.keys(legacy));
  for (const [kind, expected] of Object.entries(legacy)) {
    const currentExpected = expected.family === "triangleRam"
      ? { ...expected, definition: { ...expected.definition, minWave: 5 } } : expected;
    const registration = registry.getEnemyRegistration(kind);
    const { attackPower, attackMultiplier, ...definition } = registration.definition;
    assert.ok(attackPower === 0 || attackPower >= 250 && attackPower <= 800, kind);
    assert.ok(Math.abs(attackPower * attackMultiplier - definition.damage) < 1e-8, kind);
    assert.deepEqual({ ...registration, definition }, currentExpected, kind);
  }
});

test("enemy ranks keep bounded family ATK and preserve the original damage growth through multipliers", () => {
  for (const [family, archetype] of Object.entries(enemyArchetypes)) {
    for (const rank of family === "solarBomb" ? [1] : [1, 2, 3, 20, 60, 140, 300, 10000]) {
      const definition = registry.getEnemyDefinition(enemyKindAtRank(family, rank));
      const expected = archetype.base.damage + (archetype.growth.damage ?? 0) * (rank - 1);
      assert.equal(definition.attackPower, registry.getEnemyDefinition(family).attackPower);
      assert.ok(definition.attackPower === 0 || definition.attackPower >= 250 && definition.attackPower <= 800);
      assert.ok(Math.abs(definition.attackPower * definition.attackMultiplier - expected) <= Math.max(1, expected) * 1e-12, definition.kind);
    }
  }
});

test("old attack panels and buffered pipeline contexts migrate once without changing their output", () => {
  const real = createTypeScriptLoader({ phaser: { default: {} }, "src/render/unitShapes.ts": {} });
  const { getCardDefinition } = real("src/registry/cards.ts");
  const { migrateAttackStats } = real("src/game/attackStatsMigration.ts");
  const { towerAttackAmount } = real("src/game/unitStats.ts");
  const { withTowerActionContext } = real("src/game/towerIdentity.ts");
  const { upgradedAttackMultiplier } = real("src/game/upgrades.ts");
  const legacy = { x: 200, e: 90, g: 90, F: 1400, l: 15000, r: 200, G: 15000, K: 1800, S: 5000, V: 1700, d: 400 };
  for (const version of [undefined, 1, 2, 3]) {
    for (const [type, base] of Object.entries(legacy)) {
      const card = getCardDefinition(type), level = 22;
      const previousAttack = base * upgradedAttackMultiplier(type, 1, level);
      const expected = previousAttack * (type === "r" ? 5 : 1);
      const action = { type, level, stats: { attackPower: previousAttack / 2 } };
      const tower = { type: "@", copiedType: type, level: 17, levelBonus: 2, mirrorLevelBonus: 3,
        baseStats: { attackPower: base }, finalStats: { attackPower: previousAttack },
        projectileBank: { shots: [{ action, damage: expected / 2 }] },
        projectileNode: { input: [{ action }], output: [] },
        pipelineSkillContexts: { [type]: action } };
      const enemy = { kind: "heart2", baseStats: { damage: 3000 }, finalStats: { damage: 3900 } };
      migrateAttackStats(version, [tower], [enemy]);
      assert.ok(Math.abs(tower.finalStats.attackPower - card.attackPower) < 1e-8, type);
      assert.ok(Math.abs(towerAttackAmount(tower, card) - expected) < 1e-7, type);
      const stored = withTowerActionContext(tower, action, () => towerAttackAmount(tower, card));
      assert.ok(Math.abs(stored - expected / 2) < 1e-7, type);
      assert.equal(tower.projectileBank.shots[0].damage, expected / 2);
      assert.equal(enemy.baseStats.attackPower, 800);
      assert.equal(enemy.baseStats.attackMultiplier, 3.75);
      assert.equal(enemy.finalStats.attackPower, 1040);
      const checkpoint = structuredClone({ tower, enemy });
      migrateAttackStats(4, [tower], [enemy]);
      assert.deepEqual({ tower, enemy }, checkpoint);
    }
  }
});

test("normalized enemy ATK retains Power and passenger damage contributions", () => {
  const real = createTypeScriptLoader({ phaser: { default: {} }, "src/render/unitShapes.ts": {},
    "src/game/statusEffects.ts": { statusMultipliers: enemy => ({ attack: enemy.power ?? 1 }) } });
  const { enemyBaseStatsFromDefinition } = real("src/game/unitStats.ts");
  const { syncEnemyFinalStats } = real("src/game/combatStats.ts");
  const definition = registry.getEnemyDefinition("heart2");
  const baseStats = enemyBaseStatsFromDefinition(definition, { speed: 10, attackSpeed: 60, finalDamageReduction: 0 });
  const enemy = { kind: "heart2", hp: baseStats.maxHp, maxHp: baseStats.maxHp, baseStats, finalStats: { ...baseStats } };
  const final = syncEnemyFinalStats(enemy, { includeAttack: true, status: { attack: 1.3 } });
  assert.equal(final.attackPower, 1040);
  assert.equal(final.damage, 3900);
  assert.equal(baseStats.attackPower, 800);
  enemy.power = 1.3;
  const carrierBase = enemyBaseStatsFromDefinition(registry.getEnemyDefinition("parentheses"),
    { speed: 15, attackSpeed: 60, finalDamageReduction: 0 });
  const carrier = { kind: "parentheses", baseStats: carrierBase, finalStats: { ...carrierBase },
    parenthesisCargo: [enemy], power: 1.3 };
  const cargoStats = syncEnemyFinalStats(carrier, { includeAttack: true, status: { attack: 1.3 } });
  assert.equal(cargoStats.damage, (600 + 3900 * .35) * 1.3);
});

test("every minion and leader supports unregistered ranks through the same family growth rules", () => {
  for (const [family, archetype] of Object.entries(enemyArchetypes)) {
    if (["solarBomb", "dodecahedronCompanion", "tilde", "equals", "parentheses", "dollar", "plus", "minus", "chevronLeader"].includes(family)) continue;
    for (const rank of [4, 10, 100, 10000]) {
      const kind = enemyKindAtRank(family, rank);
      assert.equal(registry.enemyFamily(kind), family);
      assert.equal(registry.enemyRank(kind), rank);
      const definition = registry.getEnemyDefinition(kind);
      const one = legacy[family].definition;
      const two = legacy[`${family}2`].definition;
      for (const [field, value] of Object.entries(one)) {
        if (typeof value !== "number") continue;
        assert.equal(definition[field], value + (two[field] - value) * (field === "weight" ? enemyWeightUpgradeCount(rank) : rank - 1), `${kind}.${field}`);
      }
      assert.equal(definition.label, String(rank));
      assert.equal(registry.enemyIsLeader(kind), !!legacy[family].leader || legacy[family].attackMode === "leader");
    }
  }
});

test("all Triangle Ram ranks enter only from wave 5 in regular and unlimited pools", () => {
  const { buildWaveKinds } = load("src/game/waves.ts");
  const { buildInfiniteWaveKinds } = load("src/game/infiniteWaves.ts");
  const last = length => length - 1;
  const ranks = [1, 2, 3, 10, 100];
  for (const rank of ranks) {
    const kind = enemyKindAtRank("triangleRam", rank), panel = registry.getEnemyDefinition(kind);
    assert.equal(panel.minWave, 5);
    for (const ignoreMinFlag of [false, true]) {
      for (let wave = 1; wave <= 4; wave++) {
        assert.deepEqual(buildWaveKinds([kind], registry.getEnemyDefinition, panel.weight, wave, 10, last, ignoreMinFlag), []);
        const mixed = buildWaveKinds(["circle", kind], registry.getEnemyDefinition, panel.weight, wave, 10, last, ignoreMinFlag);
        assert.ok(mixed.length > 0 && mixed.every(id => id === "circle"));
      }
      assert.deepEqual(buildWaveKinds([kind], registry.getEnemyDefinition, panel.weight, 5, 10, last, ignoreMinFlag), [kind]);
    }
    assert.deepEqual(buildInfiniteWaveKinds(["triangleRam"], panel.weight, 4, 10, last), []);
    assert.deepEqual(buildInfiniteWaveKinds(["triangleRam"], panel.weight, 5, 10, last), [kind]);
  }
  for (let wave = 1; wave <= 4; wave++) {
    const kinds = buildInfiniteWaveKinds(["circle", "triangleRam"], 1000, wave, 10, last);
    assert.ok(kinds.length > 0 && kinds.every(kind => registry.enemyFamily(kind) === "circle"));
  }
  assert.deepEqual(buildInfiniteWaveKinds(["hexMace"], 375, 5, 10, last), [], "flag-gated enemies still wait for flag 1");
  assert.deepEqual(buildInfiniteWaveKinds(["hexMace"], 375, 10, 10, last), ["hexMace"]);
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

test("octahedron endless ranks grow HP linearly and inherit 5-8 without a weight cap", () => {
  const { bossStatsAtRank } = load("src/bosses/bossRanks.ts");
  for (const rank of [1, 2, 3, 100]) {
    assert.deepEqual(bossStatsAtRank("octahedron", rank), {
      hp: 120000 + 50000 * (rank - 1), armor: 200, magicResistance: 60, speed: 0.6
    });
  }
  const level = load("src/data/levels.ts").getLevelConfig("IF-BE-4");
  assert.equal(level.bossKind, "octahedron");
  assert.equal(level.unlockAfter, "5-8");
  assert.equal(level.startingChars, 10000);
  assert.equal(level.waveWeightIncrementGrowth, 7);
  assert.equal(level.waveWeightCap, undefined);
});

test("AE-1 uses the fourth chapter template and tildes match triangle panels at every rank", () => {
  const { enemyAttackInterval } = load("src/game/enemyBehaviors.ts");
  for (const rank of [1, 2, 3, 100]) {
    const tilde = enemyKindAtRank("tilde", rank), triangle = enemyKindAtRank("triangle", rank);
    assert.deepEqual({ ...registry.getEnemyDefinition(tilde), kind: triangle }, registry.getEnemyDefinition(triangle));
    assert.equal(enemyAttackInterval(tilde), enemyAttackInterval(triangle));
    assert.equal(registry.getEnemyDefinition(tilde).speedMultiplier, 1.5 + (rank - 1) * 0.5);
  }
  const level = load("src/data/levels.ts").getLevelConfig("AE-1");
  assert.equal(level.unlockAfter, "4-10");
  assert.equal(level.totalWaves, 20);
  assert.equal(level.startingChars, 500);
  assert.deepEqual([level.firstWaveWeight, level.waveWeightIncrement, level.waveWeightIncrementGrowth], [25, 18, 3]);
  assert.deepEqual(level.enemyKinds, ["circle", "triangle", "triangle2", "triangle3", "triangleRam", "triangleRam2", "triangleRam3", "tilde", "tilde2", "tilde3"]);
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
  const { getEnemyDisplayName } = load("src/enemyDisplayName.ts");
  assert.equal(getEnemyDisplayName("triangle100"), "TRIANGLE 100");
  assert.equal(getEnemyDisplayName("heart10000"), "HEART 10000");
  assert.equal(getEnemyDisplayName("triangle3"), "TRIANGLE 3");
  const { toRomanNumeral } = load("src/format.ts");
  assert.equal(toRomanNumeral(3), "III");
  assert.equal(toRomanNumeral(100), "C");
  assert.equal(toRomanNumeral(10000), "10000");
  assert.equal(toRomanNumeral(Number.MAX_SAFE_INTEGER).length, 16);
  assert.equal(toRomanNumeral(Infinity), "/");
});
