import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// No Phaser stubs: actual status, aura and final-panel code must work on data alone.
const load = createTypeScriptLoader();
const { createEnemyState } = load("src/game/enemyState.ts");
const { createBossState } = load("src/game/bossState.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const status = load("src/game/statusEffects.ts");
const stats = load("src/game/combatStats.ts");
const support = load("src/game/enemySupport.ts");
const slow = load("src/game/slowAura.ts");
const containers = load("src/game/enemyContainerRules.ts");
const { invalidateEnemyRoster } = load("src/game/enemyRoster.ts");
const { CELL_WIDTH, CELL_HEIGHT, BOARD_X, BOARD_Y } = load("src/config.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");

function enemy(kind = "circle", extra = {}) {
  return Object.assign(createEnemyState({ kind, waveNumber: 1, time: 0, lane: 3,
    x: BOARD_X + CELL_WIDTH * 6.5, waveWeight: 10, finalDamageReduction: .2 }, () => .5), extra);
}
function forbidRendering(unit) {
  for (const field of ["body", "shape", "statusBorder", "frozenBorder", "powerIcon", "sunderIcon", "flyingHalo", "statusMultiplierCache"]) {
    Object.defineProperty(unit, field, { get() { assert.fail(`Simulation read display field ${field}`); }, configurable: true });
  }
  return unit;
}
const tower = (type, lane = 3, column = 6) => createTowerState(cardDefinitions.find(card => card.id === type), lane, column, 0, 1);

test("effect lifecycle, freeze break and final combat stats do not access visual objects", () => {
  const unit = forbidRendering(enemy()), t = forbidRendering(tower("T"));
  status.applyStatusEffect(unit, "power", 2000, 0, { attackMultiplier: 1.8 });
  status.applyStatusEffect(unit, "flying", 3000, 0, 2);
  status.applyStatusEffect(unit, "stasis", 4000, 0);
  status.applyStatusEffect(unit, "sunder", 5000, 0);
  assert.deepEqual(status.statusMultipliers(unit, 1000), { speed: 1.4, attack: 1.8, armor: .5 });
  assert.equal(stats.enemyAttackDamage(unit, 1000), unit.baseStats.attackPower * 1.8 * unit.baseStats.attackMultiplier);
  assert.equal(stats.enemyDefenseStats(unit, [unit], 1000).armor, unit.baseStats.armor * .5);
  assert.equal(stats.enemyMovementSpeed(unit, { enemies: [unit], towers: [t], time: 1000 }), unit.baseStats.speed * 1.4 * (1 / 6));
  status.applyStatusEffect(unit, "frozen", 10000, 1000);
  assert.equal(stats.enemyMovementSpeed(unit, { enemies: [unit], towers: [], time: 1000 }), 0);
  assert.equal(status.addFrozenPhysicalDamage(unit, unit.maxHp * .25, 1001), false);
  assert.equal(status.addFrozenPhysicalDamage(unit, unit.maxHp * .25, 1002), true);
  assert.equal(status.hasStatusEffect(unit, "frozen", 1002), false);
  assert.equal(status.statusMultipliers(unit, 2000).attack, 1);
  assert.equal(status.isEnemyFlying(unit, 3000), false);
  assert.equal(status.statusMultipliers(unit, 5000).armor, 1);
  assert.deepEqual(unit.statusEffects, []);
});

test("Boss and tower status application uses logical identity, not a render cache discriminator", () => {
  const boss = forbidRendering(createBossState("tetrahedron2", .3)), t = forbidRendering(tower("A"));
  status.applyStatusEffect(boss, "haste", 3000, 1000, 2);
  status.applyStatusEffect(boss, "reversed", 3000, 1000);
  status.applyStatusEffect(t, "reversed", 3000, 1000);
  assert.deepEqual(boss.statusEffects.map(e => e.name), ["haste", "reversed"]);
  assert.equal(t.statusEffects[0].expiresAt, 4000);
  const archangel = forbidRendering(enemy("archangelHeptagon"));
  status.applyStatusEffect(archangel, "flying", 1000, 4000, 1, true);
  const high = archangel.statusEffects.find(e => e.name === "highFlying");
  assert.equal(high.expiresAt, 5000); assert.equal(high.showHalo, false);
});

test("status caches are per-unit, reuse output and cannot enter saved state", () => {
  const a = enemy(), b = enemy(), before = captureBattleSnapshot({ enemies: [a, b] });
  const first = status.statusMultipliers(a, 0);
  assert.equal(status.statusMultipliers(a, 0), first);
  assert.notEqual(status.statusMultipliers(b, 0), first);
  assert.deepEqual(captureBattleSnapshot({ enemies: [a, b] }), before);
  const rev = status.enemyStatusRevision(a);
  status.applyStatusEffect(a, "haste", 1000, 0, 2);
  assert.ok(status.enemyStatusRevision(a) > rev);
  assert.equal(status.statusMultipliers(a, 999), first); assert.equal(first.speed, 2);
  assert.equal(status.statusMultipliers(b, 999).speed, 1);
  assert.equal(status.statusMultipliers(a, 1000).speed, 1);
  assert.equal("statusMultiplierCache" in a, false);
});

test("passenger logical seats, reversal and health/attack contribution need no display hierarchy", () => {
  const carrier = forbidRendering(enemy("parentheses")), a = forbidRendering(enemy("triangleRam3")), b = forbidRendering(enemy("hexMace2"));
  carrier.parenthesisCargo = [a, b]; a.parenthesisCarrier = b.parenthesisCarrier = carrier;
  a.inPlay = b.inPlay = false;
  containers.syncPassengerPositionState(carrier);
  assert.equal(a.x, carrier.x + 52); assert.equal(b.x, carrier.x - 32);
  assert.equal(a.y, carrier.y); assert.equal(b.lane, carrier.lane);
  assert.equal(containers.enemyIsActive(a), true);
  status.applyStatusEffect(carrier, "reversed", 1000, 0);
  status.statusMultipliers(carrier, 999);
  assert.equal(a.x, carrier.x - 52); assert.equal(b.x, carrier.x + 32);
  status.statusMultipliers(carrier, 1000);
  assert.equal(a.x, carrier.x + 52); assert.equal(b.x, carrier.x - 32);
  const expected = carrier.baseStats.damage + (a.baseStats.damage + b.baseStats.damage) * .35;
  assert.equal(stats.enemyAttackDamage(carrier, 1000), expected);
  carrier.parenthesisHpBonus = 1000; carrier.environmentHpMultiplier = 1.7;
  assert.equal(stats.syncEnemyFinalStats(carrier).maxHp, (carrier.baseStats.maxHp + 1000) * 1.7);
  assert.deepEqual(containers.enemiesWithPassengers([carrier]), [carrier, a, b]);
  assert.deepEqual(containers.containedEnemies(carrier), [a, b]);
});

test("support views from two battles remain independent and preserve same-frame live modifiers", () => {
  const a = enemy(), hexA = enemy("hexagon", { x: a.x - 20 }), leaderA = enemy("heart", { x: a.x - 30 });
  const b = enemy(), hexB = enemy("hexagon3", { x: b.x - 20 });
  const rosterA = [a, hexA, leaderA], rosterB = [b, hexB];
  const viewA = support.enemySupportSources(rosterA), viewB = support.enemySupportSources(rosterB);
  assert.notEqual(viewA, viewB); assert.equal(viewA.enemies, rosterA); assert.equal(viewB.enemies, rosterB);
  assert.equal(support.enemySupportSources(rosterA), viewA);
  assert.equal(stats.enemyDefenseStats(a, rosterA, 0, viewA).armor, a.baseStats.armor + 50);
  assert.equal(stats.enemyDefenseStats(b, rosterB, 0, viewB).armor, b.baseStats.armor + 110);
  assert.equal(stats.enemyMovementSpeed(a, { enemies: rosterA, towers: [], time: 0, supportSources: viewA }), a.baseStats.speed * 1.5);
  assert.equal(stats.enemyMovementSpeed(b, { enemies: rosterB, towers: [], time: 0, supportSources: viewB }), b.baseStats.speed);
  hexA.x += CELL_WIDTH * 10;
  assert.equal(stats.enemyDefenseStats(a, rosterA, 0, viewA).armor, a.baseStats.armor);
  status.applyStatusEffect(hexB, "highFlying", 1000, 0);
  assert.equal(stats.enemyDefenseStats(b, rosterB, 0, viewB).armor, b.baseStats.armor);
  hexA.kind = "hexSpellBulwark2"; invalidateEnemyRoster(rosterA);
  support.enemySupportSources(rosterA);
  assert.equal(stats.enemyDefenseStats(a, rosterA, 0, viewA).magicResistance, a.baseStats.magicResistance + 50);
});

test("slow-aura views do not share cell buffers or cached positions across battles", () => {
  const a = tower("T", 3, 6), b = tower("T", 0, 0), rosterA = [a], rosterB = [b];
  const viewA = slow.slowAuraSources(rosterA), viewB = slow.slowAuraSources(rosterB);
  assert.notEqual(viewA, viewB); assert.notEqual(viewA.slowCells, viewB.slowCells);
  assert.equal(slow.movementSpeedMultiplier(rosterA, a.x, a.y, viewA), 1 / 6);
  assert.equal(slow.movementSpeedMultiplier(rosterB, a.x, a.y, viewB), 1);
  assert.equal(slow.slowAuraSources(rosterA), viewA);
  b.column = 6; b.lane = 3; slow.slowAuraSources(rosterB);
  assert.equal(slow.movementSpeedMultiplier(rosterB, a.x, a.y, viewB), 1 / 6);
  assert.equal(slow.movementSpeedMultiplier(rosterA, BOARD_X + CELL_WIDTH * .5, BOARD_Y + CELL_HEIGHT * .5, viewA), 1);
  a.inPlay = false; slow.slowAuraSources(rosterA);
  assert.equal(viewA.hasAura, false); assert.equal(viewB.hasAura, true);
});

test("Boss final armor, body-count reduction, companion protection and DEL speed run headlessly", () => {
  const root = forbidRendering(createBossState("icosahedron", .3)), copy = forbidRendering(createBossState("icosahedron", .3));
  root.octahedronCopies = [copy, createBossState("icosahedron", .3)];
  const hex = enemy("hexagon2", { x: copy.x, y: copy.y }), companion = enemy("dodecahedronCompanion");
  const panel = stats.bossFinalStats(copy, [hex, companion], root);
  assert.equal(panel.armor, copy.baseStats.armor + 80);
  const bodyReduction = 1 - (1 - .3) * (1 - .4);
  assert.equal(panel.finalDamageReduction, 1 - (1 - bodyReduction) * (1 - .95));
  companion.inPlay = false;
  assert.equal(stats.bossFinalStats(copy, [hex, companion], root).finalDamageReduction, 1 - (1 - .3) * (1 - .4));
  const del = forbidRendering(createBossState("del", 0));
  del.delSweep = { phase: "returning" };
  assert.equal(stats.bossFinalStats(del, []).speed, 600);
});
