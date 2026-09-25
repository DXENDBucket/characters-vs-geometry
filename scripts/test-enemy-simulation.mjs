import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// Exercise the actual movement, attacks, projectiles and damage path without engine stubs.
const load = createTypeScriptLoader();
const { advanceEnemies, executeEnemyAttack } = load("src/game/enemySimulation.ts");
const { updateEnemySkills } = load("src/game/enemySkillExecution.ts");
const { advanceSlopeTriangle, advanceHighFlyingEnemy } = load("src/game/slopeRules.ts");
const { NO_ENEMY_SIMULATION_PRESENTATION: silent } = load("src/game/enemySimulationPresentation.ts");
const { NO_UNIT_LIFECYCLE_PRESENTATION } = load("src/game/unitLifecyclePresentation.ts");
const { NO_PROJECTILE_PRESENTATION } = load("src/game/projectilePresentation.ts");
const life = load("src/game/unitLifecycle.ts");
const shots = load("src/game/projectileRuntime.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { createEnemyState } = load("src/game/enemyState.ts");
const { createBossState } = load("src/game/bossState.ts");
const { createTowerProjectileState, createMortarProjectileState } = load("src/game/projectileState.ts");
const { ProjectileMotionFrame } = load("src/game/projectileMotion.ts");
const { enemyVolleyShotCount } = load("src/game/enemyCombatRules.ts");
const { enemyAttackDamage } = load("src/game/combatStats.ts");
const { enemyMaximumHp } = load("src/game/enemyContainerRules.ts");
const { syncTowerOccupancy } = load("src/game/towerOccupancy.ts");
const { initializeEnemyHealthLinks } = load("src/game/enemyHealth.ts");
const { addEnemyToField } = load("src/game/enemyRoster.ts");
const { applyStatusEffect } = load("src/game/statusEffects.ts");
const { depleteSolarBomb } = load("src/game/solarBombRules.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
const x = column => BOARD_X + (column + .5) * CELL_WIDTH;
const y = lane => BOARD_Y + (lane + .5) * CELL_HEIGHT;
const tower = (type = "B", column = 3, lane = 3) =>
  createTowerState(getCardDefinition(type), lane, column, 0, lane * 100 + column);
const enemy = (kind = "triangle", column = 7, lane = 3) => createEnemyState({
  kind, lane, x: x(column), waveNumber: 1, waveWeight: 10, time: 0, finalDamageReduction: 0
}, () => .5);

function fixture(saved = {}) {
  const data = { towers: [], enemies: [], boss: null, projectiles: [], enemyProjectiles: [], mortarProjectiles: [],
    pending: [], battleTime: 0, ...saved };
  const events = [], occupied = new Map(), motion = new ProjectileMotionFrame();
  syncTowerOccupancy(data.towers, occupied);
  const lifecycle = { ...data, occupied, finalDamageReduction: 0, bossPhaseIndex: 0,
    get battleTime() { return data.battleTime; },
    getBoss: () => data.boss, setBoss: boss => { data.boss = boss; },
    getWaveTracker: () => undefined, onEnemyDefeated() {}, onTowerDamaged() {}, endLevel: () => events.push("end"),
    presentation: NO_UNIT_LIFECYCLE_PRESENTATION,
    spawnEnemy(options) {
      const unit = createEnemyState(options, () => .5);
      addEnemyToField(data.enemies, unit); initializeEnemyHealthLinks(unit, data.enemies);
    }
  };
  const damage = {
    damageTower: (target, amount, type) => life.damageTower(lifecycle, target, amount, type),
    damageEnemy: (target, amount, type, source) => life.damageEnemy(lifecycle, target, amount, type, source),
    damageBoss: (amount, type, part) => life.damageBoss(lifecycle, amount, type, part)
  };
  const runtime = { ...data, ...damage, occupied, projectileMotion: motion, presentation: silent,
    get battleTime() { return data.battleTime; },
    get boss() { return data.boss; },
    scheduleBattleAction: (delay, action) => data.pending.push({ due: data.battleTime + delay, action }),
    createProjectile: state => state, createMortar: createMortarProjectileState,
    triggerTrapTower: t => events.push(["trap", t.id]),
    triggerShockTower: t => events.push(["shock", t.id]),
    onEnemyReachedBase: e => { events.push(["base", e.kind]); return false; }
  };
  const projectiles = { ...runtime, presentation: NO_PROJECTILE_PRESENTATION,
    get battleTime() { return data.battleTime; }, getBoss: () => data.boss,
    createProjectile: createTowerProjectileState };
  const tick = (seconds = 1 / 60) => {
    data.battleTime += seconds * 1000;
    motion.begin(data.projectiles);
    advanceEnemies(runtime, data.battleTime, seconds);
    const due = data.pending.filter(item => item.due <= data.battleTime).sort((a, b) => a.due - b.due);
    data.pending = data.pending.filter(item => item.due > data.battleTime);
    for (const item of due) executeEnemyAttack(runtime, item.action);
    shots.updateTowerProjectiles(projectiles, seconds);
    shots.updateEnemyProjectiles(projectiles, seconds);
    shots.updateMortarProjectiles(projectiles, seconds);
    motion.finish();
  };
  return { data, runtime, lifecycle, projectiles, motion, events, tick,
    snapshot: () => captureBattleSnapshot(data) };
}

test("actual high-rank advancement stops at the first crossed tower", () => {
  for (const direction of [-1, 1]) {
    const t = tower(), e = enemy("triangle10000", direction === -1 ? 10 : 0);
    e.movementDirection = direction; e.attackAt = Infinity;
    const f = fixture({ towers: [t], enemies: [e] });
    f.tick();
    assert.equal(e.x, t.x - direction * 38);
    assert.equal(e.inPlay, true);
    assert.equal(f.events.length, 0);
    assert.equal("body" in e, false);
  }
});

test("a fast enemy crossing a projectile is hit before its deferred base exit", () => {
  const e = enemy("triangle10000", 10), f = fixture({ enemies: [e] });
  f.data.projectiles.push(createTowerProjectileState({ type: "bolt", lane: 3, x: x(5), y: y(3),
    speed: 0, damage: 1e9, damageType: "true", hitCount: 1, splashRadius: 0, angleDegrees: 0, maxX: Infinity }));
  f.tick();
  assert.equal(e.inPlay, false);
  assert.deepEqual(f.events, []);
  assert.equal(f.data.projectiles.length, 0);
});

test("shot volleys retain per-hit damage and at most five firing times", () => {
  const e = enemy("shootingTriangle8"), f = fixture({ enemies: [e] }); e.attackAt = 0;
  advanceEnemies(f.runtime, 0, 0);
  assert.equal(f.data.pending.length, 5);
  assert.equal(f.data.pending.reduce((sum, p) => sum + p.action.hitCount, 0), enemyVolleyShotCount(e));
  for (const p of f.data.pending) executeEnemyAttack(f.runtime, p.action);
  assert.equal(f.data.enemyProjectiles.length, 5);
  assert.ok(f.data.enemyProjectiles.every(p => p.damage === enemyAttackDamage(e, 0) && !("body" in p)));
  e.inPlay = false;
  executeEnemyAttack(f.runtime, f.data.pending[0].action);
  assert.equal(f.data.enemyProjectiles.length, 5);
});

test("lasers preserve armor thresholds, stop at resistance and isolate nested worlds", () => {
  const a = tower("A", 6), b = tower("A", 5), stop = tower("O", 4), behind = tower("A", 3);
  const e = enemy("shootingPentagon", 9), f = fixture({ enemies: [e], towers: [a, b, stop, behind] });
  const otherTarget = tower("B", 6), otherEnemy = enemy("shootingPentagon", 9);
  const other = fixture({ enemies: [otherEnemy], towers: [otherTarget] });
  const hp = [a.hp, b.hp, stop.hp, behind.hp], hit = f.runtime.damageTower;
  let nested = false;
  f.runtime.damageTower = (...args) => {
    if (!nested) { nested = true; executeEnemyAttack(other.runtime, { type: "enemyLaser", enemy: otherEnemy, time: 0, hitCount: 1 }); }
    hit(...args);
  };
  executeEnemyAttack(f.runtime, { type: "enemyLaser", enemy: e, time: 0, hitCount: 2 });
  assert.equal(a.hp, hp[0] - enemyAttackDamage(e, 0) * 2);
  assert.equal(b.hp, hp[1] - enemyAttackDamage(e, 0) * 2);
  assert.ok(stop.hp < hp[2]); assert.equal(behind.hp, hp[3]);
  assert.ok(otherTarget.hp < otherTarget.maxHp);
});

test("mortar execution retargets the latest placement and a blocker overrides it", () => {
  const a = tower("B", 1), b = tower("B", 3), e = enemy("pentagon", 8);
  a.level = 99;
  const f = fixture({ towers: [a, b], enemies: [e] });
  executeEnemyAttack(f.runtime, { type: "enemyMortar", enemy: e, time: 0, hitCount: 3 });
  assert.equal(f.data.mortarProjectiles[0].targetTower, b);
  assert.equal(f.data.mortarProjectiles[0].hitCount, 3);
  e.x = a.x + 38;
  executeEnemyAttack(f.runtime, { type: "enemyMortar", enemy: e, time: 0, hitCount: 1 });
  assert.equal(f.data.mortarProjectiles[1].targetTower, a);
  assert.equal("body" in f.data.mortarProjectiles[0], false);
});

test("frozen enemies pause movement, melee and skill recovery", () => {
  const t = tower(), e = enemy("dollar", 3), f = fixture({ towers: [t], enemies: [e] });
  e.x = t.x + 38; e.attackAt = 0; applyStatusEffect(e, "frozen", 1000, 0);
  const start = e.x, hp = t.hp;
  f.tick(.5);
  assert.equal(e.x, start); assert.equal(t.hp, hp); assert.equal(e.skills.incitement.sp, 20);
  f.tick(.5);
  assert.ok(t.hp < hp); assert.equal(e.skills.incitement.sp, 20);
});

test("blocked trigger towers dispatch once instead of taking a normal melee hit", () => {
  for (const type of ["G", "i"]) {
    const t = tower(type), e = enemy(), f = fixture({ towers: [t], enemies: [e], battleTime: 20000 });
    e.x = t.x + 38; e.attackAt = 0;
    f.tick(0);
    assert.deepEqual(f.events, [[type === "G" ? "trap" : "shock", t.id]]);
    assert.equal(t.hp, t.maxHp);
  }
});

test("slope checks velocity, launches a data trajectory and lands without display", () => {
  const slope = enemy("slopeTriangle", 5), cargo = enemy("hexMace", 5), t = tower("B", 4);
  slope.slopeFacingDirection = -1; cargo.maceFacingDirection = -1; cargo.maceVelocity = 30;
  const f = fixture({ enemies: [slope, cargo], towers: [t] });
  advanceSlopeTriangle(f.runtime, slope, t, 0);
  assert.equal(cargo.highFlightUntil, undefined);
  cargo.maceVelocity = -30;
  const start = cargo.x;
  advanceSlopeTriangle(f.runtime, slope, t, 1);
  assert.ok(cargo.highFlightUntil > 1);
  assert.equal(cargo.highFlightTargetX, start - 4.5 * CELL_WIDTH);
  const end = cargo.highFlightUntil;
  advanceHighFlyingEnemy(cargo, (end + 1) / 2, silent);
  assert.ok(cargo.y < y(3));
  advanceHighFlyingEnemy(cargo, end, silent);
  assert.equal(cargo.x, start - 4.5 * CELL_WIDTH); assert.equal(cargo.y, y(3));
  assert.equal(cargo.highFlightUntil, undefined);
});

test("parentheses transfer health and passenger flight skills while moving seats", () => {
  const carrier = enemy("parentheses", 7), passenger = enemy("angelPentagon", 7);
  passenger.skills.wings = { sp: 15, spBuffer: 0, activeUntil: 0 };
  const max = enemyMaximumHp(carrier), f = fixture({ enemies: [carrier, passenger] });
  f.tick(.1);
  assert.equal(carrier.parenthesisCargo[0], passenger);
  assert.equal(passenger.parenthesisCarrier, carrier); assert.equal(passenger.inPlay, false);
  assert.equal(f.data.enemies.length, 1);
  assert.equal(enemyMaximumHp(carrier), max + enemyMaximumHp(passenger) * .35);
  assert.ok(carrier.statusEffects.some(s => s.name === "flying"));
  assert.ok(passenger.x !== x(7));
  life.damageEnemy(f.lifecycle, carrier, 1e9, "true");
  assert.equal(passenger.inPlay, true); assert.equal(passenger.parenthesisCarrier, undefined);
});

test("burrow loading respects leader and container exclusions and releases on emergence", () => {
  const carrier = enemy("burrowArrow", 7), cargo = enemy("triangle", 7);
  const leader = enemy("heart", 7), container = enemy("parentheses", 7);
  applyStatusEffect(container, "frozen", 10000, 0);
  const f = fixture({ enemies: [carrier, cargo, leader, container] });
  carrier.burrowAt = 0;
  f.tick(0);
  assert.deepEqual(carrier.burrowCargo, [cargo]);
  assert.equal(carrier.burrowed, true); assert.ok(f.data.enemies.includes(leader) && f.data.enemies.includes(container));
  carrier.x = BOARD_X + CELL_WIDTH / 2;
  f.tick(.01);
  assert.equal(carrier.burrowUnloaded, true); assert.equal(carrier.movementDirection, 1);
  assert.equal(cargo.inPlay, true); assert.equal(cargo.movementDirection, 1);
});

test("heart plans cannot be overwritten by another world during presentation", () => {
  const caster = enemy("heart", 2, 2), a = enemy("circle", 2, 3), b = enemy("tilde", 3, 3);
  b.y = y(3); b.oscillationCenterY = b.y; b.oscillationLastY = b.y;
  const remoteCaster = enemy("heart", 2, 4), remoteTarget = enemy("circle", 2, 5);
  for (const e of [caster, remoteCaster]) e.skills.lead = { sp: 5, spBuffer: 0, activeUntil: 0 };
  const f = fixture({ enemies: [caster, a, b] }), remote = fixture({ enemies: [remoteCaster, remoteTarget] });
  let nested = false;
  f.runtime.presentation = { ...silent, position() {
    if (!nested) { nested = true; updateEnemySkills(remote.runtime, 0, 0); }
  } };
  updateEnemySkills(f.runtime, 0, 0);
  assert.equal(a.lane, 2); assert.equal(b.lane, 2); assert.equal(b.oscillationCenterY, caster.y);
  assert.equal(remoteTarget.lane, 4); assert.equal(caster.skills.lead.sp, 0);
});

test("ion charge creates a normal data projectile and half health switches to assault", () => {
  const e = enemy("chevronLeader"), f = fixture({ enemies: [e] });
  advanceEnemies(f.runtime, 0, 12);
  assert.equal(f.data.enemyProjectiles.length, 1);
  assert.equal(f.data.enemyProjectiles[0].appearance, "ion"); assert.equal(e.ionChargeMs, 0);
  life.damageEnemy(f.lifecycle, e, e.maxHp / 2, "true");
  assert.equal(e.chevronAssault, true);
  const previous = e.maceVelocity;
  advanceEnemies(f.runtime, 1, .1);
  assert.notEqual(e.maceVelocity, previous);
});

test("depleted solar bombs break a Boss shield, burst both sides and disappear", () => {
  const boss = createBossState("octahedron", 0), bomb = enemy("solarBomb", 7);
  boss.x = x(7); boss.y = y(3); boss.invincibleUntil = Infinity;
  bomb.x = boss.x; bomb.y = boss.y; depleteSolarBomb(bomb);
  const target = enemy("circle", 8), t = tower("B", 5), hp = t.hp;
  const f = fixture({ boss, enemies: [bomb, target], towers: [t], battleTime: 1000 });
  advanceEnemies(f.runtime, 1000, 0);
  assert.equal(boss.invincibleUntil, 0); assert.equal(bomb.inPlay, false);
  assert.equal(target.hp, 100); assert.equal(t.hp, hp - 2900);
});

test("real movement, scheduled fire, impacts and snapshot continuation match without visuals", () => {
  const f = fixture({ enemies: [enemy("shootingTriangle3", 8, 1), enemy("pentagon2", 8, 5)],
    towers: [tower("B", 2, 1), tower("O", 3, 5)] });
  for (const e of f.data.enemies) e.attackAt = 0;
  f.tick();
  assert.ok(f.data.pending.length > 0 && f.data.enemyProjectiles.length > 0 && f.data.mortarProjectiles.length > 0);
  const saved = f.snapshot(), restored = fixture(decodeSaveGraph(saved, () => ({})));
  let observed = 0;
  restored.runtime.presentation = Object.fromEntries(Object.keys(silent).map(k => [k, () => { observed++; }]));
  for (let i = 0; i < 600; i++) { f.tick(); restored.tick(); }
  assert.deepEqual(f.snapshot(), restored.snapshot());
  assert.deepEqual(f.events, restored.events);
  assert.ok(observed > 0);
  assert.ok(f.data.towers.length < 2 || f.data.towers.some(t => t.hp < t.maxHp));
});
