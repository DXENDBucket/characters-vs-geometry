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
  "src/registry/enemies.ts": {
    enemyFamily: (kind) => kind.replace(/[23]$/, ""), enemyIsBossCompanion: () => false,
    getEnemyRegistration: kind => load("src/data/enemyArchetypes.ts").enemyArchetypes[kind.replace(/[23]$/, "")]
  },
  "src/game/enemyBehaviors.ts": { syncEnemyVisualScale: noop },
  "src/game/enemyCombatRules.ts": {
    enemyIsBurrowed: (enemy) => !!enemy.burrowed,
    enemyIsHighFlying: (enemy) => enemy.highFlightUntil !== undefined || enemy.statusEffects.some((effect) => effect.name === "highFlying"),
    siegeRamSpeed: () => 10
  },
  "src/render/enemyFacing.ts": {
    syncEnemyFacingVisual: (enemy) => { enemy.visualDirection = rules.enemyFacingDirection(enemy); }
  },
  "src/game/enemyRuntime.ts": { releaseBurrowCargo: noop, spawnSplitEnemies: noop },
  "src/game/combatStats.ts": {
    enemyDefenseStats: (enemy) => enemy.baseStats, bossFinalStats: (boss) => boss.baseStats,
    enemyMovementSpeed: () => 10,
    enemyAttackDamage: enemy => enemy.baseStats.damage ?? 0
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
const { syncEnemyStatusVisuals } = load("src/render/enemyStatus.ts");
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

test("ASCII box pusher costs 475, unlocks after AE-1, and gains 0.5 SP/s per extra level", () => {
  const { getCardDefinition, cardLetterCase } = load("src/registry/cards.ts");
  const { updatePushSkill, resetPushSkill, pushIsReady } = load("src/game/pushSkill.ts");
  const definition = getCardDefinition("#");
  assert.equal(definition.cost, 475);
  assert.equal(definition.cooldown, 30000);
  assert.equal(definition.attackPower, 0);
  assert.equal(cardLetterCase("#"), "ascii");
  assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement("#"), "AE-1");
  const tower = { type: "#", inPlay: true, level: 1, levelBonus: 0, mirrorLevelBonus: 0, skills: {}, border: uiVisual() };
  assert.equal(pushIsReady(tower), false);
  const state = tower.skills.push;
  updatePushSkill(tower, state, 10, 10000);
  assert.equal(state.sp, 10);
  tower.level = 2;
  updatePushSkill(tower, state, 1, 11000);
  assert.equal(state.sp, 11);
  assert.equal(state.spBuffer, 0.5);
  updatePushSkill(tower, state, 1, 12000);
  assert.equal(state.sp, 13);
  tower.level = 3;
  updatePushSkill(tower, state, 100, 112000);
  assert.equal(state.sp, 30);
  assert.equal(pushIsReady(tower), true);
  resetPushSkill(tower, state);
  assert.equal(state.sp, 0);
  assert.equal(state.spBuffer, 0);
});

