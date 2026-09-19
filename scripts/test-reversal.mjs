import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const noop = () => {};
const effects = { makeReversalPulse: noop, makeBossHitFlash: noop, makeBossInvincibleFlash: noop, makeEnemyInvincibleFlash: noop };
// Keep real card data, hit resolution, status logic and trigger code; stub rendering.
const stubs = new Map(Object.entries({
  "src/render/combatEffects.ts": effects,
  "src/render/unitShapes.ts": { syncSolarBombShape: noop },
  "src/i18n.ts": { DAMAGE_SYMBOLS: {}, EFFECT_SYMBOLS: {} },
  "src/registry/enemies.ts": { enemyFamily: (kind) => kind.replace(/[23]$/, ""), enemyIsBossCompanion: () => false },
  "src/game/enemyBehaviors.ts": {
    enemyIsBurrowed: (enemy) => !!enemy.burrowed,
    enemyIsHighFlying: (enemy) => enemy.highFlightUntil !== undefined || enemy.statusEffects.some((effect) => effect.name === "highFlying"),
    syncEnemyVisualScale: noop,
    syncEnemyFacingVisual: (enemy) => { enemy.visualDirection = rules.enemyFacingDirection(enemy); }
  },
  "src/game/enemyRuntime.ts": { releaseBurrowCargo: noop, spawnSplitEnemies: noop },
  "src/game/combatStats.ts": { enemyDefenseStats: (enemy) => enemy.baseStats, bossFinalStats: (boss) => boss.baseStats },
  "src/game/slowAura.ts": {},
  "src/game/unitStats.ts": { towerFinalStats: (tower) => tower.finalStats },
  "src/game/cardAttackConfigs.ts": {},
  "src/bosses/cubeBoss.ts": { isIcosahedronBoss: () => false, isTetrahedronBoss: () => false }
}).map(([name, value]) => [path.resolve(root, name), value]));
const modules = new Map();
function load(name) {
  const filename = path.resolve(root, name);
  if (stubs.has(filename)) return stubs.get(filename);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};
  modules.set(filename, exports);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  new Function("require", "exports", outputText)((specifier) => {
    if (specifier === "phaser") return { default: { Math: { Clamp: (v, min, max) => Math.max(min, Math.min(max, v)) } } };
    return load(path.resolve(path.dirname(filename), `${specifier}.ts`));
  }, exports);
  return exports;
}

