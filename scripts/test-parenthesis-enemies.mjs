import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({ phaser: { default: {} }, "src/render/unitShapes.ts": {} });
const { getEnemyDefinition, enemyKindAtRank } = load("src/registry/enemies.ts");
const { canJoinEnemyGroup, enemyCanBeLoaded, enemyMaximumHp, enemiesWithPassengers, syncPassengerPositions } = load("src/game/enemyContainers.ts");
const { enemyAttackSpeed } = load("src/game/enemyBehaviors.ts");
const { segmentEnemyHitTime } = load("src/game/projectileMotion.ts");
const enemy = kind => ({ kind, inPlay: true, hp: 5000, baseStats: { maxHp: 5000 }, statusEffects: [] });

test("parentheses shrink individually while the distance between their centers stays fixed", () => {
  const { drawParentheses } = load("src/render/parenthesisEnemy.ts");
  const draw = scale => {
    const points = [], graphics = { clear() { return this; }, lineStyle() { return this; }, beginPath() {}, strokePath() {},
      moveTo(x, y) { points.push([x, y]); }, lineTo(x, y) { points.push([x, y]); } };
    drawParentheses(graphics, 120, scale); return points;
  };
  for (const scale of [1, .7, .4]) {
    const points = draw(scale);
    for (const [index, side] of [[0, -1], [21, 1]]) {
      const xs = points.slice(index, index + 21).map(p => p[0]);
      assert.equal((Math.min(...xs) + Math.max(...xs)) / 2, side * 114);
      assert.equal(points[index][1], -28 * scale);
    }
  }
});

test("AE-5 has 30 waves and the exact requested chapter-four pool", () => {
  const { getLevelConfig } = load("src/data/levels.ts");
  const level = getLevelConfig("AE-5"), base = getLevelConfig("AE-1");
  assert.equal(level.totalWaves, 30); assert.equal(level.unlockAfter, "AE-4");
  for (const field of ["firstWaveWeight", "waveWeightIncrement", "waveWeightIncrementGrowth", "startingChars", "wavesPerFlag"])
    assert.equal(level[field], base[field]);
  assert.deepEqual(level.enemyKinds, ["circle", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3",
    "triangleRam", "triangleRam2", "triangleRam3", "hexMace", "hexMace2", "parentheses", "parentheses2", "parentheses3", "slopeTriangle3"]);
});

test("AE-6 has 20 waves, follows AE-5 and uses the requested enemy ranks", () => {
  const { getLevelConfig, levelNodes } = load("src/data/levels.ts");
  const level = getLevelConfig("AE-6"), base = getLevelConfig("AE-1");
  assert.equal(level.totalWaves, 20);
  assert.equal(level.unlockAfter, "AE-5");
  assert.equal(levelNodes.filter(node => node.id === "AE-6").length, 1);
  for (const field of ["firstWaveWeight", "waveWeightIncrement", "waveWeightIncrementGrowth", "startingChars", "wavesPerFlag"])
    assert.equal(level[field], base[field]);
  assert.deepEqual(level.enemyKinds, ["circle", "circle2", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3",
    "parentheses", "parentheses2", "parentheses3", "mortarTriangle", "mortarTriangle2", "mortarTriangle3"]);
  for (const kind of level.enemyKinds) assert.ok(getEnemyDefinition(kind), kind);
});

test("Parentheses ranks scale capacity and weight only, retaining Triangle I attack", () => {
  for (const rank of [1, 2, 3, 100]) {
    const kind = enemyKindAtRank("parentheses", rank), definition = getEnemyDefinition(kind);
    assert.deepEqual([definition.hp, definition.armor, definition.magicResistance, definition.speedMultiplier], [5000, 100, 40, 1.5]);
    assert.equal(definition.damage, getEnemyDefinition("triangle").damage);
    assert.equal(enemyAttackSpeed(kind), 60);
    assert.equal(definition.weight, 80 + (rank - 1) * 120);
    assert.equal(enemyCanBeLoaded(enemy(kind)), false);
  }
});

test("shared group eligibility excludes Parentheses, Equals, leaders, linked and carried units", () => {
  for (const kind of ["parentheses", "parentheses3", "equals", "heart", "burrowArrow", "solarBomb", "dodecahedronCompanion"])
    assert.equal(canJoinEnemyGroup(enemy(kind)), false, kind);
  for (const kind of ["triangle", "hexMace2", "angelPentagon", "shootingTriangle"])
    assert.equal(canJoinEnemyGroup(enemy(kind)), true, kind);
  assert.equal(canJoinEnemyGroup({ ...enemy("triangle"), healthPool: {} }), false);
  assert.equal(canJoinEnemyGroup({ ...enemy("triangle"), parenthesisCarrier: {} }), false);
  assert.equal(canJoinEnemyGroup({ ...enemy("triangle"), inPlay: false }), false);
});

test("passenger seats keep oldest at rear, follow reversal, and use carrier flight display offset", () => {
  const cargo = Array.from({ length: 3 }, () => ({ ...enemy("triangle"), body: {
    setPosition(x, y) { this.x = x; this.y = y; }, setVisible(v) { this.visible = v; }, setDepth() {}
  } }));
  const host = { ...enemy("parentheses2"), x: 500, y: 300, lane: 2, movementDirection: -1,
    body: { x: 500, y: 270, visible: true }, parenthesisCargo: cargo, parenthesisHpBonus: 5250 };
  syncPassengerPositions(host);
  assert.deepEqual(cargo.map(p => p.x), [556, 500, 444]);
  assert.ok(cargo.every(p => p.body.y === 270 && p.body.visible));
  assert.equal(enemyMaximumHp(host), 10250);
  assert.deepEqual(enemiesWithPassengers([host]), [host, ...cargo]);
  host.statusEffects.push({ name: "reversed" }); syncPassengerPositions(host);
  assert.deepEqual(cargo.map(p => p.x), [444, 500, 556]);
});

test("elongated Parentheses intercept projectiles across the entire passenger formation", () => {
  const host = { parenthesisCargo: [enemy("triangle"), enemy("triangle"), enemy("triangle")] };
  assert.ok(segmentEnemyHitTime(host, 50, -100, 50, 100, 25) < 1);
  assert.equal(segmentEnemyHitTime({}, 50, -100, 50, 100, 25), Infinity);
  assert.equal(segmentEnemyHitTime(host, 100, -100, 100, 100, 25), Infinity);
});