function extractionFixture() {
  const { TowerExtractionPool } = load("src/game/towerExtraction.ts");
  const { TowerDeploymentController } = load("src/game/towerDeployment.ts");
  const { TargetedEffectCardController } = load("src/game/targetedEffectCards.ts");
  let order = 0;
  const pending = new (load("src/game/battleActions.ts").BattleActionQueue)();
  const removed = [];
  const state = {
    scene: { add: new Proxy({}, { get: () => () => uiVisual() }), tweens: { add: noop } },
    towers: [], occupied: new Map(), chars: 10_000, battleTime: 0, unlimitedFirepower: false,
    autoUpgradeEnabled: true, autoUpgradeReserveChars: 0, autoUpgradeReserveInputFocused: false,
    extraction: new TowerExtractionPool(), cardStates: cardDefinitions.map(definition => ({ definition, readyAt: 0 })),
    getDefinition: id => cardDefinitions.find(card => card.id === id), cardTimeFor: () => state.battleTime,
    getChars: () => state.chars, spendChars: amount => { state.chars -= amount; }, nextTowerOrder: () => order++,
    resetTowerSkill: noop, updateLevelAuras: noop, updateCards: noop,
    scheduleBattleAction: (delay, action) => pending.schedule(state.battleTime, delay, action),
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
  return { state, deployment, targeted, place, removed,
    flush: () => pending.update(state.battleTime, action => targeted.resolvePendingEffectCard(action.tower)) };
}

test("Unlimited Firepower applies targeted attachments down a column for one payment and cooldown", () => {
  for (const id of ["b", "t", "!", "?b"]) {
    const f = extractionFixture();
    f.state.unlimitedFirepower = true;
    const units = [0, 2, 6].map(lane => f.place("A", 1, lane, 3));
    const adjacent = f.place("A", 1, 2, 4);
    const inactive = f.place("A", 1, 1, 3); inactive.inPlay = false; inactive.nullified = true;
    const shell = f.place("()", 1, 2, 3);
    const card = id === "?b" ? { ...f.state.getDefinition("b"), id, cooldown: 60000 } : f.state.getDefinition(id);
    if (id === "?b") { f.state.cardStates.push({ definition: card, readyAt: 0 });
      const original = f.state.getDefinition; f.state.getDefinition = key => key === id ? card : original(key); }
    assert.deepEqual(f.targeted.deploymentTargets(4, 3).map(tower => tower.lane), [0, 2, 6]);
    assert.equal(f.targeted.use(card, 4, 3), "handled");
    assert.equal(f.state.chars, 10000 - card.cost);
    assert.equal(f.state.towers.filter(tower => tower.transient && tower.inPlay).length, 3);
    f.flush();
    for (const unit of units) {
      if (id === "b" || id === "?b") assert.equal(unit.facingDirection, -1);
      if (id === "t") assert.equal(unit.trueDamageUntil, 12000);
      if (id === "!") assert.equal(unit.continuousAttack, true);
    }
    assert.equal(adjacent.facingDirection, 1); assert.equal(shell.facingDirection, 1);
    assert.equal(inactive.facingDirection, 1);
    assert.equal(f.state.cardStates.find(state => state.definition.id === id).readyAt, card.cooldown);
    assert.equal(f.targeted.use(card, 4, 3), "cooldown");
  }
});

test("normal attachments remain single-target and empty columns consume nothing", () => {
  const f = extractionFixture();
  const first = f.place("A", 1, 0, 3), second = f.place("A", 1, 1, 3);
  const card = f.state.getDefinition("!");
  assert.equal(f.targeted.use(card, 0, 3, first), "handled"); f.flush();
  assert.equal(first.continuousAttack, true); assert.equal(second.continuousAttack, undefined);
  f.state.unlimitedFirepower = true; f.state.battleTime = 30000;
  const chars = f.state.chars;
  assert.equal(f.targeted.use(card, 0, 4), "empty"); assert.equal(f.state.chars, chars);
});

test("! automatically activates untargeted skills; Air Patrol lasts 10 seconds and recharges afterwards", () => {
  const f = extractionFixture(), w = f.place("w"), c = f.place("c", 1, 2, 1);
  const o = f.place("o", 1, 3, 1), j = f.place("j", 1, 4, 1), manualW = f.place("w", 1, 5, 1);
  const s = f.place("S", 1, 0, 2), push = f.place("#", 1, 1, 2);
  for (const tower of [w, c, o, j, s, push]) tower.continuousAttack = true;
  let routed = 0;
  const runtime = { ...f.state, battleTime: 0, onTowerAction: () => { routed++; return false; },
    prepareSkillTargeting: () => assert.fail("Automatic skill entered manual targeting"),
    beginTowerPush: () => assert.fail("Automatic skill entered push targeting") };
  const controller = new (load("src/game/towerSkills.ts").TowerSkillController)(f.state.scene, () => runtime);
  for (const [tower, key] of [[c, "clock"], [o, "orientation"], [j, "gathering"], [s, "spellMortar"], [push, "push"]]) {
    tower.skills[key] = { sp: 100, spBuffer: 0, activeUntil: 0 };
  }
  runtime.battleTime = 2000; controller.update(2, 2000);
  assert.equal(w.skills.airPatrol.activeUntil, 12000); assert.equal(w.flyingUntil, 12000);
  assert.equal(w.skills.airPatrol.sp, 0); assert.equal(manualW.skills.airPatrol.sp, 10);
  assert.equal(manualW.skills.airPatrol.activeUntil, 0);
  for (const [tower, key] of [[c, "clock"], [o, "orientation"], [j, "gathering"]]) assert.ok(tower.skills[key].activeUntil > 2000);
  assert.equal(routed, 4);
  runtime.battleTime = 11000; controller.update(9, 11000);
  assert.equal(w.skills.airPatrol.sp, 0); assert.equal(w.flyingUntil, 12000);
  runtime.battleTime = 12000; controller.update(0, 12000);
  assert.equal(w.flyingUntil, 0); assert.equal(w.skills.airPatrol.sp, 0);
  runtime.battleTime = 22000; controller.update(10, 22000);
  assert.equal(w.skills.airPatrol.activeUntil, 32000);
  assert.equal(w.skills.airPatrol.sp, 0);
});

function copyFixture() {
  const f = extractionFixture();
  const copy = load("src/game/towerCopy.ts");
  return { ...f, ...copy, sync: () => copy.syncTowerCopies({ ...f.state, onChanged: noop }) };
}

test("AE-2 uses the chapter-four template, adds both hexagons and unlocks @", () => {
  const { getLevelConfig } = load("src/data/levels.ts");
  const first = getLevelConfig("AE-1"), level = getLevelConfig("AE-2");
  assert.equal(level.totalWaves, 20);
  assert.equal(level.unlockAfter, "AE-1");
  for (const key of ["startingChars", "firstWaveWeight", "waveWeightIncrement", "waveWeightIncrementGrowth", "wavesPerFlag"])
    assert.equal(level[key], first[key], key);
  assert.deepEqual(level.enemyKinds, ["circle", "tilde", "tilde2", "tilde3", "angelPentagon", "angelPentagon2",
    "angelPentagonRam", "archangelHeptagon", "slopeTriangle", "hexagon", "hexSpellBulwark"]);
  assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement("@"), "AE-2");
  const card = cardDefinitions.find(card => card.id === "@");
  assert.equal(card.cost, 1000);
  assert.equal(card.cooldown, 60000);
});

test("@ copies every eligible panel including ASCII using its own level, not target upgrades", () => {
  const { towerBehaviorType } = load("src/game/towerIdentity.ts");
  for (const definition of cardDefinitions) {
    const f = copyFixture();
    const caster = f.place("@", 3, 3, 3);
    f.place(definition.id, 20, 3, 4);
    f.sync();
    const eligible = definition.cost <= 999 && !["b", "t", "y", "!", "()", "[]"].includes(definition.id);
    assert.equal(f.isCopyableDefinition(definition), eligible, definition.id);
    assert.equal(caster.type, "@");
    assert.equal(caster.level, 3);
    assert.equal(towerBehaviorType(caster), eligible ? definition.id : "@", definition.id);
    if (eligible) {
      assert.equal(caster.finalStats.maxHp, towerForCard(definition, 3).finalStats.maxHp, definition.id);
      assert.equal(caster.finalStats.attackPower, towerForCard(definition, 3).finalStats.attackPower, definition.id);
      assert.equal(caster.finalStats.armor, definition.armor ?? 0, definition.id);
    }
  }
});

