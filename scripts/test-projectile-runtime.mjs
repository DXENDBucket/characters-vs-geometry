import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// Actual rules and state factories, with no Phaser, DOM, rendering or module overrides.
const load = createTypeScriptLoader();
const { updateTowerProjectiles, updateEnemyProjectiles, updateMortarProjectiles } = load("src/game/projectileRuntime.ts");
const { createTowerProjectileState, createHomingTowerProjectileState, createMortarProjectileState } = load("src/game/projectileState.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { createEnemyState } = load("src/game/enemyState.ts");
const { createBossState } = load("src/game/bossState.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { NO_PROJECTILE_PRESENTATION } = load("src/game/projectilePresentation.ts");
const { ProjectileMotionFrame } = load("src/game/projectileMotion.ts");
const { calculateDamage } = load("src/game/damage.ts");
const { towerDamageReceiver } = load("src/game/towerOccupancy.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const { consumeProjectileDamage, projectileDamageBudget } = load("src/game/projectileIntegrity.ts");
const { gatherProjectile } = load("src/game/gatheringRules.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
const x = column => BOARD_X + (column + .5) * CELL_WIDTH;
const y = lane => BOARD_Y + (lane + .5) * CELL_HEIGHT;
const enemy = (column = 7, lane = 3, kind = "square") => createEnemyState({
  kind, lane, x: x(column), waveNumber: 1, waveWeight: 0, time: 0, finalDamageReduction: 0
}, () => .5);
const tower = (type = "A", column = 3, lane = 3, order = 0) => createTowerState(getCardDefinition(type), lane, column, 0, order);
const shot = (extras = {}) => createTowerProjectileState({ type: "bolt", x: x(3), y: y(3), lane: 3,
  speed: 0, damage: 400, damageType: "physical", splashRadius: 0, angleDegrees: 0, maxX: Infinity, ...extras });
const mortar = (extras = {}) => createMortarProjectileState({ owner: "enemy", fromX: x(10), fromY: y(3),
  targetX: x(3), targetY: y(3), duration: 1000, rangeX: CELL_WIDTH, rangeY: CELL_HEIGHT,
  damage: 400, damageType: "physical", ...extras });

function fixture(state = {}) {
  const hits = [];
  const runtime = { towers: [], enemies: [], boss: null, projectiles: [], enemyProjectiles: [], mortarProjectiles: [],
    occupied: new Map(), battleTime: 1000, ...state, presentation: NO_PROJECTILE_PRESENTATION,
    projectileMotion: new ProjectileMotionFrame(),
    createProjectile: createTowerProjectileState, createMortar: createMortarProjectileState };
  runtime.getBoss = () => runtime.boss;
  const damage = (target, amount, type) => {
    hits.push({ target, amount, type });
    target.hp -= calculateDamage(amount, type, target.armor, target.magicResistance);
    if ("inPlay" in target && target.hp <= 0) target.inPlay = false;
  };
  runtime.damageEnemy = damage;
  runtime.damageTower = (target, amount, type) => damage(towerDamageReceiver(target), amount, type);
  runtime.damageBoss = (amount, type, part = runtime.boss) => damage(part, amount, type);
  for (const t of runtime.towers) runtime.occupied.set(`${t.lane}:${t.column}`, t);
  const snapshot = () => captureBattleSnapshot({
    towers: runtime.towers, enemies: runtime.enemies, boss: runtime.boss, projectiles: runtime.projectiles,
    enemyProjectiles: runtime.enemyProjectiles, mortarProjectiles: runtime.mortarProjectiles, battleTime: runtime.battleTime
  });
  return { runtime, hits, snapshot };
}

test("enemy homing prioritizes flight only at launch, retains targets and saves target references", () => {
  const { createMinusProjectiles } = load("src/game/enemyHomingProjectiles.ts");
  const source = enemy(8, 3, "minus"), ground = tower("B", 7), flying = tower("w", 2, 1);
  flying.flyingUntil = 10000;
  const [shot] = createMinusProjectiles(source, [ground, flying], 0, 1);
  assert.equal(shot.targetTower, flying);
  const f = fixture({ towers: [ground, flying], enemyProjectiles: [shot] });
  updateEnemyProjectiles(f.runtime, .01);
  assert.equal(shot.targetTower, flying); assert.ok(shot.speed > 620); assert.ok(shot.vy < 0);
  const saved = decodeSaveGraph(JSON.parse(JSON.stringify(f.snapshot())), () => ({}));
  assert.equal(saved.enemyProjectiles[0].targetTower, saved.towers[1]);
  assert.equal(saved.enemyProjectiles[0].vy, shot.vy);
  flying.flyingUntil = 0;
  updateEnemyProjectiles(f.runtime, .01); assert.equal(shot.targetTower, flying);
  flying.inPlay = false;
  const otherFlying = tower("w", 0, 0); otherFlying.flyingUntil = 10000; f.runtime.towers.push(otherFlying);
  updateEnemyProjectiles(f.runtime, .01);
  assert.equal(shot.targetTower, ground, "retargeting ignores flying priority");
});

test("enemy homing sweeps only its target, preserves multi-hit budgets and permits interception", () => {
  const { createMinusProjectiles } = load("src/game/enemyHomingProjectiles.ts");
  const source = enemy(8, 3, "minus"), target = tower("B", 2, 1), bystander = tower("B", 5, 2);
  const [shot] = createMinusProjectiles(source, [target], 0, 2);
  shot.partialHitDamage = 100;
  const f = fixture({ towers: [target, bystander], enemyProjectiles: [shot] });
  updateEnemyProjectiles(f.runtime, 1);
  assert.deepEqual(f.hits.map(hit => [hit.target, hit.amount, hit.type]), [[target, 100, "magic"], [target, 200, "magic"]]);
  assert.equal(f.runtime.enemyProjectiles.length, 0);
  const [intercepted] = createMinusProjectiles(source, [target], 0, 1);
  f.runtime.enemyProjectiles.push(intercepted); f.runtime.interceptProjectile = () => true;
  updateEnemyProjectiles(f.runtime, .1);
  assert.equal(f.runtime.enemyProjectiles.length, 0); assert.equal(f.hits.length, 2);
});

test("enemy homing honors orientation and reflects its actual two-dimensional velocity", () => {
  const { createMinusProjectiles } = load("src/game/enemyHomingProjectiles.ts");
  const { reflectedProjectileSpec } = load("src/game/projectileState.ts");
  const source = enemy(8, 3, "minus"), target = tower("w", 3, 2), guard = tower("o", 4, 2);
  target.flyingUntil = 10000; guard.skills.orientation = { sp: 0, spBuffer: 0, activeUntil: 10000 };
  const [shot] = createMinusProjectiles(source, [target, guard], 0, 1);
  assert.equal(shot.targetTower, guard);
  const reflected = createTowerProjectileState(reflectedProjectileSpec(shot));
  assert.ok(Math.abs(reflected.vx + shot.vx) < .001);
  assert.ok(Math.abs(reflected.vy + shot.vy) < .001);
  assert.equal(reflected.damageType, "magic");
});

test("bodyless impacts keep per-judgment armor, partial budgets and status effects", () => {
  const target = enemy(3); target.armor = 300;
  const projectile = shot({ hitCount: 3, partialHitDamage: 100, debuff: "stasis", debuffDuration: 3000 });
  const f = fixture({ enemies: [target], projectiles: [projectile] }), hp = target.hp;
  updateTowerProjectiles(f.runtime, 0);
  assert.deepEqual(f.hits.map(hit => hit.amount), [100, 400, 400]);
  assert.equal(hp - target.hp, 210);
  assert.equal(target.statusEffects.find(effect => effect.name === "stasis").expiresAt, 4000);
  assert.equal(f.runtime.projectiles.length, 0);
  assert.equal("body" in projectile, false);
});

test("homing retains its live target, retargets after disappearance and includes Boss parts", () => {
  const target = enemy(8), other = enemy(4);
  const boss = createBossState("octahedron", 0, { x: x(3), y: y(3) });
  const projectile = createHomingTowerProjectileState({ x: x(3), y: y(3), lane: 3, speed: 200,
    acceleration: 300, maxSpeed: 500, damage: 100, damageType: "magic", targetEnemy: target, sourceTower: tower("x") });
  const f = fixture({ enemies: [other, target], boss, projectiles: [projectile] });
  updateTowerProjectiles(f.runtime, .1);
  assert.equal(projectile.targetEnemy, target);
  assert.equal(projectile.speed, 230);
  assert.equal(f.hits.length, 0);
  target.inPlay = false; other.highFlightUntil = 5000;
  projectile.x = boss.x; projectile.y = boss.y;
  updateTowerProjectiles(f.runtime, 0);
  assert.equal(projectile.targetEnemy, undefined);
  assert.equal(projectile.targetBossPart, boss);
  assert.deepEqual(f.hits.map(hit => [hit.target, hit.amount]), [[boss, 65]]);
});

test("fast swept hits still resolve before exits without a renderer", () => {
  const target = enemy(1), projectile = shot({ hitCount: 2 });
  const f = fixture({ enemies: [target], projectiles: [projectile] });
  f.runtime.projectileMotion.begin(f.runtime.projectiles);
  f.runtime.projectileMotion.record(target, x(12), target.y, target.x, target.y);
  let breached = false;
  f.runtime.projectileMotion.deferExit(target, () => { breached = true; });
  f.runtime.damageEnemy = () => { target.inPlay = false; };
  updateTowerProjectiles(f.runtime, 1 / 60);
  f.runtime.projectileMotion.finish();
  assert.equal(breached, false);
  assert.equal(f.runtime.projectiles.length, 0);
});

test("friendly splash hits ground units and the nearest Boss surface, never high flight", () => {
  const target = enemy(3), high = enemy(3); high.highFlightUntil = 9999;
  const boss = createBossState("octahedron", 0, { x: x(5), y: y(3) });
  const p = shot({ type: "shell", splashRadius: CELL_WIDTH * 4, damageType: "magic", hitCount: 2 });
  const f = fixture({ enemies: [target, high], boss, projectiles: [p] });
  updateTowerProjectiles(f.runtime, 0);
  assert.equal(f.hits.filter(hit => hit.target === target).length, 2);
  assert.equal(f.hits.filter(hit => hit.target === high).length, 0);
  assert.equal(f.hits.filter(hit => hit.target === boss).length, 2);
});

test("enemy ion splash resolves each covered cell once when a shell breaks", () => {
  const inner = tower("B"), shell = tower("()", 3, 3, 1);
  inner.parenthesisGuard = shell; shell.parenthesisInner = inner; shell.hp = 1;
  const p = { x: inner.x, y: inner.y, sourceLane: 3, vx: 0, damage: 4500, damageType: "magic",
    appearance: "ion", splashRadius: CELL_WIDTH * 2.4, hitCount: 1 };
  const f = fixture({ towers: [inner, shell], enemyProjectiles: [p] });
  f.runtime.occupied.set("3:3", inner);
  const hp = inner.hp;
  updateEnemyProjectiles(f.runtime, 0);
  assert.equal(inner.hp, hp);
  assert.equal(shell.inPlay, false);
  assert.deepEqual(f.hits.map(hit => hit.target), [shell]);
});

test("reflection factories preserve simultaneous hit budgets and pure source/target references", () => {
  for (const arcing of [false, true]) {
    const reflector = tower("R"), source = enemy();
    const p = arcing ? mortar({ targetTower: reflector, sourceEnemy: source, hitCount: 3, partialHitDamage: 125 }) :
      { x: reflector.x, y: reflector.y, sourceLane: 3, vx: -400, damage: 400, damageType: "physical", hitCount: 3, partialHitDamage: 125 };
    if (arcing) p.progress = 1;
    const f = fixture({ towers: [reflector], enemies: [source],
      enemyProjectiles: arcing ? [] : [p], mortarProjectiles: arcing ? [p] : [] });
    if (arcing) updateMortarProjectiles(f.runtime, 0); else updateEnemyProjectiles(f.runtime, 0);
    const reflected = arcing ? f.runtime.mortarProjectiles[0] : f.runtime.projectiles[0];
    assert.deepEqual(f.hits.map(hit => hit.amount), [125, 400, 400]);
    assert.equal(projectileDamageBudget(reflected), 925);
    assert.equal(reflected.sourceTower, reflector);
    assert.equal("body" in reflected, false);
    if (arcing) assert.equal(reflected.targetEnemy, source);
    else assert.equal(reflected.vx, 400);
  }
});

test("Orientation redirects live mortars and N shifts a locked landing once per projectile", () => {
  const target = tower("B", 4), orient = tower("o", 3);
  orient.skills.orientation = { sp: 0, spBuffer: 0, activeUntil: 5000 };
  const p = mortar({ targetTower: target });
  const f = fixture({ towers: [target, orient], mortarProjectiles: [p] });
  updateMortarProjectiles(f.runtime, .1);
  assert.equal(p.targetTower, orient);
  assert.equal(p.targetX, orient.x);
  const shift = tower("N", 5); f.runtime.towers = [shift];
  p.targetTower = shift; p.hitCount = 3;
  updateMortarProjectiles(f.runtime, .1);
  assert.equal(p.targetX, shift.x - getCardDefinition("N").shiftCells * CELL_WIDTH);
  assert.equal(f.hits.length, 3);
  updateMortarProjectiles(f.runtime, .1);
  assert.equal(f.hits.length, 3);
});

test("Gathering processes friendly and hostile shots, honors cooldown and cancels competing pulls", () => {
  const j = tower("j", 4), other = tower("j", 4, 1, 1);
  for (const t of [j, other]) t.skills.gathering = { sp: 0, spBuffer: 0, activeUntil: 5000 };
  const f = fixture({ towers: [j] });
  for (const p of [shot({ x: j.x, y: y(2), lane: 2 }),
    { x: j.x, y: y(2), sourceLane: 2, vx: -100, damage: 200, damageType: "magic" }]) {
    assert.equal(gatherProjectile(f.runtime, [j, other], p, p.x, p.y), false);
    assert.equal(f.hits.length, 0);
    assert.equal(gatherProjectile(f.runtime, [j], p, p.x, p.y), true);
    assert.equal(p.y, j.y);
    assert.equal("sourceLane" in p ? p.sourceLane : p.lane, j.lane);
    p.y = y(2);
    assert.equal(gatherProjectile(f.runtime, [j], p, p.x, p.y), false);
    assert.equal(f.hits.at(-1).amount, 100);
    f.hits.length = 0;
  }
});

test("mortar interception spends only the requested budget before the remaining independent hits", () => {
  const target = tower("B"), p = mortar({ hitCount: 3 });
  p.progress = 1;
  const f = fixture({ towers: [target], mortarProjectiles: [p] });
  f.runtime.interceptProjectile = projectile => {
    consumeProjectileDamage(projectile, 500);
    return projectileDamageBudget(projectile) <= 0;
  };
  updateMortarProjectiles(f.runtime, 0);
  assert.deepEqual(f.hits.map(hit => hit.amount), [300, 400]);
  assert.equal(f.runtime.mortarProjectiles.length, 0);
});

test("nested independent battle advancement cannot overwrite lane or mortar hit buffers", () => {
  const first = enemy(3), second = enemy(4), unrelated = enemy(11);
  const a = fixture({ enemies: [first, second], projectiles: [shot(), shot({ x: second.x })] });
  const b = fixture({ enemies: [unrelated], projectiles: [shot({ x: unrelated.x })] });
  const damage = a.runtime.damageEnemy;
  a.runtime.damageEnemy = (...args) => { damage(...args); updateTowerProjectiles(b.runtime, 0); };
  updateTowerProjectiles(a.runtime, 0);
  assert.deepEqual(a.hits.map(hit => hit.target), [first, second]);
  assert.deepEqual(b.hits.map(hit => hit.target), [unrelated]);
  const t1 = tower("B", 3), t2 = tower("B", 4), t3 = tower("B", 8);
  const m1 = mortar(), m2 = mortar({ targetX: t3.x }); m1.progress = m2.progress = 1;
  const c = fixture({ towers: [t1, t2], mortarProjectiles: [m1] });
  const d = fixture({ towers: [t3], mortarProjectiles: [m2] });
  const damageTower = c.runtime.damageTower;
  c.runtime.damageTower = (...args) => { damageTower(...args); updateMortarProjectiles(d.runtime, 0); };
  updateMortarProjectiles(c.runtime, 0);
  assert.deepEqual(c.hits.map(hit => hit.target), [t1, t2]);
  assert.deepEqual(d.hits.map(hit => hit.target), [t3]);
});

test("bodyless checkpoint continuation and presentation observation produce identical data", () => {
  const source = tower("A"), target = enemy(8);
  const original = fixture({ towers: [source], enemies: [target], projectiles: [
    shot({ speed: 200, sourceTower: source }),
    createHomingTowerProjectileState({ x: x(3), y: y(3), lane: 3, speed: 150,
      acceleration: 80, maxSpeed: 400, damage: 100, damageType: "magic", targetEnemy: target, sourceTower: source })
  ], mortarProjectiles: [mortar({ owner: "tower", targetEnemy: target, targetX: target.x, sourceTower: source })] });
  for (let i = 0; i < 10; i++) { updateTowerProjectiles(original.runtime, .01); updateMortarProjectiles(original.runtime, .01); }
  const graph = JSON.parse(JSON.stringify(original.snapshot()));
  const restored = fixture(decodeSaveGraph(graph, () => ({}))), observations = [];
  assert.equal(restored.runtime.projectiles[1].targetEnemy, restored.runtime.enemies[0]);
  assert.equal(restored.runtime.projectiles[0].sourceTower, restored.runtime.towers[0]);
  restored.runtime.presentation = Object.fromEntries(Object.keys(NO_PROJECTILE_PRESENTATION).map(key => [key, () => observations.push(key)]));
  for (let i = 0; i < 300; i++) {
    for (const f of [original, restored]) { updateTowerProjectiles(f.runtime, .01); updateMortarProjectiles(f.runtime, .01); }
  }
  assert.ok(observations.includes("mortarPosition") && observations.includes("hit"));
  assert.deepEqual(restored.snapshot(), original.snapshot());
});
