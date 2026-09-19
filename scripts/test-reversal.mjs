import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const noop = () => {};
const effects = {
  makeAutoUpgradePulse: noop,
  makeReversalPulse: noop, makeBossHitFlash: noop, makeBossInvincibleFlash: noop, makeEnemyInvincibleFlash: noop,
  makeShockPulse: noop, makeTrapBurst: noop, makeSlashEffect: noop, makeArcWaveEffect: noop, makeShiftEffect: noop,
  makeTowerLaserEffect: noop, makeHitShards: noop, makeSunderEffect: noop, makeHealParticles: noop,
  damageEffectTextColor: () => "#ffffff"
};
// Keep real card data, hit resolution, status logic and trigger code; stub rendering.
const stubs = new Map(Object.entries({
  "src/render/combatEffects.ts": effects,
  "src/render/unitShapes.ts": { syncSolarBombShape: noop, createUnitBorder: () => uiVisual() },
  "src/i18n.ts": { DAMAGE_SYMBOLS: {}, EFFECT_SYMBOLS: {} },
  "src/registry/enemies.ts": { enemyFamily: (kind) => kind.replace(/[23]$/, ""), enemyIsBossCompanion: () => false },
  "src/game/enemyBehaviors.ts": {
    enemyIsBurrowed: (enemy) => !!enemy.burrowed,
    enemyIsHighFlying: (enemy) => enemy.highFlightUntil !== undefined || enemy.statusEffects.some((effect) => effect.name === "highFlying"),
    syncEnemyVisualScale: noop,
    siegeRamSpeed: () => 10,
    syncEnemyFacingVisual: (enemy) => { enemy.visualDirection = rules.enemyFacingDirection(enemy); }
  },
  "src/game/enemyRuntime.ts": { releaseBurrowCargo: noop, spawnSplitEnemies: noop },
  "src/game/combatStats.ts": {
    enemyDefenseStats: (enemy) => enemy.baseStats, bossFinalStats: (boss) => boss.baseStats,
    enemyMovementSpeed: () => 10
  },
  "src/game/slowAura.ts": { isPointInSlowAura: () => true },
  "src/game/enemySupport.ts": { enemySupportSources: () => ({}) },
  "src/game/projectiles.ts": {
    createTowerProjectile: (_scene, spec) => ({ ...spec }),
    createHomingTowerProjectile: (_scene, spec) => ({ ...spec }),
    createMortarProjectile: (_scene, spec) => ({ ...spec })
  },
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
    if (specifier === "phaser") return { default: { Math: {
      Clamp: (v, min, max) => Math.max(min, Math.min(max, v)), DegToRad: (degrees) => degrees * Math.PI / 180
    }, Utils: { Array: { Remove: (array, value) => {
      const index = array.indexOf(value);
      if (index >= 0) array.splice(index, 1);
    } } } } };
    return load(path.resolve(path.dirname(filename), `${specifier}.ts`));
  }, exports);
  return exports;
}