test("manual skill dispatch is shared by original and copied towers without sharing charge", () => {
  const { TowerSkillController } = load("src/game/towerSkills.ts");
  for (const [id, skill] of [["#", "push"], ["j", "gathering"], ["o", "orientation"],
    ["c", "clock"], ["S", "spellMortar"], ["w", "airPatrol"]]) {
    const f = copyFixture();
    const source = f.place(id, 1, 3, 4);
    const caster = f.place(f.isCopyableDefinition(f.state.getDefinition(id)) ? "@" : id, 2, 3, 3);
    f.sync();
    let prepared = 0, pushSource;
    f.state.prepareSkillTargeting = () => prepared++;
    f.state.beginTowerPush = tower => { pushSource = tower; };
    f.state.onTargetingChanged = noop;
    const controller = new TowerSkillController(f.state.scene, () => f.state);
    const input = { x: 400, y: 300, allReady: false };
    assert.equal(controller.tryActivateManualSkill(caster, input), false, id);
    assert.equal(prepared, 0);
    caster.skills[skill] = { sp: 100, spBuffer: 0, activeUntil: 0 };
    source.skills[skill] = { sp: 100, spBuffer: 0, activeUntil: 0 };
    assert.equal(controller.tryActivateManualSkill(caster, input), true, id);
    assert.equal(source.skills[skill].sp, 100, id);
    assert.equal(source.skills[skill].activeUntil, 0, id);
    assert.equal(prepared, id === "#" || id === "S" ? 1 : 0, id);
    if (id === "#") assert.equal(pushSource, caster);
    else if (id === "S") assert.deepEqual(controller.spellMortarTargetingTowers, [caster]);
    else assert.ok(caster.skills[skill].activeUntil > 0, id);
    controller.resetTowerSkill(caster);
    assert.equal(controller.tryActivateManualSkill(caster, input), false, id);
    assert.equal(caster.skills[skill].sp, 0, id);
    f.state.removeTower(source); f.sync();
    assert.equal(controller.tryActivateManualSkill(caster, input), false, `empty @ after ${id}`);
  }
});

test("group skill dispatch includes ready originals and copies but not unrelated or removed towers", () => {
  const { TowerSkillController } = load("src/game/towerSkills.ts");
  for (const [id, skill] of [["c", "clock"], ["S", "spellMortar"]]) {
    const f = copyFixture();
    const source = f.place(id, 1, 3, 4);
    const caster = f.place(f.isCopyableDefinition(f.state.getDefinition(id)) ? "@" : id, 1, 3, 3);
    const empty = f.place("@", 1, 0, 0);
    const removed = f.place(id, 1, 1, 1);
    removed.inPlay = false;
    f.sync();
    for (const tower of [source, caster, empty, removed]) tower.skills[skill] = { sp: 100, spBuffer: 0, activeUntil: 0 };
    f.state.prepareSkillTargeting = noop;
    const controller = new TowerSkillController(f.state.scene, () => f.state);
    assert.equal(controller.tryActivateManualSkill(caster, { x: 400, y: 300, allReady: true }), true);
    if (id === "S") assert.deepEqual(controller.spellMortarTargetingTowers, [source, caster]);
    else {
      assert.ok(source.skills.clock.activeUntil > 0);
      assert.equal(caster.skills.clock.activeUntil, source.skills.clock.activeUntil);
    }
    assert.equal(empty.skills[skill].activeUntil, 0);
    assert.equal(removed.skills[skill].activeUntil, 0);
  }
});

test("@ tracks effective facing and target removal, preserves HP ratio and never inherits target SP or buffs", () => {
  const f = copyFixture();
  const caster = f.place("@", 2, 3, 3);
  caster.hp = 600; caster.trueDamageUntil = 9000; caster.autoUpgrade = true;
  const right = f.place("w", 10, 3, 4);
  right.skills.airPatrol.sp = 10; right.trueDamageUntil = 60000;
  f.place("X", 8, 3, 2);
  f.state.battleTime = 500;
  assert.equal(f.sync(), true);
  assert.equal(caster.hp / caster.maxHp, 0.5);
  assert.equal(caster.maxHp, towerForCard(f.state.getDefinition("w"), 2).finalStats.maxHp);
  assert.equal(caster.skills.airPatrol.sp, 8);
  assert.equal(caster.trueDamageUntil, 9000);
  caster.skills.airPatrol.sp = 9;
  assert.equal(f.sync(), false);
  assert.equal(caster.skills.airPatrol.sp, 9);
  rules.applyReversalEffect(caster, 1000, 500);
  f.sync();
  assert.equal(caster.copiedType, "X");
  assert.equal(caster.hp, 600);
  assert.equal(caster.lastFire, 500);
  assert.deepEqual(caster.skills, {});
  f.state.occupied.delete("3:2");
  f.sync();
  assert.equal(caster.copiedType, undefined);
  assert.equal(caster.finalStats.attackPower, 0);
  assert.equal(caster.attackSpeed, undefined);
  assert.equal(caster.autoUpgrade, true);
  assert.equal(caster.hp, 600);
  assert.equal(caster.copyRevision, 3);
});

test("@ upgrades only with @ and retains its price for extraction and auto-upgrade selection", () => {
  const f = copyFixture();
  const caster = f.place("@", 2, 3, 3);
  f.place("B", 1, 3, 4);
  f.sync(); caster.autoUpgrade = true;
  assert.equal(towers.findAutoUpgradeTarget([caster], "B"), undefined);
  assert.equal(towers.findAutoUpgradeTarget([caster], "@"), caster);
  assert.equal(f.deployment.useCard(f.state.getDefinition("B"), 3, 3), "occupied");
  assert.equal(f.deployment.useCard(f.state.getDefinition("@"), 3, 3), "deployed");
  assert.equal(caster.level, 3);
  assert.equal(caster.maxHp, 7800);
  assert.equal(f.state.chars, 9000);
  f.state.extraction.extract(caster, f.state.getDefinition(caster.type).cost, 1);
  assert.equal(f.state.extraction.value, 1500);
});

