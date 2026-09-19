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
  makeEnemyHitShards: noop, makeShellBurst: noop, makeReflectFlash: noop, makeSpellMortarImpact: noop,
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
  "src/game/slowAura.ts": { isPointInSlowAura: () => true, slowAuraSources: () => [], movementSpeedMultiplier: () => 1 },
  "src/game/enemySupport.ts": { enemySupportSources: () => ({}) },
  "src/game/projectiles.ts": {
    createTowerProjectile: (_scene, spec) => ({ ...spec }),
    createHomingTowerProjectile: (_scene, spec) => ({ ...spec }),
    createMortarProjectile: (_scene, spec) => ({ ...spec }),
    isEnemyProjectileOutOfBounds: () => false,
    isTowerProjectileOutOfBounds: () => false,
    createReflectedProjectile: (_scene, projectile) => ({ damage: projectile.damage, hitCount: projectile.hitCount })
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

const slowAuraPath = path.resolve(root, "src/game/slowAura.ts");
const slowAuraStub = stubs.get(slowAuraPath);
stubs.delete(slowAuraPath);
const { isCellInSlowAura } = load("src/game/slowAura.ts");
stubs.set(slowAuraPath, { ...slowAuraStub, isCellInSlowAura });

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
        if (property === "setAlpha") target.alpha = args[0];
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

function unyieldingFixture() {
  const f = extractionFixture();
  const runtime = { ...f.state, projectiles: [], enemyProjectiles: [], mortarProjectiles: [], onTowerDamaged: noop };
  return { ...f, runtime, refresh: () => lifecycle.settleTowerHealth(runtime) };
}

test("o costs 175, otherwise matches B except for zero attack and no retaliation, and upgrades HP like B", () => {
  const f = extractionFixture();
  const card = f.state.getDefinition("o");
  const b = f.state.getDefinition("B");
  for (const key of ["category", "cooldown", "maxHp", "armor", "magicResistance"]) {
    assert.equal(card[key], b[key]);
  }
  assert.equal(card.attackPower, 0);
  assert.equal(card.cost, 175);
  assert.equal(card.reflectAttackMultiplier, undefined);
  assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement("o"), "2-8");
  const o = f.place("o");
  towers.applyTowerUpgradeStats(o, card, towers.upgradeTowerLevel(o), 0);
  assert.equal(o.finalStats.maxHp, 5400);
  assert.equal(o.hp, 5400);
  assert.equal(o.finalStats.attackPower, 0);
});

test("Orientation starts empty, charges at 1 SP/s, spends 10, pauses for 6s, resets on upgrade and syncs its range", () => {
  const f = extractionFixture();
  const o = f.place("o");
  const { TowerSkillController } = load("src/game/towerSkills.ts");
  const runtime = { ...f.state, battleTime: 0 };
  const controller = new TowerSkillController(f.state.scene, () => runtime);
  const step = (seconds) => { runtime.battleTime += seconds * 1000; controller.update(seconds, runtime.battleTime); };
  controller.update(0, 0);
  assert.equal(o.skills.orientation.sp, 0);
  assert.equal(controller.isOrientationReady(o), false);
  assert.equal(o.rangeBorder.alpha, 0.22);
  step(9.5);
  assert.equal(o.skills.orientation.sp, 9);
  step(0.5);
  assert.equal(controller.isOrientationReady(o), true);
  controller.activateOrientationTower(o);
  assert.equal(o.skills.orientation.sp, 0);
  assert.equal(o.skills.orientation.activeUntil, 16000);
  assert.equal(o.rangeBorder.alpha, 0.9);
  step(5.5);
  assert.equal(o.skills.orientation.sp, 0);
  step(1);
  assert.equal(o.skills.orientation.sp, 0);
  assert.equal(o.skills.orientation.spBuffer, 0.5);
  assert.equal(o.rangeBorder.alpha, 0.22);
  step(9.5);
  assert.equal(controller.isOrientationReady(o), true);
  controller.activateOrientationTower(o);
  controller.resetTowerSkill(o);
  assert.equal(o.skills.orientation.sp, 0);
  assert.equal(o.skills.orientation.activeUntil, 0);
  assert.equal(o.rangeBorder.alpha, 0.22);
});