const rules = load("src/game/rules/reversal.ts");
const statuses = load("src/game/statusEffects.ts");
const towers = load("src/game/towers.ts");
const lifecycle = load("src/game/unitLifecycle.ts");
const triggers = load("src/game/triggerTowers.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const definition = cardDefinitions.find((card) => card.id === "r");

function visual() {
  return {
    x: 0, y: 0, visible: false, scaleX: 1, scaleY: 1,
    setPosition(x, y) { this.x = x; this.y = y; },
    setVisible(visible) { this.visible = visible; },
    setScale(x, y = x) { this.scaleX = x; this.scaleY = y; },
    setY(y) { this.y = y; }, setStrokeStyle: noop
  };
}
function enemy(overrides = {}) {
  return {
    kind: "triangle", x: 0, y: 0, hp: 5000, maxHp: 5000, inPlay: true, movementDirection: -1,
    statusEffects: [], statusMultiplierCache: { visualSyncedAt: NaN },
    baseStats: { armor: 150, magicResistance: 20, finalDamageReduction: 0 },
    body: visual(), shape: visual(), statusBorder: visual(), frozenBorder: visual(),
    powerIcon: visual(), sunderIcon: visual(), flyingHalo: visual(), ...overrides
  };
}
function tower(overrides = {}) {
  return {
    type: "r", x: 0, y: 0, level: 1, levelBonus: 0, mirrorLevelBonus: 0, inPlay: true,
    facingDirection: 1, statusEffects: [], finalStats: { damage: definition.damage },
    border: visual(), label: visual(), facingIcon: visual(), ...overrides
  };
}
function runtime(enemies = [], boss = null) {
  const state = {
    enemies, boss, battleTime: 1000, gameOver: false, scene: {},
    getBoss: () => boss, getDefinition: () => definition,
    removeTower: (unit) => { unit.inPlay = false; unit.mirrorLevelBonus = 0; },
    damageEnemy: (unit, damage, type, source) => lifecycle.damageEnemy(state, unit, damage, type, source),
    damageBoss: (damage, type, part) => lifecycle.damageBoss(state, damage, type, part)
  };
  return state;
}

test("r uses the requested panel and l cooldown; duration is linear including aura levels", () => {
  assert.equal(definition.cost, 275);
  assert.equal(definition.cooldown, cardDefinitions.find((card) => card.id === "l").cooldown);
  assert.equal(definition.damage, 200);
  assert.equal(definition.triggerAttackMultiplier, 5);
  for (const level of [1, 2, 3, 25]) {
    assert.equal(towers.getTriggerDebuffDuration(tower({ level }), definition), level * 5000);
  }
  assert.equal(towers.getTriggerDebuffDuration(tower({ level: 2, levelBonus: 1, mirrorLevelBonus: 2 }), definition), 25000);
  assert.equal(triggers.isShockTower(tower()), true);
});

test("one circular magic attack affects only hit targets, never invincible or untargetable enemies", () => {
  const radius = definition.triggerRangeX;
  const hit = enemy();
  const edge = enemy({ x: radius });
  const outsideCircle = enemy({ x: radius * 0.8, y: radius * 0.8 });
  const high = enemy({ statusEffects: [{ name: "highFlying", expiresAt: 99999 }] });
  const arc = enemy({ highFlightUntil: 99999 });
  const burrowed = enemy({ burrowed: true });
  const immune = enemy({ statusEffects: [{ name: "invincible", expiresAt: 99999 }] });
  const depleted = enemy({ kind: "solarBomb", hp: 1, solarBombDepleted: true, baseStats: { speed: 90 } });
  const removed = enemy({ inPlay: false });
  const caster = tower({ mirrorLevelBonus: 2 });
  const state = runtime([hit, edge, outsideCircle, high, arc, burrowed, immune, depleted, removed]);
  triggers.triggerShockTower(state, caster);
  assert.equal(caster.inPlay, false);
  for (const target of [hit, edge]) {
    assert.equal(target.hp, 4200); // 1000 magic against 20 MR, exactly once.
    assert.equal(target.statusEffects.find((effect) => effect.name === "reversed").expiresAt, 16000);
  }
  for (const target of [outsideCircle, high, arc, burrowed, immune, depleted, removed]) {
    assert.equal(target.statusEffects.some((effect) => effect.name === "reversed"), false);
    assert.equal(target.hp, target === depleted ? 1 : 5000);
  }
});

test("damage uses final attack and upgrades do not independently multiply it", () => {
  const target = enemy();
  triggers.triggerShockTower(runtime([target]), tower({ level: 3, finalStats: { damage: 300 } }));
  assert.equal(target.hp, 3800);
  assert.equal(target.statusEffects[0].expiresAt, 16000);
});

test("enemy reapplication extends without flipping twice, and expiry restores base facing", () => {
  const target = enemy();
  statuses.applyStatusEffect(target, "reversed", 5000, 1000);
  statuses.statusMultipliers(target, 1000);
  assert.equal(rules.enemyMovementDirection(target), 1);
  assert.equal(target.visualDirection, 1);
  statuses.applyStatusEffect(target, "reversed", 5000, 2000);
  assert.equal(target.statusEffects.length, 1);
  statuses.statusMultipliers(target, 6999);
  assert.equal(rules.enemyMovementDirection(target), 1);
  statuses.statusMultipliers(target, 7000);
  assert.equal(rules.enemyMovementDirection(target), -1);
  assert.equal(target.visualDirection, -1);
});

test("towers hold reversal and permanent facing changes survive expiry", () => {
  const target = tower();
  statuses.applyStatusEffect(target, "reversed", 5000, 0);
  assert.equal(towers.towerFacingDirection(target), -1);
  assert.equal(target.label.scaleX, -1);
  towers.toggleTowerFacing(target);
  assert.equal(towers.towerFacingDirection(target), 1);
  assert.equal(rules.expireReversalEffect(target, 4999), false);
  assert.equal(rules.expireReversalEffect(target, 5000), true);
  towers.syncTowerFacingVisual(target);
  assert.equal(towers.towerFacingDirection(target), -1);
  assert.equal(target.label.scaleX, -1);
});

test("slope and mace facing reverses without rewriting their momentum or base direction", () => {
  for (const field of ["slopeFacingDirection", "maceFacingDirection"]) {
    const target = enemy({ [field]: 1, maceVelocity: -25 });
    statuses.applyStatusEffect(target, "reversed", 5000, 0);
    assert.equal(rules.enemyFacingDirection(target), -1);
    assert.equal(target[field], 1);
    assert.equal(target.maceVelocity, -25);
  }
});

test("boss hitboxes use the attack path and invincible parts receive neither damage nor reversal", () => {
  for (const invincibleUntil of [0, 99999]) {
    const boss = {
      kind: "cube", x: definition.triggerRangeX + 50, y: 0, hp: 10000, maxHp: 10000,
      hitboxWidth: 120, hitboxHeight: 120, invincibleUntil, movementDirection: -1,
      baseStats: { armor: 200, magicResistance: 60, finalDamageReduction: 0 }, statusEffects: []
    };
    triggers.triggerShockTower(runtime([], boss), tower());
    assert.equal(boss.hp, invincibleUntil ? 10000 : 9600);
    assert.equal(rules.bossMovementDirection(boss), invincibleUntil ? -1 : 1);
    boss.movementAxis = "y";
    assert.equal(rules.bossMovementDirection(boss), -1);
  }
});
