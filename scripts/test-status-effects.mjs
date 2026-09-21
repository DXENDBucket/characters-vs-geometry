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

test("Power supports different strengths without making a temporary stronger buff permanent", () => {
  const unit = enemy();
  applyStatusEffect(unit, "power", Infinity, 0);
  applyStatusEffect(unit, "power", 1000, 100, { attackMultiplier: 1.8 });
  assert.equal(enemyAttackDamage(unit, 100), 720);
  applyStatusEffect(unit, "power", 1000, 200, { attackMultiplier: 1.8 });
  assert.equal(unit.statusEffects.length, 2);
  assert.equal(enemyAttackDamage(unit, 1199), 720);
  assert.equal(enemyAttackDamage(unit, 1200), 520);
  const timed = enemy();
  applyStatusEffect(timed, "power", 1000, 0, { attackMultiplier: 1.6 });
  applyStatusEffect(timed, "power", 1000, 1000, { attackMultiplier: 1.1 });
  assert.ok(Math.abs(enemyAttackDamage(timed, 1000) - 440) < 1e-8);
  assert.equal(enemyAttackDamage(timed, 2000), 400);
});

test("Dollar ranks keep combat stats and grow weight plus Incitement target capacity", () => {
  const { getEnemyDefinition, enemyKindAtRank } = load("src/registry/enemies.ts");
  const { initialEnemySkillStates, enemyAttackSpeed } = load("src/game/enemyBehaviors.ts");
  for (const rank of [1, 2, 3, 100]) {
    const kind = enemyKindAtRank("dollar", rank), panel = getEnemyDefinition(kind);
    assert.deepEqual([panel.hp, panel.armor, panel.magicResistance, panel.damage, panel.speedMultiplier], [20000, 200, 50, 800, 1]);
    assert.equal(panel.weight, 240 + 200 * (rank - 1));
    assert.equal(enemyAttackSpeed(kind), 60);
    assert.deepEqual(initialEnemySkillStates(kind).incitement, { sp: 20, spBuffer: 0, activeUntil: 0 });
  }
});

test("Incitement selects nearest other minions, scaling by rank and excluding leader-restricted units", () => {
  const { incitementTargets } = load("src/game/incitement.ts");
  const caster = enemy("dollar", 0);
  const targets = Array.from({ length: 12 }, (_, i) => enemy("circle", 10 + i));
  const excluded = ["heart", "archangelHeptagon3", "hexSpellBulwark", "slopeTriangle", "burrowArrow", "solarBomb", "dodecahedronCompanion"].map(kind => enemy(kind, 1));
  excluded.push({ ...enemy("circle", 0), hp: 0 }, { ...enemy("circle", 0), inPlay: false });
  assert.deepEqual(incitementTargets(caster, [caster, ...excluded, ...targets]), targets.slice(0, 4));
  caster.kind = "dollar2";
  assert.deepEqual(incitementTargets(caster, [caster, ...excluded, ...targets]), targets.slice(0, 8));
  const tie = enemy("triangle", 10);
  assert.deepEqual(incitementTargets(caster, [tie, targets[0]]), [tie, targets[0]]);
});

test("Incitement casts at 25 SP for 20, recovers during the 15s buffs and never buffs itself", () => {
  const { updateIncitement } = load("src/game/incitement.ts");
  const { initialEnemySkillStates } = load("src/game/enemyBehaviors.ts");
  const caster = enemy("dollar"), target = enemy();
  const state = initialEnemySkillStates("dollar").incitement, runtime = { enemies: [caster, target] };
  updateIncitement(caster, state, 4, 4000, runtime);
  assert.equal(state.sp, 24); assert.equal(target.statusEffects.length, 0);
  updateIncitement(caster, state, 1, 5000, runtime);
  assert.equal(state.sp, 5); assert.equal(caster.statusEffects.length, 0);
  assert.equal(enemyAttackDamage(target, 19999), 520);
  assert.equal(statusMultipliers(target, 19999).speed, 2);
  updateIncitement(caster, state, 1, 6000, runtime); assert.equal(state.sp, 6);
  assert.equal(enemyAttackDamage(target, 20000), 400);
  assert.equal(statusMultipliers(target, 20000).speed, 1);
  updateIncitement(caster, state, 100, 20000, { enemies: [caster] });
  assert.equal(state.sp, 25, "no eligible target retains full SP");
});

test("the skill registry pauses Incitement while frozen and resumes without losing initial SP", () => {
  const { updateEnemySkills } = load("src/game/enemySupport.ts");
  const { initialEnemySkillStates } = load("src/game/enemyBehaviors.ts");
  const caster = enemy("dollar"), target = enemy(); caster.skills = initialEnemySkillStates("dollar");
  const runtime = { enemies: [caster, target] };
  applyStatusEffect(caster, "frozen", 1000, 0);
  updateEnemySkills(runtime, 1, 999); assert.equal(caster.skills.incitement.sp, 20);
  updateEnemySkills(runtime, 5, 1000); assert.equal(caster.skills.incitement.sp, 5);
  assert.equal(enemyAttackDamage(target, 1000), 520);
});