test("Orientation protects exactly the centered 21 cells, expires, follows movement and ignores removed or transient sources", () => {
  const f = extractionFixture();
  const o = f.place("o", 1, 3, 6);
  o.skills.orientation = { sp: 0, spBuffer: 0, activeUntil: 6000 };
  const { redirectOrientedTarget } = load("src/game/orientation.ts");
  let protectedCells = 0;
  for (let dl = -3; dl <= 3; dl++) for (let dc = -3; dc <= 3; dc++) {
    const target = { inPlay: true, lane: 3 + dl, column: 6 + dc };
    const expected = Math.abs(dl) <= 2 && Math.abs(dc) <= 2 && !(Math.abs(dl) === 2 && Math.abs(dc) === 2);
    assert.equal(redirectOrientedTarget([o], target, 1000), expected ? o : target);
    if (expected) protectedCells++;
  }
  assert.equal(protectedCells, 21);
  const target = f.place("B", 1, 3, 7);
  assert.equal(redirectOrientedTarget([o], target, 6000), target);
  o.column = 0;
  assert.equal(redirectOrientedTarget([o], target, 1000), target);
  o.column = 6;
  o.transient = true;
  assert.equal(redirectOrientedTarget([o], target, 1000), target);
  o.transient = false;
  o.inPlay = false;
  assert.equal(redirectOrientedTarget([o], target, 1000), target);
});

test("overlapping Orientation uses the newest activation and never chains between active o towers", () => {
  const f = extractionFixture();
  const first = f.place("o", 1, 3, 5), second = f.place("o", 1, 3, 6);
  const target = f.place("B", 1, 3, 7);
  first.skills.orientation = { sp: 0, spBuffer: 0, activeUntil: 8000 };
  second.skills.orientation = { sp: 0, spBuffer: 0, activeUntil: 7000 };
  const { redirectOrientedTarget } = load("src/game/orientation.ts");
  assert.equal(redirectOrientedTarget(f.state.towers, target, 2000), first);
  second.skills.orientation.activeUntil = 9000;
  assert.equal(redirectOrientedTarget(f.state.towers, target, 2000), second);
  assert.equal(redirectOrientedTarget(f.state.towers, first, 2000), first);
  assert.equal(redirectOrientedTarget(f.state.towers, second, 2000), second);
});

test("active Orientation redirects enemy locked mortars already in flight, not friendly mortars or untargeted shots", () => {
  const f = extractionFixture();
  const o = f.place("o", 1, 3, 5), target = f.place("B", 1, 3, 6);
  o.skills.orientation = { sp: 0, spBuffer: 0, activeUntil: 6000 };
  const { updateMortarProjectiles } = load("src/game/projectileRuntime.ts");
  for (const [owner, locked] of [["enemy", true], ["tower", true], ["enemy", false]]) {
    const shot = { owner, targetTower: locked ? target : undefined, fromX: 1000, fromY: 0,
      targetX: target.x, targetY: target.y, progress: 0, duration: 1000, body: visual() };
    const state = { ...f.state, battleTime: 1000, mortarProjectiles: [shot] };
    updateMortarProjectiles(state, 0);
    const redirected = owner === "enemy" && locked;
    assert.equal(shot.targetTower, redirected ? o : locked ? target : undefined);
    assert.equal(shot.targetX, redirected ? o.x : target.x);
    assert.equal(shot.targetY, redirected ? o.y : target.y);
  }
});