const rules = load("src/game/rules/reversal.ts");
const statuses = load("src/game/statusEffects.ts");
const towers = load("src/game/towers.ts");
const stats = load("src/game/unitStats.ts");
const upgrades = load("src/game/upgrades.ts");
const lifecycle = load("src/game/unitLifecycle.ts");
const triggers = load("src/game/triggerTowers.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const definition = cardDefinitions.find((card) => card.id === "r");

function uiVisual() {
  const object = { x: 0, y: 0, width: 42, alpha: 1, visible: true, scaleX: 1, scaleY: 1 };
  const proxy = new Proxy(object, {
    get(target, property) {
      if (property in target) return target[property];
      return (...args) => {
        if (property === "setVisible") target.visible = args[0];
        if (property === "setText") target.text = args[0];
        if (property === "destroy") target.destroyed = true;
        return proxy;
      };
    }
  });
  return proxy;
}

function extractionFixture() {
  const { TowerExtractionPool } = load("src/game/towerExtraction.ts");
  const { TowerDeploymentController } = load("src/game/towerDeployment.ts");
  const { TargetedEffectCardController } = load("src/game/targetedEffectCards.ts");
  let order = 0;
  const pending = [];
  const removed = [];
  const state = {
    scene: { add: new Proxy({}, { get: () => () => uiVisual() }), time: { delayedCall: (_delay, action) => pending.push(action) }, tweens: { add: noop } },
    towers: [], occupied: new Map(), chars: 10_000, battleTime: 0, unlimitedFirepower: false,
    autoUpgradeEnabled: true, autoUpgradeReserveChars: 0, autoUpgradeReserveInputFocused: false,
    extraction: new TowerExtractionPool(), cardStates: cardDefinitions.map(definition => ({ definition, readyAt: 0 })),
    getDefinition: id => cardDefinitions.find(card => card.id === id), cardTimeFor: () => state.battleTime,
    getChars: () => state.chars, spendChars: amount => { state.chars -= amount; }, nextTowerOrder: () => order++,
    resetTowerSkill: noop, updateLevelAuras: noop, updateCards: noop, runWhenBattleActive: action => action(),
    isCellDeployable: (lane, column) => lane >= 0 && lane < 7 && column >= 0 && column < 13,
    removeTower: unit => {
      if (!unit.inPlay) return;
      removed.push(unit.id);
      unit.inPlay = false;
      state.towers.splice(state.towers.indexOf(unit), 1);
      if (!unit.transient) state.occupied.delete(`${unit.lane}:${unit.column}`);
    }
  };
  const deployment = new TowerDeploymentController(() => state);
  const targeted = new TargetedEffectCardController(() => state);
  const place = (id, level = 1, lane = 1, column = 1) => {
    const card = state.getDefinition(id);
    const unit = towers.createTower(state.scene, card, lane, column, state.battleTime, order++);
    if (level > 1) towers.applyTowerUpgradeStats(unit, card, towers.upgradeTowerLevel(unit, level - 1), state.battleTime);
    state.towers.push(unit);
    state.occupied.set(`${lane}:${column}`, unit);
    return unit;
  };
  return { state, deployment, targeted, place, removed, flush: () => { while (pending.length) pending.shift()(); } };
}

const health = load("src/game/towerHealth.ts");

test("u has its requested panel and only upgrades its own HP contribution", () => {
  const f = extractionFixture();
  const u = f.place("u", 1, 2, 2);
  const b = f.place("B", 1, 2, 3);
  const card = f.state.getDefinition("u");
  assert.equal(card.cost, 5600);
  assert.equal(card.cooldown, 180000);
  assert.equal(card.category, "defense");
  assert.equal(card.attackPower, 0);
  assert.equal(card.attackSpeed, undefined);
  assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement("u"), "4-9");
  health.syncTowerHealthNetworks(f.state.towers);
  health.changeTowerHealth(b, -1200);
  towers.applyTowerUpgradeStats(u, card, towers.upgradeTowerLevel(u), 0);
  assert.equal(u.finalStats.maxHp, 5400);
  assert.equal(b.finalStats.maxHp, 3000);
  assert.equal(u.healthPool.maxHp, 8400);
  assert.equal(u.healthPool.hp, 7200);
  assert.equal(u.hpFill.width, b.hpFill.width);
});

test("u links only cardinal neighbors and divides by tower count, never u levels", () => {
  const f = extractionFixture();
  const left = f.place("u", 2, 2, 2);
  const bridge = f.place("A", 1, 2, 3);
  const right = f.place("u", 1, 2, 4);
  const end = f.place("B", 1, 2, 5);
  const diagonal = f.place("D", 1, 1, 1);
  const beyond = f.place("D", 1, 2, 6);
  const transient = f.place("b", 1, 1, 2);
  transient.transient = true;
  health.syncTowerHealthNetworks(f.state.towers);
  assert.equal(left.healthPool, right.healthPool);
  assert.equal(bridge.healthPool, end.healthPool);
  assert.equal(left.healthPool.members.length, 4);
  assert.equal(left.healthPool.linkCount, 2);
  assert.equal(left.healthPool.maxHp, (5400 + 1200 + 3000 + 3000) / 2);
  for (const unit of [diagonal, beyond, transient]) assert.equal(unit.healthPool, undefined);
});

