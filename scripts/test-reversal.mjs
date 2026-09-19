import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const noop = () => {};
const effects = {
  makeReversalPulse: noop, makeBossHitFlash: noop, makeBossInvincibleFlash: noop, makeEnemyInvincibleFlash: noop,
  makeShockPulse: noop, makeTrapBurst: noop, makeSlashEffect: noop, makeArcWaveEffect: noop, makeShiftEffect: noop,
  makeTowerLaserEffect: noop, makeHitShards: noop, makeSunderEffect: noop, makeHealParticles: noop,
  damageEffectTextColor: () => "#ffffff"
};
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
    } } };
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