test("g costs 425, unlocks after 3-8 and shares e's healing panel and volley upgrades, but not Zeal", () => {
  const f = unyieldingFixture();
  const g = f.place("g", 3, 3, 5);
  const a = f.place("A", 1, 3, 6);
  const card = f.state.getDefinition("g");
  const e = f.state.getDefinition("e");
  assert.equal(card.cost, 425);
  assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement("g"), "3-8");
  for (const key of ["category", "cooldown", "maxHp", "armor", "magicResistance", "attackSpeed", "attackPower"]) {
    assert.equal(card[key], e[key]);
  }
  for (const level of [1, 2, 6, 22, 60]) {
    assert.equal(upgrades.volleyShotCount("g", level), upgrades.volleyShotCount("e", level));
  }
  f.refresh();
  stats.calculateTowerFinalStats(a, f.state.towers);
  assert.equal(a.finalStats.attackSpeed, a.baseStats.attackSpeed);
  assert.equal(g.unyieldingRatio, 0.45);
  assert.equal(a.unyieldingRatio, 0.45);
});

test("Unyielding covers the centered 3x3 including itself, ignores transient towers, and takes the strongest effective level", () => {
  const f = unyieldingFixture();
  const g = f.place("g", 1, 3, 5);
  const targets = [g];
  for (let dl = -1; dl <= 1; dl++) for (let dc = -1; dc <= 1; dc++) {
    if (dl || dc) targets.push(f.place("A", 1, 3 + dl, 5 + dc));
  }
  const outside = f.place("A", 1, 1, 5);
  const transient = f.place("b", 1, 2, 5);
  transient.transient = true;
  f.refresh();
  assert.ok(targets.every(t => t.unyieldingRatio === 0.15));
  assert.equal(outside.unyieldingRatio, 0);
  assert.equal(transient.unyieldingRatio, 0);
  const stronger = f.place("g", 2, 3, 7);
  stronger.levelBonus = 1;
  stronger.mirrorLevelBonus = 2;
  f.refresh();
  assert.equal(targets.find(t => t.column === 6 && t.lane === 3).unyieldingRatio, 0.75);
  assert.equal(targets.find(t => t.column === 4 && t.lane === 3).unyieldingRatio, 0.15);
  g.column = 12;
  f.refresh();
  assert.equal(targets.find(t => t.column === 4 && t.lane === 3).unyieldingRatio, 0);
});

test("negative HP survives zero, takes normal mitigated damage, heals continuously, and dies at its exact lower limit", () => {
  const f = unyieldingFixture();
  f.place("g", 1, 3, 5);
  const b = f.place("B", 1, 3, 6);
  f.refresh();
  lifecycle.damageTower(f.runtime, b, 3500, "physical");
  assert.equal(b.hp, 0);
  assert.equal(b.inPlay, true);
  lifecycle.damageTower(f.runtime, b, 200, "true");
  assert.equal(b.hp, -200);
  assert.equal(b.inPlay, true);
  assert.equal(health.changeTowerHealth(b, 90), 90);
  assert.equal(b.hp, -110);
  assert.equal(health.changeTowerHealth(b, 200), 200);
  assert.equal(b.hp, 90);
  lifecycle.damageTower(f.runtime, b, 540, "magic");
  assert.equal(b.hp, -450);
  assert.equal(b.inPlay, false);
  const normal = f.place("A", 1, 0, 0);
  lifecycle.damageTower(f.runtime, normal, 1200, "true");
  assert.equal(normal.inPlay, false);
});

test("g heals every damaged tower in its centered 3x3 including itself and negative HP, excludes distant cells, and honors multi-hit healing", () => {
  const f = unyieldingFixture();
  const g = f.place("g", 6, 3, 5);
  const a = f.place("A", 1, 3, 6);
  const diagonal = f.place("B", 1, 2, 4);
  const outside = f.place("A", 1, 1, 5);
  f.refresh();
  g.hp = 500;
  a.hp = -100;
  diagonal.hp = 200;
  outside.hp = 100;
  const behavior = load("src/game/cardBehaviors.ts").cardBehaviorsById.g;
  assert.equal(behavior.canUse(g, f.state.getDefinition("g"), 0, f.runtime, true), true);
  behavior.execute(g, f.state.getDefinition("g"), f.runtime, 2);
  assert.equal(a.hp, 80);
  assert.equal(diagonal.hp, 380);
  assert.equal(g.hp, 680);
  assert.equal(outside.hp, 100);
});