test("@ retains shared health percentage when its copied contribution changes", () => {
  const f = copyFixture();
  const caster = f.place("@", 1, 3, 3);
  const target = f.place("B", 1, 3, 4);
  f.place("u", 1, 2, 3);
  f.sync();
  const health = load("src/game/towerHealth.ts");
  health.syncTowerHealthNetworks(f.state.towers);
  const pool = caster.healthPool;
  pool.hp = pool.maxHp / 2;
  health.changeTowerHealth(caster, 0);
  f.state.removeTower(target);
  f.sync();
  assert.equal(pool.hp / pool.maxHp, 0.5);
  assert.equal(caster.hp / caster.maxHp, 0.5);
});

const health = load("src/game/towerHealth.ts");

function unyieldingFixture() {
  const f = extractionFixture();
  const runtime = { ...f.state, projectiles: [], enemyProjectiles: [], mortarProjectiles: [], onTowerDamaged: noop };
  return { ...f, runtime, refresh: () => lifecycle.settleTowerHealth(runtime) };
}

test("magic shield receives post-MR damage at the actual receiver and ignores physical and true damage", () => {
  const f = unyieldingFixture(), calls = [];
  const target = f.place("O", 1, 3, 5);
  f.runtime.absorbTowerDamage = (tower, damage, type) => {
    if (type !== "magic") return damage;
    calls.push([tower, damage]); return Math.max(0, damage - 200);
  };
  lifecycle.damageTower(f.runtime, target, 1000, "magic");
  assert.ok(Math.abs(calls[0][1] - 300) < 1e-9);
  assert.equal(target.hp, 2900);
  lifecycle.damageTower(f.runtime, target, 400, "physical");
  lifecycle.damageTower(f.runtime, target, 100, "true");
  assert.equal(target.hp, 2700);
  assert.equal(calls.length, 1);
  const shell = f.place("()", 1, 3, 5);
  load("src/game/towerOccupancy.ts").syncTowerOccupancy(f.state.towers, f.state.occupied);
  lifecycle.damageTower(f.runtime, target, 1000, "magic");
  assert.equal(calls[1][0], shell);
  assert.equal(calls[1][1], 600);
  assert.equal(shell.hp, 2600);
  assert.equal(target.hp, 2700);
});

test("physical pipeline shields spend post-armor damage, including parentheses, without affecting magic or true damage", () => {
  const f = unyieldingFixture();
  const outlet = f.place("/", 1, 3, 4), target = f.place("O", 1, 3, 5);
  const { ProjectileCircuitController } = load("src/game/projectileCircuit.ts");
  const { projectileDamageBudget } = load("src/game/projectileIntegrity.ts");
  const controller = new ProjectileCircuitController(() => ({ ...f.runtime, edges: [], battleTime: 0, changed: noop, emit: noop }));
  controller.sync();
  f.runtime.absorbTowerDamage = (tower, amount, type) => controller.absorbDamage(tower, amount, type);
  outlet.projectileNode.input.push({ damage: 300, hitCount: 10 });
  lifecycle.damageTower(f.runtime, target, 1000, "physical");
  assert.equal(target.hp, 3000);
  assert.equal(projectileDamageBudget(outlet.projectileNode.input[0]), 900);
  lifecycle.damageTower(f.runtime, target, 1000, "magic");
  lifecycle.damageTower(f.runtime, target, 100, "true");
  assert.equal(target.hp, 2600);
  assert.equal(projectileDamageBudget(outlet.projectileNode.input[0]), 900);
  lifecycle.damageTower(f.runtime, target, 1000, "physical");
  assert.equal(target.hp, 2200);
  assert.equal(outlet.projectileNode.input.length, 0);
  const shell = f.place("()", 1, 3, 5);
  load("src/game/towerOccupancy.ts").syncTowerOccupancy(f.state.towers, f.state.occupied);
  outlet.projectileNode.input.push({ damage: 3000 });
  lifecycle.damageTower(f.runtime, target, 1000, "physical");
  assert.equal(shell.hp, 3000);
  assert.equal(target.hp, 2200);
  assert.equal(projectileDamageBudget(outlet.projectileNode.input[0]), 900);
});

function gatheringFixture() {
  const f = unyieldingFixture();
  const j = f.place("j", 1, 3, 4);
  j.skills.gathering = { sp: 0, spBuffer: 0, activeUntil: 10000 };
  Object.assign(f.runtime, { enemies: [], battleTime: 1000, getBoss: () => null,
    damageTower: (tower, amount, type) => lifecycle.damageTower(f.runtime, tower, amount, type) });
  const { CELL_HEIGHT } = load("src/config.ts");
  const shot = (overrides = {}) => ({ type: "bolt", lane: 2, x: j.x, y: j.y - CELL_HEIGHT,
    vx: 0, vy: 0, damage: 400, damageType: "physical", hitCount: 3,
    maxX: 10000, limitDirection: 1, splashRadius: 0, body: visual(), ...overrides });
  const enemyShot = (overrides = {}) => ({ x: j.x, y: j.y - CELL_HEIGHT, sourceLane: 2,
    vx: 0, damage: 400, damageType: "magic", hitCount: 3, body: visual(), ...overrides });
  return { ...f, j, shot, enemyShot, ...load("src/game/gathering.ts"),
    updateEnemy: seconds => load("src/game/projectileRuntime.ts").updateEnemyProjectiles(f.runtime, seconds),
    update: seconds => load("src/game/projectileRuntime.ts").updateTowerProjectiles(f.runtime, seconds) };
}