test("pool joining and leaving preserve ratio, including changed u divisor", () => {
  const f = extractionFixture();
  const u = f.place("u", 1, 2, 2);
  const a = f.place("A", 1, 2, 3);
  health.syncTowerHealthNetworks(f.state.towers);
  health.changeTowerHealth(a, -2100);
  const second = f.place("u", 1, 2, 4);
  health.syncTowerHealthNetworks(f.state.towers);
  assert.equal(u.healthPool.maxHp, 3600);
  assert.equal(u.healthPool.hp, 1800);
  second.column = 9;
  health.syncTowerHealthNetworks(f.state.towers);
  assert.equal(u.healthPool.maxHp, 4200);
  assert.equal(u.healthPool.hp, 2100);
  assert.equal(second.healthPool.maxHp, 3000);
  assert.equal(second.healthPool.hp, 1500);
  a.column = 6;
  health.syncTowerHealthNetworks(f.state.towers);
  assert.equal(a.healthPool, undefined);
  assert.equal(a.hp, 600);
  assert.equal(u.healthPool.hp, 1500);
  assert.equal(u.hpFill.width, 21);
});

test("merging weights previous actual pool capacities, with each old network counted once", () => {
  const f = extractionFixture();
  const left = f.place("u", 1, 2, 1);
  f.place("u", 1, 2, 2);
  f.place("B", 1, 2, 3);
  const right = f.place("u", 1, 2, 5);
  f.place("B", 1, 2, 6);
  health.syncTowerHealthNetworks(f.state.towers);
  health.changeTowerHealth(left, -3600); // 900 / 4500
  health.changeTowerHealth(right, -1200); // 4800 / 6000
  right.column = 4;
  health.syncTowerHealthNetworks(f.state.towers);
  assert.equal(left.healthPool, right.healthPool);
  assert.equal(left.healthPool.maxHp, 4000);
  assert.ok(Math.abs(left.healthPool.hp / 4000 - 5700 / 10500) < 1e-12);
});

test("initial formation weights individual HP and topology refresh never changes pool health", () => {
  const f = extractionFixture();
  const b = f.place("B", 1, 2, 3);
  b.hp = 600;
  const u = f.place("u", 1, 2, 2);
  health.syncTowerHealthNetworks(f.state.towers);
  assert.equal(u.healthPool.hp, 3600);
  for (let i = 0; i < 10; i++) health.syncTowerHealthNetworks(f.state.towers);
  assert.equal(u.healthPool.hp, 3600);
  assert.equal(u.hp, 1800);
  assert.equal(b.hp, 1800);
});

test("linked damage uses struck defenses once and healing adds actual HP to the shared pool", () => {
  const f = extractionFixture();
  const u = f.place("u", 1, 2, 2);
  const a = f.place("A", 1, 2, 3);
  health.syncTowerHealthNetworks(f.state.towers);
  const runtime = { ...f.state, onTowerDamaged: noop };
  lifecycle.damageTower(runtime, a, 1000, "physical");
  assert.equal(u.healthPool.hp, 3350); // A armor 150
  lifecycle.damageTower(runtime, u, 1000, "physical");
  assert.equal(u.healthPool.hp, 2850); // u armor 500
  assert.equal(health.changeTowerHealth(a, 700), 700);
  assert.equal(u.healthPool.hp, 3550);
  assert.equal(a.hpFill.width, u.hpFill.width);
  assert.equal(health.changeTowerHealth(u, 9000), 650);
  assert.equal(u.hpFill.width, 42);
});

test("removing u dismantles its network without killing neighbors; depleted pools kill all members", () => {
  const f = extractionFixture();
  const u = f.place("u", 1, 2, 2);
  const a = f.place("A", 1, 2, 3);
  health.syncTowerHealthNetworks(f.state.towers);
  health.changeTowerHealth(a, -2100);
  const removed = [];
  const runtime = { ...f.state, onTowerDamaged: noop, onTowerRemoved: unit => removed.push(unit) };
  lifecycle.removeTower(runtime, u);
  assert.equal(a.inPlay, true);
  assert.equal(a.healthPool, undefined);
  assert.equal(a.hp, 600);
  const next = f.place("u", 1, 2, 2);
  health.syncTowerHealthNetworks(f.state.towers);
  lifecycle.damageTower(runtime, a, 100000, "true");
  assert.equal(a.inPlay, false);
  assert.equal(next.inPlay, false);
  assert.equal(f.state.towers.length, 0);
  assert.equal(removed.length, 3);
});