test("g can heal itself as its only damaged target and survives on its own negative HP allowance", () => {
  const f = unyieldingFixture();
  const g = f.place("g", 1, 0, 0);
  f.refresh();
  assert.equal(health.towerMinimumHealth(g), -180);
  lifecycle.damageTower(f.runtime, g, 1250, "true");
  assert.equal(g.hp, -50);
  assert.equal(g.inPlay, true);
  const behavior = load("src/game/cardBehaviors.ts").cardBehaviorsById.g;
  assert.equal(behavior.canUse(g, f.state.getDefinition("g"), 0, f.runtime, true), true);
  behavior.execute(g, f.state.getDefinition("g"), f.runtime, 1);
  assert.equal(g.hp, 40);
  lifecycle.damageTower(f.runtime, g, 220, "true");
  assert.equal(g.inPlay, false);
});

test("losing an aura resolves negative-HP death cascades, while a sufficient weaker aura preserves life", () => {
  const f = unyieldingFixture();
  const strong = f.place("g", 3, 3, 4);
  const weak = f.place("g", 1, 3, 6);
  const b = f.place("B", 1, 3, 5);
  f.refresh();
  lifecycle.damageTower(f.runtime, b, 3250, "true");
  lifecycle.removeTower(f.runtime, strong);
  assert.equal(b.hp, -250);
  assert.equal(b.unyieldingRatio, 0.15);
  assert.equal(b.inPlay, true);
  weak.column = 10;
  f.refresh();
  assert.equal(b.inPlay, false);

  const left = f.place("g", 3, 1, 1);
  const middle = f.place("g", 1, 1, 2);
  const end = f.place("A", 1, 1, 3);
  f.refresh();
  lifecycle.damageTower(f.runtime, middle, 1450, "true");
  lifecycle.damageTower(f.runtime, end, 1250, "true");
  lifecycle.removeTower(f.runtime, left);
  assert.equal(middle.inPlay, false);
  assert.equal(end.inPlay, false);
});

test("health bars share a fixed 42-pixel width between normal HP and the pale red negative reserve at any level", () => {
  const f = unyieldingFixture();
  const g = f.place("g", 1, 3, 5);
  const b = f.place("B", 1, 3, 6);
  for (const level of [1, 10, 50]) {
    g.level = level;
    f.refresh();
    assert.ok(Math.abs(b.hpFill.width + b.negativeHpFill.width - 42) < 1e-10);
    assert.ok(Math.abs(b.negativeHpFill.width / b.hpFill.width - level * 0.15) < 1e-10);
    assert.ok(b.hpFill.x >= -21 && b.hpFill.x <= 21);
  }
  b.hp = -11250;
  health.syncHealthBar(b);
  assert.equal(b.hpFill.width, 0);
  assert.ok(Math.abs(b.negativeHpFill.width / b.negativeHpBack.width - 0.5) < 1e-10);
  b.hp = 3000;
  g.column = 12;
  f.refresh();
  assert.equal(b.hpFill.width, 42);
  assert.equal(b.hpFill.x, -21);
  assert.equal(b.negativeHpFill.visible, false);
});

test("u networks share summed negative allowance divided by u count and preserve negative ratios through topology changes", () => {
  const f = unyieldingFixture();
  f.place("g", 1, 2, 3);
  const left = f.place("u", 1, 3, 2);
  const bridge = f.place("A", 1, 3, 3);
  const right = f.place("u", 1, 3, 4);
  health.syncTowerHealthNetworks(f.state.towers);
  f.refresh();
  assert.equal(left.healthPool.maxHp, 3600);
  assert.equal(health.towerMinimumHealth(left), -540);
  lifecycle.damageTower(f.runtime, bridge, 3780, "true");
  assert.equal(left.healthPool.hp, -180);
  assert.ok([left, bridge, right].every(t => t.inPlay && t.hp < 0 && t.hpFill.width === 0));
  assert.equal(left.negativeHpFill.width, right.negativeHpFill.width);
  for (let i = 0; i < 3; i++) health.syncTowerHealthNetworks(f.state.towers);
  assert.equal(left.healthPool.hp, -180);
  right.column = 9;
  health.syncTowerHealthNetworks(f.state.towers);
  f.refresh();
  assert.equal(right.inPlay, false);
  assert.equal(left.healthPool.hp, -210);
  assert.equal(left.inPlay, true);
  assert.equal(health.changeTowerHealth(bridge, 300), 300);
  assert.equal(left.healthPool.hp, 90);
});