test("j matches L's panel and HP upgrades, costs 225 and unlocks after 3-10", () => {
  const f = extractionFixture();
  const card = f.state.getDefinition("j");
  const l = f.state.getDefinition("L");
  for (const key of ["category", "cooldown", "maxHp", "armor", "magicResistance", "attackPower"]) assert.equal(card[key], l[key]);
  assert.equal(card.cost, 225);
  assert.equal(card.selfDamage, 100);
  assert.equal(card.selfDamageType, "true");
  assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement("j"), "3-10");
  const j = f.place("j");
  towers.applyTowerUpgradeStats(j, card, towers.upgradeTowerLevel(j), 0);
  assert.equal(j.finalStats.maxHp, 5400);
  assert.equal(j.hp, 5400);
  assert.equal(j.finalStats.attackPower, 0);
});

test("Gathering charges from 0, spends 10, stays active for 10s, pauses regeneration and resets on upgrade", () => {
  const f = extractionFixture();
  const j = f.place("j");
  const { TowerSkillController } = load("src/game/towerSkills.ts");
  const controller = new TowerSkillController(f.state.scene, () => f.state);
  const step = seconds => { f.state.battleTime += seconds * 1000; controller.update(seconds, f.state.battleTime); };
  step(0);
  assert.equal(j.skills.gathering.sp, 0);
  assert.equal(controller.isGatheringReady(j), false);
  controller.activateGatheringTower(j);
  assert.equal(j.skills.gathering.activeUntil, 0);
  step(10);
  assert.equal(controller.isGatheringReady(j), true);
  controller.activateGatheringTower(j);
  assert.equal(j.skills.gathering.activeUntil, 20000);
  assert.equal(j.skills.gathering.sp, 0);
  assert.equal(j.rangeBorder.alpha, 0.9);
  step(9.5);
  controller.activateGatheringTower(j);
  assert.equal(j.skills.gathering.activeUntil, 20000);
  step(1);
  assert.equal(j.skills.gathering.sp, 0);
  assert.equal(j.skills.gathering.spBuffer, 0.5);
  assert.equal(j.rangeBorder.alpha, 0.22);
  step(9.5);
  assert.equal(controller.isGatheringReady(j), true);
  controller.activateGatheringTower(j);
  controller.resetTowerSkill(j);
  assert.equal(j.skills.gathering.sp, 0);
  assert.equal(j.skills.gathering.activeUntil, 0);
  assert.equal(j.rangeBorder.alpha, 0.22);
});

test("Gathering moves only bullets in the two adjacent same-column cells and costs once per bullet, not hit", () => {
  const f = gatheringFixture();
  const { CELL_HEIGHT, CELL_WIDTH } = load("src/config.ts");
  const shots = [f.shot(), f.shot({ y: f.j.y + CELL_HEIGHT, lane: 4 }),
    f.shot({ y: f.j.y, lane: 3 }), f.shot({ y: f.j.y - 2 * CELL_HEIGHT, lane: 1 }),
    f.shot({ x: f.j.x + CELL_WIDTH })];
  f.runtime.projectiles.push(...shots);
  f.update(0);
  assert.equal(f.j.hp, 3000 - 200);
  assert.deepEqual(shots.map(s => s.lane), [3, 3, 3, 1, 2]);
  assert.equal(shots[0].body.y, f.j.y);
  assert.equal(shots[0].damage, 400);
  assert.equal(shots[0].hitCount, 3);
  f.update(0);
  assert.equal(f.j.hp, 2800);
});

test("Gathering catches fast shots from either direction, preserves velocity/targets, and hits enemies in the new lane", () => {
  const { CELL_WIDTH } = load("src/config.ts");
  for (const direction of [-1, 1]) {
    const f = gatheringFixture();
    const target = enemy();
    const shot = f.shot({ x: f.j.x - direction * CELL_WIDTH, vx: direction * CELL_WIDTH * 2,
      targetEnemy: target });
    f.runtime.projectiles.push(shot);
    f.update(1);
    assert.equal(shot.lane, f.j.lane);
    assert.equal(shot.y, f.j.y);
    assert.equal(shot.x, f.j.x + direction * CELL_WIDTH);
    assert.equal(shot.vx, direction * CELL_WIDTH * 2);
    assert.equal(shot.targetEnemy, target);
    assert.equal(f.j.hp, 2900);
  }
  const f = gatheringFixture();
  const shot = f.shot();
  const target = enemy({ lane: f.j.lane, x: f.j.x, y: f.j.y });
  f.runtime.enemies.push(target);
  const hits = [];
  f.runtime.damageEnemy = (target, damage, type) => hits.push([target, damage, type]);
  f.runtime.projectiles.push(shot);
  f.update(0);
  assert.equal(hits.length, 3);
  assert.deepEqual(hits[0], [target, 400, "physical"]);
  assert.equal(f.runtime.projectiles.length, 0);
});

test("Gathering leaves mortars alone, and ignores expired, transient or removed gatherers", () => {
  const f = gatheringFixture();
  const enemyShot = f.enemyShot();
  const mortar = { owner: "tower", fromX: 300, fromY: 200, targetX: 600, targetY: 200,
    x: f.j.x, y: f.shot().y, progress: 0, duration: 1000, body: visual() };
  f.runtime.enemyProjectiles.push(enemyShot);
  f.runtime.mortarProjectiles.push(mortar);
  load("src/game/projectileRuntime.ts").updateMortarProjectiles(f.runtime, 0.01);
  assert.equal(enemyShot.sourceLane, 2);
  assert.equal(mortar.targetY, 200);
  assert.equal(f.j.hp, 3000);
  const shot = f.shot();
  f.runtime.projectiles.push(shot);
  for (const state of [{ inPlay: false }, { inPlay: true, transient: true }, { transient: false }]) {
    Object.assign(f.j, state);
    if (!f.j.transient && f.j.inPlay) f.runtime.battleTime = 10000;
    f.update(0);
    f.updateEnemy(0);
    assert.equal(shot.lane, 2);
    assert.equal(enemyShot.sourceLane, 2);
    assert.equal(f.j.hp, 3000);
  }
});

