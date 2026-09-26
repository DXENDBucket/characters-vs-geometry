import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// Load the same damage/removal rules used by GameScene, without engine or module stubs.
const load = createTypeScriptLoader();
const life = load("src/game/unitLifecycle.ts");
const health = load("src/game/towerHealthRules.ts");
const enemyHealth = load("src/game/enemyHealth.ts");
const stats = load("src/game/unitStatRules.ts");
const auras = load("src/game/towerAuras.ts");
const { NO_UNIT_LIFECYCLE_PRESENTATION: silent } = load("src/game/unitLifecyclePresentation.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { createEnemyState } = load("src/game/enemyState.ts");
const { createBossState } = load("src/game/bossState.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { enemyFamily, enemyRank } = load("src/registry/enemies.ts");
const { syncTowerOccupancy } = load("src/game/towerOccupancy.ts");
const { syncTowerTopology } = load("src/game/towerTopology.ts");
const { applyStatusEffect, hasStatusEffect } = load("src/game/statusEffects.ts");
const { addEnemyToField } = load("src/game/enemyRoster.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const { updateTowerProjectiles } = load("src/game/projectileRuntime.ts");
const { createTowerProjectileState, createMortarProjectileState } = load("src/game/projectileState.ts");
const { NO_PROJECTILE_PRESENTATION } = load("src/game/projectilePresentation.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
const x = col => BOARD_X + (col + .5) * CELL_WIDTH;
const y = lane => BOARD_Y + (lane + .5) * CELL_HEIGHT;
const tower = (type = "B", column = 3, lane = 3) =>
  createTowerState(getCardDefinition(type), lane, column, 0, lane * 100 + column);
const enemy = (kind = "triangle", column = 7, lane = 3) => createEnemyState({
  kind, lane, x: x(column), waveNumber: 1, waveWeight: 10, time: 0, finalDamageReduction: 0
}, () => .5);

function fixture(state = {}) {
  const events = [];
  const runtime = {
    towers: [], enemies: [], boss: null, projectiles: [], enemyProjectiles: [], mortarProjectiles: [],
    occupied: new Map(), battleTime: 1000, bossPhaseIndex: 0, finalDamageReduction: 0,
    tracker: { number: 1, defeatedWeight: 0 }, environmentHpMultiplier: 1,
    presentation: silent, ...state
  };
  Object.assign(runtime, {
    getBoss: () => runtime.boss, setBoss: boss => { runtime.boss = boss; },
    getWaveTracker: () => runtime.tracker,
    onEnemyDefeated: () => events.push("enemy"),
    onTowerDamaged: t => events.push(["damage", t.id]),
    onTowerRemoved: t => events.push(["removed", t.id]),
    endLevel: () => events.push("end"),
    spawnEnemy: options => {
      const unit = createEnemyState({ ...options, environmentHpMultiplier: runtime.environmentHpMultiplier }, () => .5);
      addEnemyToField(runtime.enemies, unit);
      enemyHealth.initializeEnemyHealthLinks(unit, runtime.enemies);
      events.push(["spawn", unit.kind]);
    }
  });
  syncTowerTopology(runtime.towers);
  syncTowerOccupancy(runtime.towers, runtime.occupied);
  return { runtime, events, snapshot: () => captureBattleSnapshot({
    towers: runtime.towers, enemies: runtime.enemies, boss: runtime.boss, projectiles: runtime.projectiles,
    enemyProjectiles: runtime.enemyProjectiles, mortarProjectiles: runtime.mortarProjectiles, battleTime: runtime.battleTime
  }) };
}

test("damage uses shell defenses without overflow, and true damage bypasses absorption", () => {
  const inner = tower(), guard = tower("()"), f = fixture({ towers: [inner, guard] });
  const hp = inner.hp, guardHp = guard.hp, calls = [];
  f.runtime.absorbTowerDamage = (t, amount, type) => { calls.push([t, amount, type]); return amount / 2; };
  life.damageTower(f.runtime, inner, 1000, "physical");
  assert.equal(calls[0][0], guard);
  assert.equal(calls[0][1], 700);
  assert.equal(guard.hp, guardHp - 350);
  life.damageTower(f.runtime, inner, 1e8, "true");
  assert.equal(calls.length, 1);
  assert.equal(inner.hp, hp);
  assert.equal(guard.inPlay, false);
  assert.equal(inner.parenthesisGuard, undefined);
  life.damageTower(f.runtime, inner, 100, "true");
  assert.equal(inner.hp, hp - 100);
  assert.equal("body" in inner, false);
});

test("shared pool lethal damage snapshots all members before removal callbacks mutate the graph", () => {
  const u = tower("u"), b = tower("B", 4), f = fixture({ towers: [u, b] });
  health.syncTowerHealthNetworks(f.runtime.towers);
  assert.equal(u.healthPool, b.healthPool);
  f.runtime.onTowerDamaged = () => {
    f.events.push("damaged");
    life.removeTower(f.runtime, u);
  };
  life.damageTower(f.runtime, b, 1e8, "true");
  assert.deepEqual(f.events, ["damaged", ["removed", u.id], ["removed", b.id]]);
  assert.equal(f.runtime.towers.length, 0);
  assert.equal(f.runtime.occupied.size, 0);
});

test("network merge and split preserve weighted ratios and count u towers rather than levels", () => {
  const a = tower("u", 1), b = tower("u", 5), bridge = tower("B", 2);
  const f = fixture({ towers: [a, bridge, b] });
  health.syncTowerHealthNetworks(f.runtime.towers);
  health.changeTowerHealth(a, -a.healthPool.maxHp / 2);
  health.changeTowerHealth(b, -b.healthPool.maxHp / 4);
  const oldA = a.healthPool, oldB = b.healthPool;
  const fraction = (oldA.hp + oldB.hp) / (oldA.maxHp + oldB.maxHp);
  b.column = 3;
  health.syncTowerHealthNetworks(f.runtime.towers);
  assert.equal(a.healthPool, b.healthPool);
  assert.equal(a.healthPool.linkCount, 2);
  assert.equal(a.healthPool.maxHp, (a.maxHp + b.maxHp + bridge.maxHp) / 2);
  assert.equal(a.healthPool.hp / a.healthPool.maxHp, fraction);
  b.column = 6;
  health.syncTowerHealthNetworks(f.runtime.towers);
  assert.notEqual(a.healthPool, b.healthPool);
  assert.equal(a.healthPool.hp / a.healthPool.maxHp, fraction);
  assert.equal(b.healthPool.hp / b.healthPool.maxHp, fraction);
});

test("removing Unyielding resolves negative-health cascades, including reentry from another battlefield", () => {
  const g = tower("g", 2), b = tower("B", 3);
  const first = fixture({ towers: [g, b] }), secondG = tower("g"), second = fixture({ towers: [secondG] });
  auras.syncUnyieldingAuras(first.runtime.towers);
  life.damageTower(first.runtime, b, b.hp + 100, "true");
  assert.equal(b.hp, -100);
  assert.equal(b.inPlay, true);
  secondG.hp = -1;
  first.runtime.onTowerRemoved = t => {
    first.events.push(t.type);
    life.settleTowerHealth(second.runtime);
  };
  life.removeTower(first.runtime, g);
  assert.deepEqual(first.events.filter(e => typeof e === "string"), ["g", "B"]);
  assert.equal(b.inPlay, false);
  assert.equal(secondG.inPlay, true);
  assert.equal(secondG.unyieldingRatio, .15);
});

test("Zeal source buffers cannot be overwritten by advancing another world", () => {
  const a = [tower("e"), tower("B", 4)], b = [tower("B", 4)];
  const first = auras.towerAuraSources(a), second = auras.towerAuraSources(b);
  assert.notEqual(first, second);
  assert.equal(auras.towerHasZeal(a, a[1], first), true);
  assert.equal(auras.towerHasZeal(b, b[0], second), false);
  a[0].inPlay = false;
  assert.equal(auras.towerAuraSources(a), first);
  assert.equal(auras.towerHasZeal(a, a[1], first), false);
});

test("pure max-health upgrades preserve shared health and negative floors", () => {
  const u = tower("u"), b = tower(), f = fixture({ towers: [u, b] });
  health.syncTowerHealthNetworks(f.runtime.towers);
  const max = u.healthPool.maxHp;
  health.changeTowerHealth(u, -100);
  u.level = 2;
  stats.syncTowerFinalStats(u, { healMaxHpIncrease: true });
  assert.equal(u.healthPool.maxHp, max + u.baseStats.maxHp * .8);
  assert.equal(u.healthPool.hp, u.healthPool.maxHp - 100);
  b.hp = -100;
  b.healthPool = undefined;
  health.changeTowerHealth(b, -10);
  assert.equal(b.hp, -100, "Losing an allowance must not heal negative health");
});

test("equals shared death counts each member once and performs normal split spawns", () => {
  const owner = enemy("equals"), ram = enemy("triangleRam3"), f = fixture({ enemies: [owner, ram] });
  enemyHealth.initializeEnemyHealthLinks(owner, f.runtime.enemies);
  assert.equal(owner.healthPool, ram.healthPool);
  life.damageEnemy(f.runtime, ram, 1e8, "true");
  assert.equal(f.events.filter(e => e === "enemy").length, 2);
  assert.equal(f.runtime.tracker.defeatedWeight, 20);
  assert.equal(owner.inPlay, false);
  assert.equal(ram.inPlay, false);
  assert.deepEqual(f.runtime.enemies.map(e => e.kind), ["triangle3", "triangle3"]);
  assert.ok(f.runtime.enemies.every(e => e.weight === 0 && !("body" in e)));
});

test("ram and mace deaths retain rank, facing, spawn order and environment health multiplier", () => {
  for (const [kind, expected] of [
    ["angelPentagonRam3", ["angelPentagon", "pentagon"]],
    ["hexMace3", ["chargingHexagon", "hexagon"]]
  ]) {
    const unit = enemy(kind), f = fixture({ enemies: [unit], environmentHpMultiplier: 1.7 });
    unit.movementDirection = 1;
    if (unit.maceFacingDirection !== undefined) unit.maceFacingDirection = 1;
    life.damageEnemy(f.runtime, unit, 1e8, "true");
    assert.deepEqual(f.runtime.enemies.map(e => enemyFamily(e.kind)), expected);
    assert.ok(f.runtime.enemies.every(e => enemyRank(e.kind) === 3 && e.movementDirection === 1));
    assert.deepEqual(f.runtime.enemies.map(e => e.x), [unit.x + 18, unit.x - 18]);
    assert.ok(f.runtime.enemies.every(e => e.maxHp === e.baseStats.maxHp * 1.7));
  }
});

test("parentheses release passengers at logical seats with flight, while administrative removal destroys contents", () => {
  const host = enemy("parentheses"), a = enemy(), b = enemy("triangle2");
  host.parenthesisCargo = [a, b];
  for (const p of [a, b]) { p.inPlay = false; p.parenthesisCarrier = host; }
  applyStatusEffect(host, "flying", 6000, 0, 1.5, true);
  const f = fixture({ enemies: [host] });
  life.damageEnemy(f.runtime, host, 1e8, "true");
  assert.deepEqual(f.runtime.enemies, [a, b]);
  assert.ok(a.x > b.x, "The first boarded passenger remains at the rear");
  for (const p of [a, b]) {
    assert.equal(p.parenthesisCarrier, undefined);
    assert.equal(p.lane, host.lane);
    assert.equal(p.y, host.y);
    assert.equal(p.statusEffects.find(e => e.name === "flying").expiresAt, 6000);
  }
  const carrier = enemy("burrowArrow"), nested = enemy("triangleRam"), child = enemy();
  carrier.burrowCargo = [nested]; nested.parenthesisCargo = [child];
  const other = fixture({ enemies: [carrier] }), removed = [];
  other.runtime.presentation = { ...silent, removeEnemy: (e, animate) => removed.push([e, animate]) };
  life.removeEnemy(other.runtime, carrier, false);
  assert.deepEqual(removed, [[child, false], [nested, false], [carrier, false]]);
  assert.equal(other.events.length, 0, "Administrative removal must not award kills or spawn splits");
});

test("burrow death returns stored units without new initialization or loss of status", () => {
  const carrier = enemy("burrowArrow"), a = enemy(), b = enemy("equals");
  carrier.burrowCargo = [a, b];
  for (const p of [a, b]) { p.inPlay = false; p.blockedByTowerId = "old"; p.blockedSince = 1; }
  b.healthLinksInitialized = true;
  applyStatusEffect(a, "power", 5000, 0, 1.3);
  const f = fixture({ enemies: [carrier] });
  life.damageEnemy(f.runtime, carrier, 1e8, "true");
  assert.deepEqual(f.runtime.enemies, [a, b]);
  assert.deepEqual(f.runtime.enemies.map(e => e.x), [carrier.x + 22, carrier.x + 32]);
  assert.equal(a.blockedByTowerId, undefined);
  assert.equal(a.statusEffects[0].expiresAt, 5000);
  assert.equal(b.healthPool, undefined);
  assert.equal(b.healthLinksInitialized, true);
});

test("frozen physical accumulation uses mitigated damage; high flight and invincibility reject hits", () => {
  const unit = enemy("square"), f = fixture({ enemies: [unit] });
  applyStatusEffect(unit, "frozen", 15000, 0);
  const half = unit.maxHp / 2, each = half / 2;
  life.damageEnemy(f.runtime, unit, each + unit.armor, "physical");
  assert.equal(hasStatusEffect(unit, "frozen", 1000), true);
  life.damageEnemy(f.runtime, unit, each + unit.armor, "physical");
  assert.equal(hasStatusEffect(unit, "frozen", 1000), false);
  const hp = unit.hp;
  applyStatusEffect(unit, "invincible", 5000, 0);
  assert.equal(life.damageEnemy(f.runtime, unit, 500, "true"), false);
  unit.statusEffects = []; unit.highFlightUntil = 9999;
  assert.equal(life.damageEnemy(f.runtime, unit, 500, "true"), false);
  assert.equal(unit.hp, hp);
});

test("chevron phase and solar-bomb resistance/depletion work without shapes or display bodies", () => {
  const chevron = enemy("chevronLeader"), f = fixture({ enemies: [chevron] });
  life.damageEnemy(f.runtime, chevron, chevron.maxHp / 2, "true");
  assert.equal(chevron.chevronAssault, true);
  assert.equal(chevron.baseStats.armor, 260);
  const bomb = enemy("solarBomb"), source = tower("A", 1), g = fixture({ enemies: [bomb] });
  const hp = bomb.hp, startX = bomb.x;
  life.damageEnemy(g.runtime, bomb, 1000, "magic", source);
  assert.equal(bomb.hp, hp - 50);
  assert.ok(bomb.x > startX);
  life.damageEnemy(g.runtime, bomb, 1e8, "true");
  assert.equal(bomb.hp, 1);
  assert.equal(bomb.solarBombDepleted, true);
  const depletedX = bomb.x;
  assert.equal(life.damageEnemy(g.runtime, bomb, 1e8, "true", source), false);
  assert.ok(bomb.x > depletedX, "Depleted bombs still bounce before immunity rejects damage");
  assert.equal(g.events.length, 0);
});

test("Boss copies share HP but keep invulnerability independent and reject stale targets", () => {
  const boss = createBossState("octahedron", 0), copy = createBossState("octahedron", 0);
  boss.octahedronCopies = [copy]; copy.invincibleUntil = 9999;
  const f = fixture({ boss }), hp = boss.hp;
  assert.equal(life.damageBoss(f.runtime, 1000, "true", copy), false);
  assert.equal(life.damageBoss(f.runtime, 1000, "true"), true);
  assert.equal(boss.hp, hp - 800);
  assert.equal(copy.hp, boss.hp);
  assert.equal(copy.invincibleUntil, 9999);
  assert.equal(life.damageBoss(f.runtime, 1000, "true", createBossState("octahedron", 0)), false);
});

test("tetrahedron and icosahedron lethal locks preserve phase callbacks and prevent duplicate terminal removal", () => {
  for (const [kind, phase] of [["tetrahedron2", 0], ["icosahedron", 1], ["icosahedron", 3]]) {
    const boss = createBossState(kind, 0), f = fixture({ boss, bossPhaseIndex: phase });
    if (phase === 3) boss.octahedronCopies = [createBossState(kind, 0)];
    life.damageBoss(f.runtime, 1e10, "true");
    assert.equal(boss.hp, 1);
    assert.equal(boss.pendingCriticalSummon, true);
    assert.equal(boss.criticalHpTriggered, true);
    assert.ok(boss.invincibleUntil > f.runtime.battleTime);
    if (phase === 3) assert.equal(boss.octahedronCopies[0].invincibleUntil, 16000);
    assert.equal(life.damageBoss(f.runtime, 1e10, "true"), false);
    f.runtime.battleTime = 1e6;
    f.runtime.onBossDefeated = unit => { f.events.push(["phase", unit.hp]); return true; };
    life.damageBoss(f.runtime, 1e10, "true");
    assert.deepEqual(f.events, [["phase", 0]]);
    assert.equal(f.runtime.boss, boss);
    assert.equal(life.damageBoss(f.runtime, 1e10, "true"), false);
    assert.deepEqual(f.events, [["phase", 0]], "A dead phase cannot trigger defeat callbacks twice");
    // The encounter restores HP when advancing to the next phase.
    boss.hp = boss.maxHp;
    f.runtime.onBossDefeated = () => false;
    life.damageBoss(f.runtime, 1e10, "true");
    assert.equal(f.runtime.boss, null);
    assert.equal(life.damageBoss(f.runtime, 1, "true"), false);
    assert.equal(f.events.filter(e => e === "end").length, 1);
  }
});

test("DEL thresholds immediately shield and expire facing state even without warning presentation", () => {
  const boss = createBossState("del", 0), f = fixture({ boss });
  applyStatusEffect(boss, "reversed", 500, 0);
  life.damageBoss(f.runtime, boss.maxHp * .25, "true");
  assert.equal(boss.delSweep.phase, "warning");
  assert.equal(boss.invincibleUntil, Infinity);
  assert.equal(hasStatusEffect(boss, "reversed", 1000), false);
  assert.equal(life.damageBoss(f.runtime, 1000, "true"), false);
  boss.delSweep.phase = "complete"; boss.invincibleUntil = 0;
  life.damageBoss(f.runtime, boss.maxHp * .25, "true");
  assert.equal(boss.delLaneSweep.phase, "warning");
  assert.equal(boss.invincibleUntil, Infinity);
});

test("T removal clears all projectile families unless its detonation was routed", () => {
  for (const routed of [false, true]) {
    const t = tower("T"), near = { x: t.x, y: t.y }, far = { x: x(12), y: y(0) };
    const f = fixture({ towers: [t], projectiles: [near, far], enemyProjectiles: [near, far], mortarProjectiles: [near, far] });
    f.runtime.onDetonation = target => { assert.equal(target, t); return routed; };
    life.removeTower(f.runtime, t);
    for (const shots of [f.runtime.projectiles, f.runtime.enemyProjectiles, f.runtime.mortarProjectiles]) {
      assert.deepEqual(shots, routed ? [near, far] : [far]);
    }
  }
});

test("real projectile hits, death splitting and saved data continuation match with and without presentation", () => {
  const ram = enemy("triangleRam3"), f = fixture({ enemies: [ram] });
  const initial = f.snapshot();
  const runs = [f, fixture(decodeSaveGraph(initial, () => ({}))), fixture(decodeSaveGraph(initial, () => ({})))];
  let observed = 0;
  runs[1].runtime.presentation = Object.fromEntries(Object.keys(silent).map(key => [key, () => { observed++; }]));
  for (const run of runs) {
    const r = run.runtime;
    const projectileRuntime = {
      ...r, presentation: NO_PROJECTILE_PRESENTATION, createProjectile: createTowerProjectileState,
      createMortar: createMortarProjectileState,
      damageEnemy: (e, amount, type, source) => life.damageEnemy(r, e, amount, type, source),
      damageTower: (t, amount, type) => life.damageTower(r, t, amount, type),
      damageBoss: (amount, type, part) => life.damageBoss(r, amount, type, part)
    };
    const target = r.enemies[0];
    r.projectiles.push(createTowerProjectileState({ type: "bolt", lane: 3, x: target.x, y: target.y,
      speed: 0, damage: 1e6, damageType: "true", hitCount: 5, splashRadius: 0, angleDegrees: 0, maxX: Infinity }));
    updateTowerProjectiles(projectileRuntime, 0);
    assert.equal(target.inPlay, false);
    assert.equal(r.enemies.length, 2);
    for (const e of [...r.enemies]) life.damageEnemy(r, e, 1e6, "true");
  }
  assert.deepEqual(runs[0].snapshot(), runs[1].snapshot());
  assert.deepEqual(runs[0].snapshot(), runs[2].snapshot());
  assert.ok(observed > 0);
  assert.deepEqual(runs[0].events, runs[2].events);
});