test("Unyielding uses base HP, never upgraded or aura-boosted max HP, including u pools", () => {
  const f = unyieldingFixture();
  const g = f.place("g", 1, 2, 3);
  const b = f.place("B", 1, 3, 3);
  f.refresh();
  assert.equal(health.towerMinimumHealth(b), -450);
  towers.applyTowerUpgradeStats(b, f.state.getDefinition("B"), towers.upgradeTowerLevel(b, 2), 0);
  b.levelBonus = 4;
  b.mirrorLevelBonus = 3;
  towers.syncTowerDerivedStats(b, false, f.state.towers);
  f.refresh();
  assert.ok(b.finalStats.maxHp > 3000);
  assert.equal(health.towerMinimumHealth(b), -450);
  assert.ok(Math.abs(b.negativeHpBack.width - 42 * 450 / (b.finalStats.maxHp + 450)) < 1e-10);
  const u = f.place("u", 6, 3, 2);
  health.syncTowerHealthNetworks(f.state.towers);
  f.refresh();
  assert.equal(health.towerMinimumHealth(u), -900); // Base HP of u + B, regardless of their upgraded max HP.
  g.level = 2;
  f.refresh();
  assert.equal(health.towerMinimumHealth(u), -1800);
});

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
    skills: {}, statusEffects: [], statusMultiplierCache: { visualSyncedAt: NaN },
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
    A: 400, a: 400, B: 400, C: 500, d: 400, z: 400, x: 200, E: 400, e: 90, g: 90, M: 400, W: 400,
    w: 400, F: 1400, l: 15000, r: 200, G: 15000, H: 700, I: 400, Q: 400, J: 600,
    K: 1800, k: 280, S: 5000, Z: 400, V: 1300, v: 350, P: 250, p: 250
  };
  const attackUpgrades = new Set(["d", "z", "x", "Q", "k", "S", "V", "v", "l", "G"]);
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

test("volleys cap at five timings and distribute every judgment without changing the time window", () => {
  const { volleyTimingCount, volleyHitsAt } = load("src/game/volley.ts");
  for (const [total, expected] of [[1,[1]],[5,[1,1,1,1,1]],[6,[2,1,1,1,1]],[7,[2,2,1,1,1]],[10,[2,2,2,2,2]],[11,[3,2,2,2,2]],[14,[3,3,3,3,2]],[15,[3,3,3,3,3]]]) {
    const shots = volleyTimingCount(total);
    assert.deepEqual(Array.from({ length: shots }, (_, index) => volleyHitsAt(total, index)), expected);
    assert.equal((shots - 1) * upgrades.volleyInterval(2000, shots), total === 1 ? 0 : 400);
  }
  for (let level = 1; level <= 300; level++) {
    const hits = upgrades.volleyShotCount("A", level);
    const count = volleyTimingCount(hits);
    assert.ok(count <= 5);
    assert.equal(Array.from({length:count},(_,i)=>volleyHitsAt(hits,i)).reduce((a,b)=>a+b,0), hits);
  }
});

