import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({ phaser: { default: {} }, "src/render/unitShapes.ts": {} });
const { refreshStatusEffect, setMovementHasteEffect, activeStatusSpeedMultiplier } = load("src/game/rules/statusEffectRules.ts");
const { applyStatusEffect, statusMultipliers } = load("src/game/statusEffects.ts");
const { enemyMovementSpeed, enemyAttackDamage } = load("src/game/combatStats.ts");
const { enemySupportSources } = load("src/game/enemySupport.ts");
const { passengerMovementStatus } = load("src/game/parenthesisEnemies.ts");
const visual = () => new Proxy({}, { get: (_object, key) => key === "getData" ? () => undefined : () => visual() });
function enemy(kind = "circle", x = 400) {
  const stats = { maxHp: 3000, damage: 400, damageType: "physical", armor: 100, magicResistance: 0, speed: 10 };
  return { kind, inPlay: true, x, y: 300, lane: 3, maxHp: 3000, hp: 3000,
    baseStats: { ...stats }, finalStats: { ...stats }, statusEffects: [],
    statusMultiplierCache: { speed: 1, attack: 1, armor: 1, reversed: false },
    body: visual(), shape: visual(), statusBorder: visual(), frozenBorder: visual(),
    powerIcon: visual(), sunderIcon: visual(), flyingHalo: visual() };
}

test("timed haste and aura haste coexist without refreshing each other's magnitude or lifetime", () => {
  const unit = { statusEffects: [] };
  assert.equal(setMovementHasteEffect(unit, 1.5), true);
  refreshStatusEffect(unit, "haste", 7000, 2);
  assert.equal(activeStatusSpeedMultiplier(unit, 0), 3);
  assert.equal(setMovementHasteEffect(unit, 1.5), false);
  refreshStatusEffect(unit, "haste", 8000, 2.5);
  assert.equal(unit.statusEffects.length, 2);
  assert.equal(activeStatusSpeedMultiplier(unit, 7500), 3.75);
  assert.equal(activeStatusSpeedMultiplier(unit, 8000), 1.5);
  assert.equal(setMovementHasteEffect(unit, 1), true);
  assert.equal(activeStatusSpeedMultiplier(unit, 8000), 1);
  assert.equal(unit.statusEffects[0].expiresAt, 8000);
});

test("heart and charging-hex auras become one haste effect, matching indexed and direct support scans", () => {
  for (const indexed of [false, true]) {
    const target = enemy(), heart = enemy("heart", 200), hex = enemy("chargingHexagon", 250);
    const enemies = [target, heart, hex], context = { enemies, towers: [], time: 1000 };
    const speed = () => {
      context.supportSources = indexed ? enemySupportSources(enemies) : undefined;
      return enemyMovementSpeed(target, context);
    };
    applyStatusEffect(target, "haste", 7000, 0, 2);
    context.status = statusMultipliers(target, context.time);
    assert.equal(speed(), 30);
    assert.equal(speed(), 30, "reusing the status cache must not double or drop aura speed");
    assert.equal(target.statusEffects.filter(effect => effect.source === "movementAura").length, 1);
    heart.x = 500; assert.equal(speed(), 30);
    hex.x = 500; assert.equal(speed(), 20);
    assert.equal(target.statusEffects.length, 1, "leaving range must remove only aura haste");
    heart.x = 200; assert.equal(speed(), 30);
    heart.inPlay = false; assert.equal(speed(), 20);
    context.time = 7000; context.status = undefined;
    assert.equal(speed(), 10);
  }
});

test("haste multiplies with flight and stasis; freeze wins; power is nonstacking attack only", () => {
  const target = enemy();
  applyStatusEffect(target, "haste", 10000, 0, 2.5);
  applyStatusEffect(target, "flying", 10000, 0, 2);
  applyStatusEffect(target, "stasis", 10000, 0);
  applyStatusEffect(target, "power", Infinity, 0);
  applyStatusEffect(target, "power", Infinity, 100);
  assert.equal(statusMultipliers(target, 100).speed, 3.5);
  assert.equal(enemyAttackDamage(target, 100), 520);
  applyStatusEffect(target, "frozen", 10000, 100);
  assert.equal(statusMultipliers(target, 100).speed, 0);
  assert.equal(target.statusEffects.filter(effect => effect.name === "power").length, 1);
});

test("passengers do not inherit a second movement aura from their carrier", () => {
  const passenger = enemy(), carrier = enemy("parentheses");
  setMovementHasteEffect(passenger, 1.5); setMovementHasteEffect(carrier, 1.5);
  applyStatusEffect(carrier, "haste", 7000, 0, 2);
  assert.equal(passengerMovementStatus(passenger, carrier, 1000).speed, 3);
  applyStatusEffect(passenger, "haste", 7000, 0, 2.5);
  assert.equal(passengerMovementStatus(passenger, carrier, 1000).speed, 3.75);
});

test("boss haste uses the same timed effect and expires at exactly its deadline", () => {
  const boss = { rank: 2, statusEffects: [] };
  applyStatusEffect(boss, "haste", 60000, 1000, 3);
  assert.equal(boss.statusEffects[0].name, "haste");
  assert.equal(activeStatusSpeedMultiplier(boss, 60999), 3);
  assert.equal(activeStatusSpeedMultiplier(boss, 61000), 1);
});