test("Gathering pulls enemy bullets into the new lane without converting damage or hit count", () => {
  const f = gatheringFixture(), shot = f.enemyShot();
  const hits = [];
  f.runtime.damageTower = (...args) => hits.push(args);
  f.runtime.enemyProjectiles.push(shot);
  f.updateEnemy(0);
  assert.equal(shot.sourceLane, f.j.lane);
  assert.equal(shot.y, f.j.y);
  assert.equal(shot.lastGatheredAt, 1000);
  assert.equal(shot.hitCount, 3);
  assert.deepEqual(hits, [[f.j, 100, "true"], [f.j, 400, "magic"], [f.j, 400, "magic"], [f.j, 400, "magic"]]);
  assert.equal(f.runtime.enemyProjectiles.length, 0);
  assert.equal(f.runtime.projectiles.length, 0);
});

test("Gathering sweeps fast enemy bullets from both directions and keeps their velocity", () => {
  const { CELL_WIDTH } = load("src/config.ts");
  for (const direction of [-1, 1]) {
    const f = gatheringFixture();
    const shot = f.enemyShot({ x: f.j.x - direction * CELL_WIDTH, vx: direction * CELL_WIDTH * 2 });
    f.runtime.enemyProjectiles.push(shot);
    f.updateEnemy(1);
    assert.equal(shot.sourceLane, f.j.lane);
    assert.equal(shot.x, f.j.x + direction * CELL_WIDTH);
    assert.equal(shot.vx, direction * CELL_WIDTH * 2);
    assert.equal(shot.damage, 400);
    assert.equal(shot.hitCount, 3);
    assert.equal(f.j.hp, 2900);
    assert(f.runtime.enemyProjectiles.includes(shot));
  }
});

test("enemy Gathering shares the interval and cancels simultaneous competing pulls", () => {
  for (const reverseOrder of [false, true]) {
    const f = gatheringFixture(), other = f.place("j", 1, 1, 4);
    other.skills.gathering = { sp: 0, spBuffer: 0, activeUntil: 10000 };
    if (reverseOrder) f.runtime.towers.reverse();
    const shot = f.enemyShot();
    f.runtime.enemyProjectiles.push(shot);
    f.updateEnemy(0);
    assert.equal(shot.sourceLane, 2);
    assert.equal(f.j.hp, 3000);
    assert.equal(other.hp, 3000);
  }
  const f = gatheringFixture(), other = f.place("j", 1, 2, 4);
  other.skills.gathering = { sp: 0, spBuffer: 0, activeUntil: 10000 };
  const shot = f.enemyShot();
  const pull = () => f.gatherProjectile(f.runtime, f.runtime.towers, shot, shot.x, shot.y);
  assert.equal(pull(), true);
  f.runtime.battleTime = 1099;
  assert.equal(pull(), false);
  assert.equal(shot.sourceLane, 3);
  f.runtime.battleTime = 1100;
  assert.equal(pull(), true);
  assert.equal(shot.sourceLane, 2);
  assert.equal(f.j.hp, 2900);
  assert.equal(other.hp, 2900);
});

test("enemy Gathering stops on lethal self-damage and tolerates linked projectile cleanup", () => {
  const f = gatheringFixture(), first = f.enemyShot(), second = f.enemyShot();
  f.j.hp = 100;
  f.runtime.enemyProjectiles.push(first, second);
  f.updateEnemy(0);
  assert.equal(f.j.inPlay, false);
  assert.equal(first.sourceLane, 3);
  assert.equal(second.sourceLane, 2);
  const other = gatheringFixture(), shot = other.enemyShot();
  other.runtime.enemyProjectiles.push(shot);
  other.runtime.damageTower = () => { other.j.inPlay = false; other.runtime.enemyProjectiles.length = 0; shot.body.destroy(); };
  other.updateEnemy(0);
  assert.equal(shot.body.destroyed, true);
  assert.equal(other.runtime.enemyProjectiles.length, 0);
});

test("enemy Gathering preserves interception before movement and checks the destination without a phantom diagonal", () => {
  const f = gatheringFixture(), shot = f.enemyShot();
  f.runtime.enemyProjectiles.push(shot);
  const segments = [];
  f.runtime.interceptProjectile = (projectile, from) => {
    segments.push({ from: { ...from }, to: { x: projectile.x, y: projectile.y } });
    return segments.length === 2;
  };
  f.updateEnemy(0);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[1], { from: { x: f.j.x, y: f.j.y }, to: { x: f.j.x, y: f.j.y } });
  assert.equal(f.runtime.enemyProjectiles.length, 0);
  assert.equal(f.j.hp, 2900);
  const blocked = gatheringFixture();
  blocked.runtime.enemyProjectiles.push(blocked.enemyShot());
  blocked.runtime.interceptProjectile = () => true;
  blocked.updateEnemy(0);
  assert.equal(blocked.j.hp, 3000);
});

test("Gathering stops immediately on lethal self-damage and tolerates linked projectile cleanup", () => {
  const f = gatheringFixture();
  f.j.hp = 100;
  const first = f.shot(), second = f.shot();
  f.runtime.projectiles.push(first, second);
  f.update(0);
  assert.equal(f.j.inPlay, false);
  assert.equal(first.lane, 3);
  assert.equal(second.lane, 2);
  const other = gatheringFixture();
  const shot = other.shot();
  other.runtime.projectiles.push(shot);
  other.runtime.damageTower = () => { other.j.inPlay = false; other.runtime.projectiles.length = 0; shot.body.destroy(); };
  other.update(0);
  assert.equal(shot.body.destroyed, true);
  assert.equal(other.runtime.projectiles.length, 0);
});