test("multi-hit volleys create one projectile pattern, with unchanged damage and snapshotted hit count", () => {
  const { cardBehaviorsById } = load("src/game/cardBehaviors.ts");
  for (const id of ["A", "a", "C", "E", "M", "W", "I", "J"]) {
    const card = cardDefinitions.find(card => card.id === id);
    const caster = towerForCard(card, 6);
    const state = { scene: {}, projectiles: [], battleTime: 1000 };
    cardBehaviorsById[id].execute(caster, card, state, 2);
    assert.equal(state.projectiles.length, ["E", "M", "W"].includes(id) ? 3 : 1);
    for (const shot of state.projectiles) {
      assert.equal(shot.hitCount, 2);
      assert.equal(shot.damage, card.attackPower);
    }
  }
});

test("multi-hit tower impacts preserve the physical armor breakpoint and resolve magic separately", () => {
  const { updateTowerProjectiles } = load("src/game/projectileRuntime.ts");
  for (const [type, damageType, armor, expected] of [["bolt","physical",300,200],["bolt","physical",500,80],["star","magic",300,640],["shell","physical",300,200]]) {
    const target = enemy({ lane: 0, baseStats: { maxHp: 5000, armor, magicResistance: 20, finalDamageReduction: 0 } });
    const state = runtime([target]);
    const body = visual();
    Object.assign(state, { towers: [], projectiles: [{ type, lane: 0, x: 0, y: 0, vx: 0, vy: 0, damage: 400, damageType, hitCount: 2, maxX: 1000, limitDirection: 1, splashRadius: 100, body }] });
    updateTowerProjectiles(state, 0);
    assert.equal(5000 - target.hp, expected, `${type} / ${armor} armor`);
    assert.equal(state.projectiles.length, 0);
    assert.equal(body.destroyed, true);
  }
});

test("x impacts reduce non-Flying damage by 35%, retain air damage and multi-hits, and leave other towers unchanged", () => {
  const { updateTowerProjectiles } = load("src/game/projectileRuntime.ts");
  for (const [sourceType, flying, damageType, expected] of [
    ["x", false, "magic", 208], ["x", true, "magic", 320],
    ["x", false, "true", 260], ["x", true, "true", 400],
    ["I", false, "magic", 320]
  ]) {
    const target = enemy({ lane: 0 });
    const source = tower({ type: sourceType, inPlay: false });
    const shot = { type: "chevron", lane: 0, x: 0, y: 0, vx: 0, vy: 0, damage: 200,
      damageType, hitCount: 2, maxX: 1000, limitDirection: 1, body: visual(), targetEnemy: target, sourceTower: source };
    // Flight changes after firing must be evaluated on impact; the source may already be gone.
    if (flying) target.statusEffects.push({ name: "flying", expiresAt: 99999 });
    const state = Object.assign(runtime([target]), { towers: [], projectiles: [shot] });
    updateTowerProjectiles(state, 0);
    assert.equal(5000 - target.hp, expected, `${sourceType} / ${flying} / ${damageType}`);
    assert.equal(state.projectiles.length, 0);
  }
});

test("x retargeting to ground enemies or Bosses applies the ground penalty; high flight remains untargetable", () => {
  const { updateTowerProjectiles } = load("src/game/projectileRuntime.ts");
  for (const bossTarget of [false, true]) {
    const dead = enemy({ inPlay: false, statusEffects: [{ name: "flying", expiresAt: 99999 }] });
    const high = enemy({ statusEffects: [{ name: "highFlying", expiresAt: 99999 }] });
    const boss = bossTarget ? { hp: 5000, x: 0, y: 0, statusEffects: [], hitboxWidth: 100, hitboxHeight: 100 } : null;
    const target = boss ?? enemy({ lane: 0 });
    const received = [];
    const shot = { type: "chevron", lane: 0, x: 0, y: 0, vx: 0, vy: 0, damage: 360,
      damageType: "magic", hitCount: 1, maxX: 1000, limitDirection: 1, body: visual(),
      targetEnemy: dead, sourceTower: tower({ type: "x" }) };
    const state = Object.assign(runtime(bossTarget ? [high] : [high, target], boss), {
      towers: [], projectiles: [shot],
      damageEnemy: (unit, damage) => received.push([unit, damage]),
      damageBoss: (damage, _type, unit) => received.push([unit, damage])
    });
    updateTowerProjectiles(state, 0);
    assert.deepEqual(received, [[target, 234]]);
    assert.equal(high.hp, 5000);
    assert.equal(state.projectiles.length, 0);
  }
});

