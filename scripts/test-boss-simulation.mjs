import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// Actual factories, queue, promotion and damage rules; no engine or gameplay mocks.
const load = createTypeScriptLoader();
const { updateBossRuntime, executeBossAttack } = load("src/game/bossSimulation.ts");
const { NO_BOSS_SIMULATION_PRESENTATION } = load("src/game/bossSimulationPresentation.ts");
const { NO_UNIT_LIFECYCLE_PRESENTATION } = load("src/game/unitLifecyclePresentation.ts");
const { createBossState } = load("src/game/bossState.ts");
const { createEnemyState } = load("src/game/enemyState.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { createMortarProjectileState } = load("src/game/projectileState.ts");
const { BattleActionQueue } = load("src/game/battleActions.ts");
const { BattleRandom } = load("src/game/battleSimulation.ts");
const { syncTowerOccupancy } = load("src/game/towerOccupancy.ts");
const { initializeEnemyHealthLinks } = load("src/game/enemyHealth.ts");
const { addEnemyToField } = load("src/game/enemyRoster.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { enemyRank, enemyFamily } = load("src/registry/enemies.ts");
const { applyStatusEffect, hasStatusEffect } = load("src/game/statusEffects.ts");
const { findPromotionTargets } = load("src/game/enemyPromotionRules.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const life = load("src/game/unitLifecycle.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT, COLUMNS, LANES, CUBE_BOSS_CONTACT_INTERVAL } = load("src/config.ts");
const x = column => BOARD_X + (column + .5) * CELL_WIDTH;
const y = lane => BOARD_Y + (lane + .5) * CELL_HEIGHT;
const tower = (type = "B", column = 3, lane = 3) =>
  createTowerState(getCardDefinition(type), lane, column, 0, lane * 100 + column);

function fixture(kind = "cube", saved = {}) {
  const data = { boss: createBossState(kind, 0), towers: [], enemies: [], projectiles: [], enemyProjectiles: [],
    mortarProjectiles: [], battleTime: 0, bossPhaseIndex: 0, wave: 11, randomState: 73, ...saved };
  const events = [], occupied = new Map(), random = new BattleRandom(data.randomState), queue = new BattleActionQueue();
  queue.restore(data.pending ?? []); delete data.pending;
  syncTowerOccupancy(data.towers, occupied);
  const spawn = options => {
    const unit = createEnemyState({ ...options, environmentHpMultiplier: 1.35 }, () => random.next());
    addEnemyToField(data.enemies, unit); initializeEnemyHealthLinks(unit, data.enemies); return unit;
  };
  const common = { ...data, getBoss: () => data.boss, get battleTime() { return data.battleTime; },
    get bossPhaseIndex() { return data.bossPhaseIndex; }, finalDamageReduction: 0, spawnEnemy: spawn };
  const lifecycle = { ...common, occupied, get battleTime() { return data.battleTime; },
    get bossPhaseIndex() { return data.bossPhaseIndex; },
    presentation: NO_UNIT_LIFECYCLE_PRESENTATION, setBoss: boss => { data.boss = boss; },
    getWaveTracker() {}, onEnemyDefeated() {}, onTowerDamaged() {}, endLevel: () => events.push(["end"]) };
  const runtime = { ...common, get battleTime() { return data.battleTime; },
    get bossPhaseIndex() { return data.bossPhaseIndex; }, presentation: NO_BOSS_SIMULATION_PRESENTATION,
    random: () => random.next(), createBoss: createBossState, createMortar: createMortarProjectileState,
    onEnemyPromotion: kind => events.push(["promotion", kind]),
    scheduleBattleAction: (delay, action) => queue.schedule(data.battleTime, delay, action),
    nullifyTowers: duration => events.push(["nul", duration]),
    warnCellSeal: (...args) => events.push(["warning", ...args]), sealCell: (...args) => events.push(["seal", ...args]),
    damageTower: (target, amount, type) => life.damageTower(lifecycle, target, amount, type),
    triggerTrapTower: target => events.push(["trap", target.id]),
    triggerShockTower: target => events.push(["shock", target.id]), endGame: () => events.push(["breach"]) };
  const update = (time = data.battleTime, seconds = 0) => { data.battleTime = time; updateBossRuntime(runtime, seconds); };
  const tick = () => { update(data.battleTime + 1000 / 60, 1 / 60); queue.update(data.battleTime, action => executeBossAttack(runtime, action)); };
  const snapshot = () => captureBattleSnapshot({ ...data, pending: queue.snapshot(), randomState: random.state });
  const enemy = (kind = "triangle", column = 8, lane = 3) => spawn({ kind, lane, x: x(column), time: data.battleTime,
    waveNumber: data.wave, waveWeight: 0, finalDamageReduction: 0 });
  return { data, runtime, lifecycle, random, queue, events, update, tick, snapshot, enemy };
}

test("cube promotion prioritizes eligible high ranks, preserves HP ratios, and summons its own rank without views", () => {
  const f = fixture("cube2"), boss = f.data.boss;
  const low = f.enemy("triangle", 10), high = [f.enemy("triangle2", 7), f.enemy("square2", 8), f.enemy("circle2", 9)];
  const flying = f.enemy("triangle2", 10); applyStatusEffect(flying, "highFlying", 1000, 0);
  const ratio = new Map(high.map(e => { e.hp *= .4; return [e, e.hp / e.maxHp]; }));
  assert.deepEqual(new Set(findPromotionTargets(boss, f.data.enemies, 2, 3)), new Set(high));
  boss.skills.promotion.sp = boss.skills.promotion.maxSp;
  boss.skills.advance.sp = boss.skills.advance.maxSp;
  const randomBefore = f.random.state; f.update();
  assert.deepEqual(high.map(e => enemyRank(e.kind)), [3, 3, 3]);
  for (const e of high) assert.ok(Math.abs(e.hp / e.maxHp - ratio.get(e)) < 1e-12);
  assert.equal(low.kind, "triangle"); assert.equal(flying.kind, "triangle2");
  assert.equal(f.events.filter(e => e[0] === "promotion").length, 3);
  assert.notEqual(f.random.state, randomBefore);
  assert.equal(f.data.enemies.slice(5).length, LANES);
  assert.ok(f.data.enemies.slice(5).every(e => e.kind === "square2" && !("body" in e)));
});

test("tetrahedron and phase two use their distinct half-HP and critical summon footprints", () => {
  for (const kind of ["tetrahedron2", "icosahedron"]) {
    const f = fixture(kind, { bossPhaseIndex: kind === "icosahedron" ? 1 : 0 }), boss = f.data.boss;
    boss.hasSkills = false; boss.hp = boss.maxHp * .5; f.update();
    assert.equal(f.data.enemies.length, LANES * (kind === "icosahedron" ? 5 : 2));
    assert.ok(f.data.enemies.every(e => e.kind === (kind === "icosahedron" ? "invertedTriangle3" : "invertedTriangle2")));
    const count = f.data.enemies.length; f.update(); assert.equal(f.data.enemies.length, count);
    life.damageBoss(f.lifecycle, 1e12, "true");
    assert.equal(boss.hp, 1); assert.ok(boss.invincibleUntil > 0);
    f.update(); assert.equal(f.data.enemies.length - count, LANES * (kind === "icosahedron" ? COLUMNS : 5));
    assert.equal(boss.pendingCriticalSummon, false);
  }
});

test("octahedron shields immediately but creates copies and ranked reinforcements only after warning", () => {
  const f = fixture("octahedron2"), boss = f.data.boss; f.update();
  assert.equal(f.data.enemies.length, 2); assert.equal(boss.invincibleUntil, Infinity);
  boss.invincibleUntil = 0; boss.hp = boss.maxHp * .25; f.update(1000);
  assert.equal(boss.invincibleUntil, Infinity); assert.equal(boss.pendingCopies.length, 3);
  f.update(4999); assert.equal(boss.octahedronCopies.length, 0); assert.equal(f.queue.snapshot().length, 0);
  boss.invincibleUntil = 0; f.update(5000);
  assert.equal(boss.invincibleUntil, 0); assert.equal(boss.octahedronCopies.length, 3);
  assert.equal(f.data.enemies.length, 8); assert.equal(f.queue.snapshot().length, 5);
  assert.deepEqual(boss.octahedronCopies.map(p => [p.movementAxis, p.movementDirection]), [["x", 1], ["y", 1], ["y", -1]]);
  for (const part of boss.octahedronCopies) {
    assert.equal(part.hp, boss.hp); assert.equal(part.invincibleUntil, Infinity);
    assert.notEqual(part.statusEffects, boss.statusEffects); assert.equal("body" in part, false);
  }
  f.queue.update(7000, action => executeBossAttack(f.runtime, action));
  const summons = f.data.enemies.slice(8);
  assert.ok(summons.every(e => enemyRank(e.kind) === 2));
  assert.deepEqual(summons.filter(e => enemyFamily(e.kind) === "burrowArrow").map(e => e.lane), [1, 3, 5]);
});

test("final icosahedron copies keep defenses, skip solar bombs and preserve the fatal-lock deadline", () => {
  const f = fixture("icosahedron", { bossPhaseIndex: 3 }), boss = f.data.boss;
  boss.hasSkills = false; boss.hp *= .25; f.update(1000); f.update(5000);
  assert.equal(boss.octahedronCopies.length, 3); assert.equal(f.data.enemies.length, 0);
  assert.equal(boss.invincibleUntil, 0);
  f.queue.update(7000, action => executeBossAttack(f.runtime, action));
  assert.ok(f.data.enemies.every(e => enemyRank(e.kind) === 3));
  life.damageBoss(f.lifecycle, 1e12, "true"); f.update();
  assert.equal(boss.hp, 1); assert.equal(boss.pendingCopies.length, 1);
  assert.equal(boss.invincibleUntil, 20000);
  const saved = decodeSaveGraph(f.snapshot(), () => ({})), restored = fixture("icosahedron", saved);
  for (const current of [f, restored]) { current.update(8999); current.update(9000); }
  const copy = boss.octahedronCopies.at(-1);
  assert.equal(copy.x, x(1)); assert.equal(copy.y, y(2)); assert.equal(copy.movementDirection, 1);
  assert.equal(copy.invincibleUntil, 20000); assert.deepEqual(copy.baseStats, boss.baseStats);
  assert.equal(JSON.stringify(restored.snapshot()), JSON.stringify(f.snapshot()));
});

test("companions retain frozen position, seven-row formation, alternating deaths and final wings", () => {
  const f = fixture("icosahedron", { bossPhaseIndex: 2 }), boss = f.data.boss;
  boss.hasSkills = false; f.update();
  const companions = f.data.enemies.slice(); assert.equal(companions.length, 7);
  assert.ok(companions.every(e => enemyRank(e.kind) === 1));
  const frozen = companions[0], position = [frozen.x, frozen.y, frozen.bossOrbitAngle];
  applyStatusEffect(frozen, "frozen", 60000, 0); f.update(48000, .5);
  assert.deepEqual([frozen.x, frozen.y, frozen.bossOrbitAngle], position);
  assert.deepEqual(companions.slice(1).map(e => e.lane), [1, 2, 3, 4, 5, 6]);
  f.queue.restore([]);
  const targets = Array.from({ length: 7 }, (_, i) => tower("B", i, 0));
  f.data.towers.push(...targets); syncTowerOccupancy(f.data.towers, f.lifecycle.occupied);
  for (let i = 0; i < companions.length; i++) {
    companions[i].inPlay = false; f.update(48001 + i);
    const actions = f.queue.snapshot().map(p => p.action); f.queue.restore([]);
    if (i % 2 === 0) {
      assert.equal(actions.length, 5); assert.ok(actions.every(a => a.type === "bossDeathLaser" && a.hitCount === 3 && a.laneRadius === 2));
    } else {
      assert.equal(actions.length, 6); assert.ok(actions.every(a => a.type === "bossDeathMortar"));
      assert.deepEqual(actions.map(a => a.target), targets.slice(1).reverse());
    }
    assert.ok(companions.slice(i + 1).every(e => hasStatusEffect(e, "invincible", f.data.battleTime)));
  }
  const recipient = f.enemy(); recipient.x = boss.x; recipient.y = boss.y;
  boss.skills.endlessWings.sp = boss.skills.endlessWings.maxSp; f.update(48010);
  assert.equal(boss.companionDeathsHandled, 7); assert.equal(hasStatusEffect(recipient, "flying", 48010), true);
});

test("multihit companion lasers preserve separate damage and isolate nested battlefield target buffers", () => {
  const f = fixture("dodecahedron2", { towers: [tower("B", 2), tower("B", 4)] }); f.update();
  const other = fixture("dodecahedron", { towers: [tower("B", 1)] }); other.update();
  const companion = f.data.enemies[0]; companion.x = x(9); companion.lane = 3;
  const seen = [], damage = f.runtime.damageTower;
  f.runtime.damageTower = (...args) => {
    seen.push(args[0]); executeBossAttack(other.runtime, { type: "bossDeathLaser", boss: other.data.boss, laneRadius: 1, hitCount: 1 });
    damage(...args);
  };
  executeBossAttack(f.runtime, { type: "companionLaser", boss: f.data.boss, companion, hitCount: 3 });
  assert.deepEqual(seen, [f.data.towers[1], f.data.towers[1], f.data.towers[1], f.data.towers[0], f.data.towers[0], f.data.towers[0]]);
  assert.ok(f.data.towers.every(t => t.hp < t.maxHp));
  companion.inPlay = false; executeBossAttack(f.runtime, { type: "companionLaser", boss: f.data.boss, companion, hitCount: 3 });
  assert.equal(seen.length, 6);
  const before = f.data.mortarProjectiles.length, previousBoss = f.data.boss; f.data.boss = createBossState("dodecahedron2", 0);
  executeBossAttack(f.runtime, { type: "bossDeathMortar", boss: previousBoss, target: f.data.towers[0] });
  assert.equal(f.data.mortarProjectiles.length, before);
});

test("Boss contact targets each guarded cell once and keeps another world's contact buffers independent", () => {
  const a = tower("B", 9), b = tower("B", 10), shell = tower("[]", 9), f = fixture("cube", { towers: [a, shell, b] });
  const other = fixture("cube", { towers: [tower("B", 10)] });
  for (const current of [f, other]) { current.data.boss.x = x(10); current.data.boss.hasSkills = false; }
  const seen = [], damage = f.runtime.damageTower, hp = a.hp;
  f.runtime.damageTower = (...args) => { seen.push(args[0]); other.update(1000, CUBE_BOSS_CONTACT_INTERVAL); damage(...args); };
  f.update(1000, CUBE_BOSS_CONTACT_INTERVAL);
  assert.deepEqual(seen, [a, b]); assert.equal(a.hp, hp); assert.ok(shell.hp < shell.maxHp);
});

test("DEL locks the latest target after glitch, cancels empty targeting and runs delayed format without rendering", () => {
  const early = tower("B", 1), f = fixture("del", { towers: [early] }), boss = f.data.boss;
  f.update(); assert.equal(boss.deleteStackPending, true); assert.equal(boss.skills.deleteStack.sp, 0);
  const late = tower("B", 2); f.data.towers.push(late);
  f.update(1999); assert.equal(f.events.length, 0); f.update(2000);
  assert.deepEqual(f.events[0], ["warning", late.lane, late.column, 5000, 90000, 0]);
  boss.skills.deleteStack.sp = 40; f.update(2100);
  f.data.towers.length = 0; f.update(4100); assert.equal(f.events.length, 1); assert.equal(boss.skills.deleteStack.sp, 0);
  boss.hp = boss.maxHp * .49; boss.delSweep = { phase: "complete" };
  boss.delLaneSweep = { phase: "complete", stage: "quarter" };
  boss.skills.deleteFormat.sp = 75; f.update(5000); assert.equal(boss.deleteFormatReadyAt, 8000);
  f.update(7999); assert.equal(f.events.length, 1); f.update(8000);
  assert.deepEqual(f.events.at(-1), ["nul", 10000]); assert.equal(boss.deleteFormatReadyAt, undefined);
});

test("DEL sweeps and echoes seal only their lanes, ignore breach and summon with simulation timestamps", () => {
  const f = fixture("del"), boss = f.data.boss; boss.hasSkills = false; boss.hp *= .75; f.update();
  assert.equal(boss.invincibleUntil, Infinity); f.update(2999); assert.equal(f.events.length, 0);
  f.update(10000); assert.equal(boss.delSweep.phase, "complete"); assert.equal(boss.invincibleUntil, 0);
  assert.deepEqual([...new Set(f.events.filter(e => e[0] === "seal").map(e => e[1]))].sort(), [2, 3, 4]);
  f.events.length = 0; boss.hp = boss.maxHp * .5; f.update(11000); f.update(14000);
  assert.equal(boss.delLaneSweep.parts.length, 2);
  assert.ok(boss.delLaneSweep.parts.every(p => p.invincibleUntil === Infinity && p.hitboxHeight < CELL_HEIGHT && !("body" in p)));
  f.update(20000); assert.deepEqual([...new Set(f.events.filter(e => e[0] === "seal").map(e => e[1]))].sort(), [1, 5]);
  assert.equal(f.data.enemies.length, 6); assert.ok(f.data.enemies.every(e => e.kind === "triangleRam5"));
  boss.hp = boss.maxHp * .25; f.events.length = 0; f.update(21000); f.update(30000);
  assert.deepEqual([...new Set(f.events.filter(e => e[0] === "seal").map(e => e[1]))].sort(), [0, 6]);
  assert.deepEqual(f.data.enemies.slice(-2).map(e => e.kind), ["heart", "heart"]);
  assert.equal(f.events.some(e => e[0] === "breach"), false);
});

test("bodyless Boss state, RNG, references and deferred attacks continue identically after graph restoration", () => {
  for (const kind of ["cube2", "tetrahedron2", "dodecahedron2", "octahedron2", "icosahedron", "del"]) {
    const f = fixture(kind, { bossPhaseIndex: kind === "icosahedron" ? 2 : 0 });
    f.data.towers.push(tower("B", 1)); syncTowerOccupancy(f.data.towers, f.lifecycle.occupied);
    f.enemy("triangle2"); f.enemy("triangle2"); f.enemy("triangle2");
    f.data.boss.skills.promotion.sp = 90;
    for (let i = 0; i < 60; i++) f.tick();
    if (["dodecahedron2", "icosahedron"].includes(kind)) {
      const c = f.data.enemies.find(e => enemyFamily(e.kind) === "dodecahedronCompanion");
      c.bossCompanionNextActionAt = f.data.battleTime; f.tick();
      assert.ok(f.queue.snapshot().length > 0);
    }
    const restored = fixture(kind, decodeSaveGraph(f.snapshot(), () => ({})));
    for (let i = 0; i < 600; i++) { f.tick(); restored.tick(); }
    assert.equal(JSON.stringify(restored.snapshot()), JSON.stringify(f.snapshot()), kind);
  }
});
