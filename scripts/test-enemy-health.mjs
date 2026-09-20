import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({ phaser: { default: {} }, "src/render/unitShapes.ts": {} });
const { getEnemyDefinition, enemyKindAtRank } = load("src/registry/enemies.ts");
const { initializeEnemyHealthLinks: link, changeEnemyHealth: change, detachEnemyHealth: detach,
  syncEnemyHealthCapacity: resize } = load("src/game/enemyHealth.ts");

function enemy(kind, x = 0, y = 0, ratio = 1) {
  const definition = getEnemyDefinition(kind);
  return { kind, x, y, inPlay: true, hp: definition.hp * ratio, maxHp: definition.hp,
    baseStats: { maxHp: definition.hp }, waveNumber: 1 };
}

test("AE-3 uses the chapter-four template and exact enemy pool, unlocking = and 1 but not +", () => {
  const { getLevelConfig } = load("src/data/levels.ts");
  const level = getLevelConfig("AE-3"), template = getLevelConfig("AE-1");
  assert.equal(level.totalWaves, 20);
  assert.equal(level.unlockAfter, "AE-2");
  for (const field of ["firstWaveWeight", "waveWeightIncrement", "waveWeightIncrementGrowth", "startingChars", "wavesPerFlag"])
    assert.equal(level[field], template[field], field);
  assert.deepEqual(level.enemyKinds, ["circle", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3", "shootingPentagon", "shootingTriangle", "diamond", "heart"]);
  assert.ok(!load("src/data/cards.ts").cardDefinitions.some(card => card.id === "+"));
  for (const id of ["=", "1"]) assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement(id), "AE-3");
});

test("equals ranks only grow weight and link capacity; attack matches Square I even at high ranks", () => {
  const { enemyAttackSpeed } = load("src/game/enemyBehaviors.ts");
  const { buildWaveKinds } = load("src/game/waves.ts");
  for (const rank of [1, 2, 3, 10, 100]) {
    const kind = enemyKindAtRank("equals", rank), panel = getEnemyDefinition(kind);
    assert.deepEqual([panel.hp, panel.armor, panel.magicResistance, panel.speedMultiplier], [12000, 100, 25, 1.5]);
    assert.equal(panel.damage, getEnemyDefinition("square").damage);
    assert.equal(panel.damageType, "physical");
    assert.equal(enemyAttackSpeed(kind), 60);
    assert.equal(panel.weight, 80 + (rank - 1) * 120);
    assert.equal(panel.healthLinkCapacity, rank);
  }
  const kinds = ["circle", "equals", "equals2", "equals3"];
  assert.ok(buildWaveKinds(kinds, getEnemyDefinition, 1000, 9, 10, n => n - 1).every(kind => kind === "circle"));
  assert.ok(buildWaveKinds(kinds, getEnemyDefinition, 1000, 10, 10, n => n - 1).includes("equals3"));
});

test("links choose nearest eligible units once, retain ties in spawn order, and do not retarget or refill", () => {
  const owner = enemy("equals2");
  const a = enemy("triangle", 10), b = enemy("circle", 10), far = enemy("square", 50);
  const excluded = [enemy("heart", 1), enemy("solarBomb", 1), enemy("equals", 1), enemy("dodecahedronCompanion", 1)];
  const dead = enemy("circle", 0); dead.inPlay = false;
  const units = [owner, far, a, b, dead, ...excluded];
  link(owner, units);
  assert.deepEqual(owner.healthPool.members, [owner, a, b]);
  far.x = 0; a.x = 100; link(owner, units);
  assert.deepEqual(owner.healthPool.members, [owner, a, b]);
  detach(a); a.inPlay = false; link(owner, units);
  assert.deepEqual(owner.healthPool.members, [owner, b]);
  assert.equal(far.healthPool, undefined);
  owner.kind = "equals3"; link(owner, units);
  assert.deepEqual(owner.healthPool.members, [owner, b], "promotion does not fill extra slots");
});

test("an empty spawn cannot link later, and another Equals cannot steal existing members", () => {
  const empty = enemy("equals"); link(empty, [empty]);
  const target = enemy("circle"); link(empty, [empty, target]);
  assert.equal(empty.healthPool, undefined);
  const first = enemy("equals"), second = enemy("equals");
  link(first, [first, target]);
  link(second, [first, second, target]);
  assert.equal(second.healthPool, undefined);
  assert.equal(target.healthPool.owner, first);
});

test("initial HP is weighted; damage and healing modify one pool and synchronize every member", () => {
  const owner = enemy("equals"), target = enemy("square", 10, 0, 0.5);
  link(owner, [owner, target]);
  const pool = owner.healthPool;
  assert.equal(pool.maxHp, 24000); assert.equal(pool.hp, 18000);
  assert.equal(owner.hp, 9000); assert.equal(target.hp, 9000);
  assert.equal(change(target, -6000), -6000);
  assert.equal(pool.hp, 12000); assert.equal(owner.hp, 6000); assert.equal(target.hp, 6000);
  assert.equal(change(owner, 3000), 3000);
  assert.equal(pool.hp, 15000); assert.equal(target.hp, 7500);
  change(owner, 100000); assert.equal(pool.hp, pool.maxHp);
  change(target, -100000); assert.equal(owner.hp, 0); assert.equal(target.hp, 0);
});

test("capacity changes and departures retain the shared ratio without adding new connections", () => {
  const owner = enemy("equals2"), a = enemy("triangle", 10), b = enemy("circle", 20);
  const units = [owner, a, b]; link(owner, units);
  change(owner, -owner.healthPool.maxHp / 2);
  a.baseStats.maxHp *= 2; resize(a);
  assert.equal(owner.healthPool.hp / owner.healthPool.maxHp, 0.5);
  assert.equal(a.hp, a.baseStats.maxHp / 2);
  detach(a); assert.equal(a.healthPool, undefined); assert.equal(a.hp, a.baseStats.maxHp / 2);
  assert.equal(owner.healthPool.maxHp, 15000); assert.equal(owner.healthPool.hp, 7500);
  detach(owner); assert.equal(b.healthPool, undefined); assert.equal(b.hp, 1500);
  link(owner, units); assert.equal(owner.healthPool, undefined);
});

test("a shared enemy pool survives graph serialization with all identities and one-shot state intact", () => {
  const { encodeSaveGraph, decodeSaveGraph } = load("src/game/saveGraph.ts");
  const owner = enemy("equals"), target = enemy("circle", 10);
  link(owner, [owner, target]); change(owner, -6000);
  const graph = encodeSaveGraph([owner, target], value => ({ kind: Array.isArray(value) ? "array" : "object" }));
  const [restored, partner] = decodeSaveGraph(JSON.parse(JSON.stringify(graph)), () => ({}));
  assert.equal(restored.healthPool, partner.healthPool);
  assert.equal(restored.healthPool.owner, restored);
  assert.deepEqual(restored.healthPool.members, [restored, partner]);
  assert.equal(restored.healthPool.hp, 9000);
  detach(partner); link(restored, [restored, partner]);
  assert.equal(restored.healthPool, undefined);
});