test("enemy projectiles and mortar impacts apply armor per judgment and reflections retain hit count", () => {
  const { updateEnemyProjectiles, updateMortarProjectiles } = load("src/game/projectileRuntime.ts");
  for (const mortar of [false, true]) {
    const f = extractionFixture();
    const target = f.place("R");
    target.finalStats.armor = 300;
    const before = target.hp;
    const shot = { owner: "enemy", x: target.x, y: target.y, fromX: target.x, fromY: target.y, vx: 0, sourceLane: target.lane, targetX: target.x, targetY: target.y, progress: 1, duration: 1000, rangeX: 80, rangeY: 80, damage: 400, damageType: "physical", hitCount: 2, body: visual(), sourceEnemy: enemy() };
    const state = { ...f.state, getBoss: () => null, projectiles: [], enemyProjectiles: mortar ? [] : [shot], mortarProjectiles: mortar ? [shot] : [], onTowerDamaged: noop };
    state.damageTower = (tower, amount, type) => lifecycle.damageTower(state, tower, amount, type);
    if (mortar) updateMortarProjectiles(state, 0);
    else updateEnemyProjectiles(state, 0);
    assert.equal(before - target.hp, 200);
    const reflected = mortar ? state.mortarProjectiles[0] : state.projectiles[0];
    assert.equal(reflected.hitCount, 2);
    assert.equal(reflected.damage, 400);
  }
});