test("gatherers can steal the same bullet repeatedly, respecting its 100ms transfer interval", () => {
  const f = gatheringFixture();
  const other = f.place("j", 1, 2, 4);
  other.skills.gathering = { sp: 0, spBuffer: 0, activeUntil: 10000 };
  const shot = f.shot();
  f.runtime.projectiles.push(shot);
  f.update(0);
  assert.equal(shot.lane, 3);
  f.runtime.battleTime = 1099;
  f.update(0);
  assert.equal(shot.lane, 3);
  assert.equal(other.hp, 3000);
  f.runtime.battleTime = 1100;
  f.update(0);
  assert.equal(shot.lane, 2);
  f.runtime.battleTime = 1200;
  f.update(0);
  assert.equal(shot.lane, 3);
  assert.equal(f.j.hp, 2800);
  assert.equal(other.hp, 2900);
});

test("same-frame competing gatherers all cancel without damage, regardless of tower order or crossing order", () => {
  for (const reverseOrder of [false, true]) {
    const f = gatheringFixture();
    const other = f.place("j", 1, 1, 4);
    other.skills.gathering = { sp: 0, spBuffer: 0, activeUntil: 10000 };
    if (reverseOrder) f.runtime.towers.reverse();
    const shot = f.shot();
    f.runtime.projectiles.push(shot);
    f.update(0);
    assert.equal(shot.lane, 2);
    assert.equal(f.j.hp, 3000);
    assert.equal(other.hp, 3000);
    other.skills.gathering.activeUntil = 0;
    f.runtime.battleTime++;
    f.update(0);
    assert.equal(shot.lane, 3);
    assert.equal(f.j.hp, 2900);
  }
  const f = gatheringFixture();
  const { CELL_WIDTH } = load("src/config.ts");
  const earlier = f.place("j", 1, 3, 2);
  earlier.skills.gathering = { sp: 0, spBuffer: 0, activeUntil: 10000 };
  const fast = f.shot({ x: earlier.x - CELL_WIDTH, vx: CELL_WIDTH * 4 });
  f.runtime.projectiles.push(fast);
  f.update(1);
  assert.equal(fast.lane, 2);
  assert.equal(earlier.hp, 3000);
  assert.equal(f.j.hp, 3000);
});

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

test("stasis reduces movement by 30%, refreshes without stacking and expires", () => {
  const target = enemy();
  statuses.applyStatusEffect(target, "stasis", 1000, 0);
  assert.equal(statuses.statusSpeedMultiplier(target, 100), 0.7);
  assert.equal(statuses.statusAttackMultiplier(target, 100), 1);
  statuses.applyStatusEffect(target, "stasis", 1000, 500);
  assert.equal(target.statusEffects.length, 1);
  assert.equal(statuses.statusSpeedMultiplier(target, 1000), 0.7);
  assert.equal(statuses.statusSpeedMultiplier(target, 1500), 1);
});

test("d sunder halves armor, refreshes for ten seconds and does not stack", () => {
  const target = enemy();
  statuses.applyStatusEffect(target, "sunder", 10000, 0);
  assert.equal(statuses.statusArmorMultiplier(target, 1000), 0.5);
  statuses.applyStatusEffect(target, "sunder", 10000, 9000);
  assert.equal(target.statusEffects.length, 1);
  assert.equal(statuses.statusArmorMultiplier(target, 10000), 0.5);
  assert.equal(statuses.statusArmorMultiplier(target, 19000), 1);
});

test("r uses the requested panel and l cooldown; duration is linear including aura levels", () => {
  assert.equal(definition.cost, 275);
  assert.equal(definition.cooldown, cardDefinitions.find((card) => card.id === "l").cooldown);
  assert.equal(definition.attackPower, 400);
  assert.equal(definition.attackMultiplier, 2.5);
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
  triggers.triggerShockTower(runtime([target]), tower({ level: 3, finalStats: { attackPower: 600 } }));
  assert.equal(target.hp, 3800);
  assert.equal(target.statusEffects[0].expiresAt, 16000);
});

test("enemy reapplication extends without flipping twice, and expiry restores base facing", () => {
  const target = enemy();
  statuses.applyStatusEffect(target, "reversed", 5000, 1000);
  statuses.statusMultipliers(target, 1000);
  syncEnemyStatusVisuals(target, 1000);
  assert.equal(rules.enemyMovementDirection(target), 1);
  assert.equal(target.visualDirection, 1);
  statuses.applyStatusEffect(target, "reversed", 5000, 2000);
  assert.equal(target.statusEffects.length, 1);
  statuses.statusMultipliers(target, 6999);
  assert.equal(rules.enemyMovementDirection(target), 1);
  statuses.statusMultipliers(target, 7000);
  syncEnemyStatusVisuals(target, 7000);
  assert.equal(rules.enemyMovementDirection(target), -1);
  assert.equal(target.visualDirection, -1);
});