test("upgrading a multi-u network scales only the HP delta by u count", () => {
  const f = extractionFixture();
  const u = f.place("u", 1, 2, 2);
  f.place("u", 1, 2, 3);
  health.syncTowerHealthNetworks(f.state.towers);
  health.changeTowerHealth(u, -1500);
  towers.applyTowerUpgradeStats(u, f.state.getDefinition("u"), towers.upgradeTowerLevel(u), 0);
  assert.equal(u.healthPool.maxHp, 4200);
  assert.equal(u.healthPool.hp, 2700);
  health.syncTowerHealthNetworks(f.state.towers);
  assert.equal(u.healthPool.maxHp, 4200);
  assert.equal(u.healthPool.hp, 2700);
});

test("y has a 4-4 unlock and accumulates exact permanent-level value at additive extraction rates", () => {
  const { state } = extractionFixture();
  const y = state.getDefinition("y");
  assert.equal(y.cost, 3250);
  assert.equal(y.cooldown, 120000);
  assert.equal(y.attackPower, 0);
  assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement("y"), "4-4");
  const source = { level: 3, levelBonus: 90, mirrorLevelBonus: 50 };
  for (const [level, amount] of [[1, 112.5], [2, 168.75], [3, 225], [4, 281.25]]) {
    assert.equal(state.extraction.extract(source, 75, level), amount);
  }
  assert.equal(state.extraction.value, 787.5);
  assert.deepEqual(state.extraction.plan({ cost: 50 }), { levels: 15, cost: 750, usesPool: true });
});

test("y resolves once, erases its target, keeps 120s cooldown and adds to an existing pool", () => {
  const f = extractionFixture();
  const target = f.place("A", 20);
  target.levelBonus = 500;
  f.state.extraction.extract({ level: 1 }, 20, 1);
  const y = f.state.getDefinition("y");
  assert.equal(f.targeted.use(y, 1, 1, target), "handled");
  assert.equal(f.state.extraction.value, 10);
  f.flush();
  assert.equal(f.state.extraction.value, 510);
  assert.equal(f.state.chars, 6750);
  assert.equal(target.inPlay, false);
  assert.equal(f.state.towers.length, 0);
  assert.equal(f.state.occupied.size, 0);
  assert.equal(f.state.cardStates.find(card => card.definition.id === "y").readyAt, 120000);
  f.flush();
  assert.equal(f.state.extraction.value, 510);
  assert.equal(f.removed.length, 2);
});

test("multi-level pending y uses its own level but never refunds its cooldown or duplicates a lost target", () => {
  const f = extractionFixture();
  const target = f.place("B", 4);
  const y = f.state.getDefinition("y");
  f.targeted.use(y, 1, 1, target);
  f.state.towers.find(unit => unit.type === "y").level = 2;
  f.flush();
  assert.equal(f.state.extraction.value, 225);
  assert.equal(f.state.cardStates.find(card => card.definition.id === "y").readyAt, 120000);
  f.state.battleTime = 120000;
  const lost = f.place("A");
  f.targeted.use(y, 1, 1, lost);
  f.state.removeTower(lost);
  f.flush();
  assert.equal(f.state.extraction.value, 225);
});

test("510 extraction buys one level-10 A for 500, consumes all remainder and preserves failed deployments", () => {
  const f = extractionFixture();
  const a = f.state.getDefinition("A");
  f.state.extraction.extract({ level: 1 }, 1020, 1);
  f.state.chars = 499;
  assert.equal(f.deployment.useCard(a, 1, 1), "noChars");
  assert.equal(f.state.extraction.value, 510);
  f.state.chars = 500;
  assert.equal(f.deployment.useCard(a, -1, 1), "occupied");
  f.place("B");
  assert.equal(f.deployment.useCard(a, 1, 1), "occupied");
  f.state.cardStates.find(card => card.definition.id === "A").readyAt = 1;
  assert.equal(f.deployment.useCard(a, 1, 2), "cooldown");
  assert.equal(f.state.extraction.value, 510);
  f.state.battleTime = 1;
  assert.equal(f.deployment.useCard(a, 1, 2), "deployed");
  assert.equal(f.state.occupied.get("1:2").level, 10);
  assert.equal(f.state.chars, 0);
  assert.equal(f.state.extraction.value, 0);
  assert.equal(f.state.cardStates.find(card => card.definition.id === "A").readyAt, 1001);
});