test("healing and slashes keep separate simultaneous judgments", () => {
  const { cardBehaviorsById } = load("src/game/cardBehaviors.ts");
  const f = extractionFixture();
  const healer = f.place("e");
  healer.hp = 100;
  cardBehaviorsById.e.execute(healer, f.state.getDefinition("e"), f.state, 2);
  assert.equal(healer.hp, 280);
  const slash = f.place("K", 6, 1, 2);
  const target = enemy({ x: slash.x + 30, y: slash.y, lane: slash.lane });
  const hits = [];
  cardBehaviorsById.K.execute(slash, f.state.getDefinition("K"), { ...f.state, enemies: [target], boss: null, damageEnemy: (_target, amount) => hits.push(amount), gainChars: noop }, 2);
  assert.deepEqual(hits, [1800, 1800]);
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

test("z inherits d's panel and damage upgrades, replaces Sunder with 1 SP drain, and unlocks after 3-8", () => {
  const z = cardDefinitions.find(card => card.id === "z");
  const d = cardDefinitions.find(card => card.id === "d");
  for (const key of ["category", "cost", "cooldown", "maxHp", "armor", "magicResistance", "attackSpeed", "attackPower", "damageType"]) {
    assert.equal(z[key], d[key], key);
  }
  assert.equal(z.skillDrainOnHit, 1);
  assert.equal(z.projectileDebuff, undefined);
  assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement("z"), "3-8");
  for (const level of [1, 2, 20, 21, 50]) {
    assert.equal(towerForCard(z, level).finalStats.attackPower, towerForCard(d, level).finalStats.attackPower);
  }
});

test("z pierces and drains each hit enemy, stops at MR, and preserves active skills and partial SP recovery", () => {
  const card = cardDefinitions.find(card => card.id === "z");
  const caster = towerForCard(card);
  const target = (x, mr = 0) => enemy({ x, y: caster.y, lane: caster.lane,
    baseStats: { maxHp: 5000, armor: 150, magicResistance: mr, finalDamageReduction: 0 },
    skills: { wings: { sp: 3, spBuffer: 0.75, activeUntil: 9000, regenMultiplier: 1.2 }, heal: { sp: 0.5, spBuffer: 0.2, activeUntil: 0 } }
  });
  const first = target(500), stop = target(600, 20), behind = target(700), otherLane = target(520), rear = target(400);
  otherLane.lane++;
  const state = runtime([behind, first, otherLane, stop, rear]);
  load("src/game/cardBehaviors.ts").cardBehaviorsById.z.execute(caster, card, state);
  assert.equal(first.hp, 4600);
  assert.equal(stop.hp, 4680);
  for (const hit of [first, stop]) {
    assert.deepEqual(hit.skills.wings, { sp: 2, spBuffer: 0.75, activeUntil: 9000, regenMultiplier: 1.2 });
    assert.deepEqual(hit.skills.heal, { sp: 0, spBuffer: 0.2, activeUntil: 0 });
    assert.equal(hit.statusEffects.some(effect => effect.name === "sunder"), false);
  }
  for (const miss of [behind, otherLane, rear]) {
    assert.equal(miss.hp, 5000);
    assert.equal(miss.skills.wings.sp, 3);
  }
});

test("z respects invincibility, high flight, burrowing and reversed facing; repeated hits cannot make SP negative", () => {
  const card = cardDefinitions.find(card => card.id === "z"), caster = towerForCard(card);
  caster.facingDirection = -1;
  const mk = overrides => enemy({ x: 400, y: caster.y, lane: caster.lane,
    baseStats: { maxHp: 5000, armor: 0, magicResistance: 0, finalDamageReduction: 0 },
    skills: { wings: { sp: 1, spBuffer: 0.4, activeUntil: 0 } }, ...overrides });
  const ordinary = mk({}), invincible = mk({ statusEffects: [{ name: "invincible", expiresAt: 99999 }] });
  const high = mk({ statusEffects: [{ name: "highFlying", expiresAt: 99999 }] }), burrowed = mk({ burrowed: true });
  const forward = mk({ x: 500 });
  const state = runtime([ordinary, invincible, high, burrowed, forward]);
  const behavior = load("src/game/cardBehaviors.ts").cardBehaviorsById.z;
  for (let i = 0; i < 2; i++) behavior.execute(caster, card, state);
  assert.equal(ordinary.hp, 4200);
  assert.equal(ordinary.skills.wings.sp, 0);
  assert.equal(ordinary.skills.wings.spBuffer, 0.4);
  for (const miss of [invincible, high, burrowed, forward]) {
    assert.equal(miss.hp, 5000);
    assert.equal(miss.skills.wings.sp, 1);
  }
});

test("z drains every skill on the hit Boss part only, and invincible Boss parts lose no SP", () => {
  const card = cardDefinitions.find(card => card.id === "z"), caster = towerForCard(card);
  for (const invincibleUntil of [0, 99999]) {
    const skills = () => ({ promotion: { sp: 5, spBuffer: 0.7, activeUntil: 0 }, advance: { sp: 1, spBuffer: 0.3, activeUntil: 0 } });
    const boss = { kind: "cube", x: 700, y: 800, hp: 10000, maxHp: 10000, hitboxWidth: 100, hitboxHeight: 100,
      skills: skills(), invincibleUntil: 0, baseStats: { armor: 300, magicResistance: 20, finalDamageReduction: 0 } };
    const copy = { ...boss, y: caster.y, invincibleUntil, skills: skills() };
    boss.octahedronCopies = [copy];
    load("src/game/cardBehaviors.ts").cardBehaviorsById.z.execute(caster, card, runtime([], boss));
    assert.equal(boss.hp, invincibleUntil ? 10000 : 9680);
    assert.equal(copy.skills.promotion.sp, invincibleUntil ? 5 : 4);
    assert.equal(copy.skills.advance.sp, invincibleUntil ? 1 : 0);
    assert.equal(boss.skills.promotion.sp, 5);
    assert.equal(boss.skills.advance.sp, 1);
  }
});

test("lasers, slashes and arc waves use final attack with no extra level scaling", () => {
  const { cardBehaviorsById } = load("src/game/cardBehaviors.ts");
  for (const id of ["d", "z", "K", "Z", "k"]) {
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