test("towers hold reversal and permanent facing changes survive expiry", () => {
  const target = tower();
  statuses.applyStatusEffect(target, "reversed", 5000, 0);
  towers.syncTowerFacingVisual(target);
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

test("bounded attack panels stay constant while multipliers preserve damage, softcaps and aura levels", () => {
  const baseline = {
    A: 400, a: 400, B: 400, C: 500, d: 400, z: 400, x: 200, E: 400, e: 90, g: 90, M: 400, W: 400,
    w: 400, F: 1400, l: 15000, r: 200, G: 15000, H: 700, I: 400, Q: 400, J: 600,
    K: 1800, k: 280, S: 5000, Z: 400, V: 1700, v: 350, P: 250, p: 250
  };
  const attackUpgrades = new Set(["d", "z", "x", "Q", "k", "S", "V", "v", "l", "G"]);
  for (const card of cardDefinitions) {
    const base = baseline[card.id] ?? 0;
    assert.ok(base === 0 ? card.attackPower === 0 : card.attackPower >= 250 && card.attackPower <= 800, card.id);
    for (const level of [1, 2, 3, 20, 21, 22, 60, 61, 140, 141, 300, 301]) {
      const unit = towerForCard(card, level);
      const expected = attackUpgrades.has(card.id) ? upgrades.scaledByEffectiveUpgrades(base, level) : base;
      assert.equal(unit.baseStats.attackPower, card.attackPower);
      assert.equal(unit.finalStats.attackPower, card.attackPower, `${card.id} level ${level}`);
      assert.ok(Math.abs(stats.towerAttackAmount(unit, card) - expected * (card.id === "r" ? 5 : 1)) < 1e-7, `${card.id} level ${level}`);
      unit.levelBonus = 2;
      unit.mirrorLevelBonus = 3;
      stats.calculateTowerFinalStats(unit);
      assert.equal(unit.finalStats.attackPower, card.attackPower);
      const bonusDamage = attackUpgrades.has(card.id) ? upgrades.scaledByEffectiveUpgrades(base, level + 5) : base;
      assert.ok(Math.abs(stats.towerAttackAmount(unit, card) - bonusDamage * (card.id === "r" ? 5 : 1)) < 1e-7);
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
    const shot = { ...(mortar ? { owner: "enemy" } : {}), x: target.x, y: target.y, fromX: target.x, fromY: target.y, vx: 0, sourceLane: target.lane, targetX: target.x, targetY: target.y, progress: 1, duration: 1000, rangeX: 80, rangeY: 80, damage: 400, damageType: "physical", hitCount: 2, body: visual(), sourceEnemy: enemy() };
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
    const expected = caster.finalStats.attackPower * upgrades.upgradedAttackMultiplier(id, 1.5, 3);
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

test("pipeline attacks preserve upgraded damage, captured levels, partial budgets and independent judgments", () => {
  const { storeTowerAction } = load("src/game/pipelineActionPayload.ts");
  const { executePipelineAction } = load("src/game/pipelineActionEffects.ts");
  for (const id of ["Q", "x", "v", "V"]) {
    const card = cardDefinitions.find(card => card.id === id);
    const source = towerForCard(card, 3);
    source.levelBonus = 2;
    const expected = stats.towerAttackAmount(source, card);
    const shot = storeTowerAction(source, card, { kind: "attack", hitCount: 3 }, 1000);
    shot.damage /= 2;
    source.level = 100;
    const outlet = towerForCard(cardDefinitions.find(card => card.id === "1"), 9);
    const target = enemy({ x: outlet.x + 100, y: outlet.y, lane: outlet.lane });
    const combat = { enemies: [target], boss: null, battleTime: 1000, occupied: new Map(), towers: [outlet],
      scene: {}, projectiles: [], mortarProjectiles: [] };
    executePipelineAction(shot, outlet, { combat, getDefinition: () => card });
    const projectiles = [...combat.projectiles, ...combat.mortarProjectiles];
    assert.equal(projectiles.length, id === "x" ? 12 : 3, id);
    for (const projectile of projectiles) assert.ok(Math.abs(projectile.damage - expected / 2) < 1e-8, id);
    assert.equal(outlet.finalStats.attackPower, 0);
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

test("z damages vulnerable Boss parts normally but never drains Boss SP", () => {
  const card = cardDefinitions.find(card => card.id === "z"), caster = towerForCard(card);
  for (const invincibleUntil of [0, 99999]) {
    const skills = () => ({ promotion: { sp: 5, spBuffer: 0.7, activeUntil: 0 }, advance: { sp: 1, spBuffer: 0.3, activeUntil: 0 } });
    const boss = { kind: "cube", x: 700, y: 800, hp: 10000, maxHp: 10000, hitboxWidth: 100, hitboxHeight: 100,
      skills: skills(), invincibleUntil: 0, baseStats: { armor: 300, magicResistance: 20, finalDamageReduction: 0 } };
    const copy = { ...boss, y: caster.y, invincibleUntil, skills: skills() };
    boss.octahedronCopies = [copy];
    load("src/game/cardBehaviors.ts").cardBehaviorsById.z.execute(caster, card, runtime([], boss));
    assert.equal(boss.hp, invincibleUntil ? 10000 : 9680);
    assert.deepEqual(copy.skills, skills());
    assert.equal(boss.skills.promotion.sp, 5);
    assert.equal(boss.skills.advance.sp, 1);
  }
});

test("lasers, slashes and arc waves apply the upgraded multiplier exactly once", () => {
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
    assert.deepEqual(hits, [1234 * upgrades.upgradedAttackMultiplier(id, 1.5, 3)], id);
  }
});

test("trigger attacks preserve burst upgrades while G and l scale attack only once", () => {
  for (const id of ["F", "l", "G", "r"]) {
    const card = cardDefinitions.find((candidate) => candidate.id === id);
    const caster = towerForCard(card, 2);
    const target = enemy({ x: caster.x, y: caster.y });
    const hits = [];
    const actions = new (load("src/game/battleActions.ts").BattleActionQueue)();
    const state = {
      ...runtime([target]), getDefinition: () => card,
      scene: {}, scheduleBattleAction: (delay, action) => actions.schedule(0, delay, action),
      damageEnemy: (_target, damage) => { hits.push(damage); return true; }
    };
    if (id === "G") triggers.triggerTrapTower(state, caster, target);
    else triggers.triggerShockTower(state, caster);
    actions.update(10000, action => triggers.executeShockPulse(state, action));
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