test("expensive cards keep the pool; matching towers and mirror members gain the batch exactly once", () => {
  const f = extractionFixture();
  f.state.extraction.extract({ level: 1 }, 1500, 1);
  assert.equal(f.deployment.useCard(f.state.getDefinition("m"), 0, 0), "deployed");
  assert.equal(f.state.extraction.value, 750);
  const first = f.place("B", 1, 1, 1);
  const second = f.place("B", 1, 1, 2);
  f.state.mirrorGroupFor = () => [first, second];
  const before = f.state.chars;
  assert.equal(f.deployment.useCard(f.state.getDefinition("B"), 1, 1), "deployed");
  assert.deepEqual([first.level, second.level], [11, 11]);
  assert.equal(first.hp, stats.towerFinalStats(first).maxHp);
  assert.equal(f.state.chars, before - 750);
  assert.equal(f.state.extraction.value, 0);
});

test("automatic upgrades respect the full batch price and reserve and consume the shared pool once", () => {
  const f = extractionFixture();
  f.state.extraction.extract({ level: 1 }, 1020, 1);
  const a = f.place("A"); a.autoUpgrade = true;
  const b = f.place("B", 1, 1, 2); b.autoUpgrade = true;
  f.state.chars = 600;
  f.state.autoUpgradeReserveChars = 150;
  f.deployment.attemptAutoUpgrades();
  assert.equal(f.state.extraction.value, 0); // B's 450 batch fits the reserve; A's 500 batch does not.
  assert.equal(a.level, 1);
  assert.equal(b.level, 7);
  assert.equal(f.state.chars, 150);
});

test("targeted b and t consume shared batches once and keep their level-based effects", () => {
  const f = extractionFixture();
  const target = f.place("A");
  f.state.extraction.extract({ level: 1 }, 5100, 1);
  const b = f.state.getDefinition("b");
  assert.equal(f.targeted.use(b, 1, 1, target), "handled");
  assert.equal(f.state.extraction.value, 0);
  assert.equal(f.state.chars, 7450);
  f.flush();
  assert.equal(target.facingDirection, -1);
  assert.equal(f.state.cardStates.find(card => card.definition.id === "b").readyAt, 10000 / 34);
  f.state.extraction.extract({ level: 1 }, 5550, 1);
  assert.equal(f.targeted.use(f.state.getDefinition("t"), 1, 1, target), "handled");
  f.flush();
  assert.equal(target.trueDamageUntil, 36000);
  assert.equal(f.state.extraction.value, 0);
});

test("pool eligibility includes cost 999, excludes 1000 and handles small pools without zero-level deployments", () => {
  const { state } = extractionFixture();
  assert.deepEqual(state.extraction.plan({ cost: 50 }), { levels: 1, cost: 50, usesPool: false });
  state.extraction.extract({ level: 1 }, 20, 1);
  assert.deepEqual(state.extraction.plan({ cost: 999 }), { levels: 1, cost: 999, usesPool: true });
  assert.deepEqual(state.extraction.plan({ cost: 1000 }), { levels: 1, cost: 1000, usesPool: false });
  state.extraction.consume(state.extraction.plan({ cost: 1000 }));
  assert.equal(state.extraction.value, 10);
  state.extraction.consume(state.extraction.plan({ cost: 999 }));
  assert.equal(state.extraction.value, 0);
});

test("unlimited-firepower batch charges once and upgrades a mirrored column group only once", () => {
  const f = extractionFixture();
  f.state.unlimitedFirepower = true;
  f.state.extraction.extract({ level: 1 }, 1020, 1);
  const a = f.place("A", 1, 1, 1);
  const b = f.place("A", 1, 2, 1);
  a.mirrorGroupId = b.mirrorGroupId = 1;
  f.state.mirrorGroupFor = () => [a, b];
  assert.equal(f.deployment.useCard(f.state.getDefinition("A"), 1, 1), "deployed");
  assert.deepEqual([a.level, b.level], [11, 11]);
  assert.equal(f.state.towers.length, 7);
  assert(f.state.towers.filter(unit => unit !== a && unit !== b).every(unit => unit.level === 10));
  assert.equal(f.state.chars, 9500);
  assert.equal(f.state.extraction.value, 0);
});

function visual() {
  return {
    x: 0, y: 0, visible: false, scaleX: 1, scaleY: 1,
    setPosition(x, y) { this.x = x; this.y = y; },
    setVisible(visible) { this.visible = visible; },
    setScale(x, y = x) { this.scaleX = x; this.scaleY = y; },
    setY(y) { this.y = y; }, setStrokeStyle: noop,
    setDepth(depth) { this.depth = depth; }, destroy() { this.destroyed = true; }
  };
}
function enemy(overrides = {}) {
  return {
    kind: "triangle", x: 0, y: 0, hp: 5000, maxHp: 5000, inPlay: true, movementDirection: -1,
    statusEffects: [], statusMultiplierCache: { visualSyncedAt: NaN },
    baseStats: { maxHp: 5000, armor: 150, magicResistance: 20, finalDamageReduction: 0 },
    body: visual(), shape: visual(), statusBorder: visual(), frozenBorder: visual(),
    powerIcon: visual(), sunderIcon: visual(), flyingHalo: visual(), ...overrides
  };
}
function tower(overrides = {}) {
  return {
    type: "r", x: 0, y: 0, level: 1, levelBonus: 0, mirrorLevelBonus: 0, inPlay: true,
    facingDirection: 1, statusEffects: [], finalStats: { attackPower: definition.attackPower },
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
  assert.equal(definition.attackPower, 200);
  assert.equal(definition.attackMultiplier, 5);
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
  triggers.triggerShockTower(runtime([target]), tower({ level: 3, finalStats: { attackPower: 300 } }));
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

function towerForCard(card, level = 1) {
  const baseStats = stats.towerBaseStatsFromDefinition(card);
  const unit = tower({
    type: card.id, level, baseStats, finalStats: { ...baseStats },
    hp: card.maxHp, x: 450, y: 250, lane: 1, column: 1, hpFill: { width: 42 }
  });
  stats.calculateTowerFinalStats(unit);
  return unit;
}

test("all cards preserve baseline attack and upgrade modes, including softcap and level bonuses", () => {
  const baseline = {
    A: 400, a: 400, B: 400, C: 500, d: 400, x: 200, E: 400, e: 90, M: 400, W: 400,
    w: 400, F: 1400, l: 15000, r: 200, G: 15000, H: 700, I: 400, Q: 400, J: 600,
    K: 1800, k: 280, S: 5000, Z: 400, V: 1300, v: 350, P: 250, p: 250
  };
  const attackUpgrades = new Set(["d", "x", "Q", "k", "S", "V", "v", "l", "G"]);
  for (const card of cardDefinitions) {
    const base = baseline[card.id] ?? 0;
    assert.equal(card.attackPower, base, card.id);
    for (const level of [1, 2, 3, 20, 21, 22, 60]) {
      const unit = towerForCard(card, level);
      const expected = attackUpgrades.has(card.id) ? upgrades.scaledByEffectiveUpgrades(base, level) : base;
      assert.equal(unit.baseStats.attackPower, base);
      assert.equal(unit.finalStats.attackPower, expected, `${card.id} level ${level}`);
      assert.equal(stats.towerAttackAmount(unit, card), expected * (card.id === "r" ? 5 : 1));
      unit.levelBonus = 2;
      unit.mirrorLevelBonus = 3;
      stats.calculateTowerFinalStats(unit);
      assert.equal(unit.finalStats.attackPower, attackUpgrades.has(card.id)
        ? upgrades.scaledByEffectiveUpgrades(base, level + 5) : base);
    }
  }
  assert.equal(upgrades.volleyShotCount("A", 2), 2);
  assert.equal(upgrades.volleyShotCount("Q", 2), 1);
  assert.equal(towerForCard(cardDefinitions.find((card) => card.id === "B"), 2).finalStats.maxHp, 5400);
});

test("projectiles and mortars snapshot final attack times the multiplier, without double upgrades", () => {
  const { cardBehaviorsById } = load("src/game/cardBehaviors.ts");
  for (const id of ["A", "a", "C", "E", "M", "W", "I", "J", "Q", "x", "V", "v"]) {
    const card = { ...cardDefinitions.find((candidate) => candidate.id === id), attackMultiplier: 1.5 };
    const caster = towerForCard(card, 3);
    caster.finalStats.attackPower += 37;
    const expected = caster.finalStats.attackPower * 1.5;
    const target = enemy({ x: caster.x + 100, y: caster.y, lane: caster.lane });
    const state = {
      enemies: [target], boss: null, battleTime: 1000, occupied: new Map(), towers: [caster],
      scene: {}, projectiles: [], mortarProjectiles: []
    };
    cardBehaviorsById[id].execute(caster, card, state);
    const shots = [...state.projectiles, ...state.mortarProjectiles];
    assert.ok(shots.length > 0, id);
    caster.finalStats.attackPower = 999999;
    for (const shot of shots) assert.equal(shot.damage, expected, id);
  }
});

test("lasers, slashes and arc waves use final attack with no extra level scaling", () => {
  const { cardBehaviorsById } = load("src/game/cardBehaviors.ts");
  for (const id of ["d", "K", "Z", "k"]) {
    const card = { ...cardDefinitions.find((candidate) => candidate.id === id), attackMultiplier: 1.5 };
    const caster = towerForCard(card, 3);
    caster.finalStats.attackPower = 1234;
    const target = enemy({ x: caster.x + 40, y: caster.y, lane: caster.lane });
    const hits = [];
    cardBehaviorsById[id].execute(caster, card, {
      scene: {}, enemies: [target], boss: null, battleTime: 1000,
      damageEnemy: (_target, damage) => hits.push(damage), gainChars: noop
    });
    assert.deepEqual(hits, [1851], id);
  }
});

test("trigger attacks preserve burst upgrades while G and l scale attack only once", () => {
  for (const id of ["F", "l", "G", "r"]) {
    const card = cardDefinitions.find((candidate) => candidate.id === id);
    const caster = towerForCard(card, 2);
    const target = enemy({ x: caster.x, y: caster.y });
    const hits = [];
    const state = {
      ...runtime([target]), getDefinition: () => card,
      scene: { time: { delayedCall: (_delay, action) => action() } },
      runWhenBattleActive: (action) => action(),
      damageEnemy: (_target, damage) => { hits.push(damage); return true; }
    };
    if (id === "G") triggers.triggerTrapTower(state, caster, target);
    else triggers.triggerShockTower(state, caster);
    assert.equal(hits.length, id === "F" ? 18 : 1);
    const expected = { F: 1400, l: 27000, G: 27000, r: 1000 }[id];
    for (const damage of hits) assert.equal(damage, expected, id);
  }
});

test("healing uses final attack while healing upgrades still add volleys", () => {
  const { cardBehaviorsById } = load("src/game/cardBehaviors.ts");
  for (const id of ["H", "P", "p", "e"]) {
    const card = { ...cardDefinitions.find((candidate) => candidate.id === id), attackMultiplier: 1.5 };
    const caster = towerForCard(card, 2);
    caster.hp -= 500;
    caster.finalStats.attackPower = 100;
    const previousHp = caster.hp;
    cardBehaviorsById[id].execute(caster, card, {
      scene: {}, towers: [caster], occupied: new Map([[`${caster.lane}:${caster.column}`, caster]])
    });
    assert.equal(caster.hp, previousHp + 150, id);
    assert.equal(upgrades.volleyShotCount(id, 2), 2);
  }
});

function storageFixture() {
  const card = cardDefinitions.find((candidate) => candidate.id === "q");
  const caster = towerForCard(card);
  caster.id = "tower:q";
  const target = enemy({ x: caster.x, y: caster.y, lane: caster.lane });
  const state = {
    enemies: [target], towers: [caster], battleTime: 1000, scene: {},
    occupied: new Map([[`${caster.lane}:${caster.column}`, caster]]),
    damageTower: (unit, damage, type) => {
      assert.equal(type, "true");
      unit.hp -= damage;
      if (unit.hp <= 0) unit.inPlay = false;
    }
  };
  const { TowerStorageController } = load("src/game/towerStorage.ts");
  const storage = new TowerStorageController(() => state);
  state.storeBlockedEnemies = (unit, definition) => storage.storeBlockedEnemies(unit, definition);
  return { card, caster, target, state, storage };
}

test("q matches N panel, upgrade and self-damage but costs 200", () => {
  const { card, caster } = storageFixture();
  const n = cardDefinitions.find((candidate) => candidate.id === "N");
  for (const field of ["maxHp", "armor", "magicResistance", "attackPower", "attackSpeed", "cooldown", "selfDamage", "selfDamageType"]) {
    assert.equal(card[field], n[field], field);
  }
  assert.equal(card.cost, 200);
  caster.level = 2;
  stats.calculateTowerFinalStats(caster);
  assert.equal(caster.finalStats.maxHp, 5400);
});

test("q stores only its blocked enemies, hides them and releases exactly once after 5 battle seconds", () => {
  const { card, caster, target, state, storage } = storageFixture();
  const second = enemy({ x: caster.x + 10, y: caster.y, lane: caster.lane });
  const high = enemy({ x: caster.x, lane: caster.lane, highFlightUntil: 99999 });
  const far = enemy({ x: caster.x + 100, lane: caster.lane });
  state.enemies.push(second, high, far);
  const behavior = load("src/game/cardBehaviors.ts").cardBehaviorsById.q;
  assert.equal(behavior.canUse(caster, card, 1000, state, true), true);
  behavior.execute(caster, card, state);
  assert.equal(caster.hp, 2200);
  assert.equal(storage.count, 2);
  assert.deepEqual(state.enemies, [high, far]);
  assert.equal(target.inPlay, false);
  assert.equal(target.body.visible, false);
  assert.equal(second.inPlay, false);
  storage.storeBlockedEnemies(caster, card);
  assert.equal(storage.count, 2);
  state.battleTime = 5999;
  storage.update();
  storage.update();
  assert.equal(storage.count, 2);
  state.battleTime = 6000;
  storage.update();
  storage.update();
  assert.equal(storage.count, 0);
  assert.equal(state.enemies.length, 4);
  assert.equal(target.x, caster.x - load("src/config.ts").CELL_WIDTH);
  assert.equal(target.hp, 5000);
  assert.equal(target.inPlay, true);
  assert.equal(target.body.visible, true);
});

test("stored enemies follow q's shifted position and facing, and survive carrier removal", () => {
  const { card, caster, target, state, storage } = storageFixture();
  storage.storeBlockedEnemies(caster, card);
  caster.x += 156;
  caster.y += 78;
  caster.lane += 1;
  caster.facingDirection = -1;
  caster.inPlay = false;
  caster.body = { destroyed: true };
  state.towers.length = 0;
  state.battleTime = 6000;
  storage.update();
  assert.equal(target.x, caster.x + load("src/config.ts").CELL_WIDTH);
  assert.equal(target.y, caster.y);
  assert.equal(target.lane, caster.lane);
  assert.equal(target.movementDirection, -1);
  assert.equal(storage.count, 0);
});

test("q's lethal storage cost does not lose cargo or release it early", () => {
  const { card, caster, target, state, storage } = storageFixture();
  caster.hp = 400;
  storage.storeBlockedEnemies(caster, card);
  assert.equal(caster.inPlay, false);
  assert.equal(target.inPlay, false);
  assert.equal(storage.count, 1);
  state.battleTime = 6000;
  storage.update();
  assert.deepEqual(state.enemies, [target]);
});

test("stored enemies keep the final wave open and phase cleanup also destroys nested cargo", () => {
  const { card, caster, target, state, storage } = storageFixture();
  const child = enemy();
  target.burrowCargo = [child];
  storage.storeBlockedEnemies(caster, card);
  const { waveScheduleAction } = load("src/game/waves.ts");
  assert.equal(waveScheduleAction({ enemyKinds: ["circle"], totalWaves: 1 }, 1, null, state.enemies.length + storage.count, 99999), "wait");
  storage.clear();
  storage.clear();
  assert.equal(storage.count, 0);
  assert.equal(target.body.destroyed, true);
  assert.equal(child.body.destroyed, true);
  state.battleTime = 99999;
  storage.update();
  assert.equal(state.enemies.length, 0);
});
