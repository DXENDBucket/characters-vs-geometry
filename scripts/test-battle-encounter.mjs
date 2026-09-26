import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { BattleWorld } = load("src/game/battleWorld.ts");
const { BattleRandom } = load("src/game/battleSimulation.ts");
const { BattleActionQueue } = load("src/game/battleActions.ts");
const { BattleEncounter } = load("src/game/battleEncounter.ts");
const { BattlefieldCells } = load("src/game/battlefieldCells.ts");
const { TowerStorageSimulation } = load("src/game/towerStorageRules.ts");
const { TowerNullificationSimulation } = load("src/game/towerNullificationRules.ts");
const { NO_UNIT_LIFECYCLE_PRESENTATION } = load("src/game/unitLifecyclePresentation.ts");
const { NO_BOSS_SIMULATION_PRESENTATION } = load("src/game/bossSimulationPresentation.ts");
const { createBossState } = load("src/game/bossState.ts");
const { createEnemyState } = load("src/game/enemyState.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { getLevelConfig } = load("src/data/levels.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { enemyFamily } = load("src/registry/enemies.ts");
const { getDifficultyConfig, CELL_WIDTH, LANES, COLUMNS } = load("src/config.ts");
const { syncTowerOccupancy } = load("src/game/towerOccupancy.ts");
const { addEnemyToField } = load("src/game/enemyRoster.ts");
const { initializeEnemyHealthLinks } = load("src/game/enemyHealth.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const life = load("src/game/unitLifecycle.ts");

// Compose the actual data systems, with views absent and no engine/gameplay mocks.
function fixture(levelId = "5-10", unlimitedFirepower = false) {
  const world = new BattleWorld({ levelId, level: getLevelConfig(levelId), difficulty: getDifficultyConfig(3), unlimitedFirepower }, new BattleRandom(34));
  const events = [], queue = new BattleActionQueue();
  let encounter;
  const spawn = options => {
    const e = world.entityIds.identify("enemy", createEnemyState(options, () => world.random.next()));
    addEnemyToField(world.enemies, e); initializeEnemyHealthLinks(e, world.enemies); return e;
  };
  const lifecycle = {
    get enemies() { return world.enemies; }, get towers() { return world.towers; }, get occupied() { return world.occupied; },
    get battleTime() { return world.battleTime; }, get bossPhaseIndex() { return world.bossPhaseIndex; },
    projectiles: world.projectiles, enemyProjectiles: world.enemyProjectiles, mortarProjectiles: world.mortarProjectiles,
    presentation: NO_UNIT_LIFECYCLE_PRESENTATION, finalDamageReduction: world.options.difficulty.finalDamageReduction,
    getBoss: () => world.boss, setBoss: boss => { world.boss = boss; }, getWaveTracker: () => world.waveTracker,
    spawnEnemy: spawn, onEnemyDefeated: () => world.enemiesDefeated++, onTowerDamaged() {},
    onTowerRemoved: t => events.push(["removed", t.entityId]), onBossDefeated: boss => encounter.bossDefeated(boss),
    endLevel: () => world.finish("victory")
  };
  const storage = new TowerStorageSimulation(() => ({ enemies: world.enemies, towers: world.towers, occupied: world.occupied,
    battleTime: world.battleTime, damageTower: (t, amount, type) => life.damageTower(lifecycle, t, amount, type) }));
  const nul = new TowerNullificationSimulation(() => ({ towers: world.towers, occupied: world.occupied,
    suspended: (towers, duration) => { queue.delayTowerActions(towers, duration); storage.delayCarriers(towers, duration); },
    changed: () => events.push(["nulChanged"]) }));
  const cells = new BattlefieldCells({ world, removeTower: t => life.removeTower(lifecycle, t),
    updateLevelAuras: () => events.push(["auras"]) });
  encounter = new BattleEncounter({ world, lifecycle: () => lifecycle, clearStorage: () => storage.clear(),
    createBoss: (kind, reduction, options) => world.entityIds.identify("boss", createBossState(kind, reduction, options)),
    bossRuntime: () => ({ enemies: world.enemies, wave: world.wave, battleTime: world.battleTime,
      finalDamageReduction: world.options.difficulty.finalDamageReduction, spawnEnemy: spawn, presentation: NO_BOSS_SIMULATION_PRESENTATION }),
    bossSeen: kind => events.push(["seen", kind]), defeatedBoss: rank => events.push(["rank", rank]), endGame: () => world.finish("defeat") });
  const tower = (type = "B", lane = 3, column = 3) => {
    const t = world.entityIds.identify("tower", createTowerState(getCardDefinition(type), lane, column, world.battleTime, world.nextTowerOrder()));
    world.towers.push(t); syncTowerOccupancy(world.towers, world.occupied); return t;
  };
  const enemy = (kind = "triangle", lane = 3, x = 800) => spawn({ kind, lane, x, waveNumber: world.wave,
    time: world.battleTime, waveWeight: 0, finalDamageReduction: 0 });
  return { world, events, queue, lifecycle, storage, nul, cells, encounter, tower, enemy };
}

test("AE-T-4 DELs have independent health and victory requires both, in either kill order", () => {
  const { BOARD_Y, CELL_HEIGHT } = load("src/config.ts");
  const { bossParts, bossPartAtPoint } = load("src/game/unitGeometry.ts");
  for (const secondFirst of [false, true]) {
    const f = fixture("AE-T-4"); f.encounter.spawnBoss();
    const first = f.world.boss, second = first.independentBosses[0];
    assert.equal(f.world.chars, 5000);
    assert.deepEqual([first.y, second.y], [1, 5].map(lane => BOARD_Y + (lane + .5) * CELL_HEIGHT));
    assert.equal(first.hp, 500000); assert.equal(second.hp, 500000);
    assert.notEqual(first.skills, second.skills);
    assert.equal(bossPartAtPoint(first, second.x, second.y), second);
    life.damageBoss(f.lifecycle, 1000, "true", second);
    assert.equal(first.hp, 500000); assert.ok(second.hp < 500000);
    const victim = secondFirst ? second : first, survivor = secondFirst ? first : second;
    const hp = survivor.hp;
    life.damageBoss(f.lifecycle, 1e12, "true", victim);
    assert.equal(f.world.gameOver, false);
    assert.equal(f.world.boss, survivor); assert.equal(survivor.hp, hp);
    assert.deepEqual(bossParts(f.world.boss), [survivor]);
    assert.equal(life.damageBoss(f.lifecycle, 1e12, "true", victim), false);
    life.damageBoss(f.lifecycle, 1e12, "true", survivor);
    assert.equal(f.world.boss, null); assert.equal(f.world.result.outcome, "victory");
  }
});

test("both DELs tick skills independently and sweep at their own home rows", () => {
  const f = fixture("AE-T-4"); f.encounter.spawnBoss(); f.tower();
  const first = f.world.boss, second = first.independentBosses[0];
  const { updateBossRuntime } = load("src/game/bossSimulation.ts");
  const moves = [], warnings = [];
  const runtime = { getBoss: () => f.world.boss, towers: f.world.towers, enemies: [], battleTime: 0,
    bossPhaseIndex: 0, finalDamageReduction: 0,
    presentation: { ...NO_BOSS_SIMULATION_PRESENTATION, motion: boss => moves.push(boss) },
    warnCellSeal: (...args) => warnings.push(args), sealCell() {}, triggerTrapTower() {}, triggerShockTower() {},
    damageTower() {}, endGame() {} };
  updateBossRuntime(runtime, 1 / 60);
  assert.equal(first.deleteStackPending, true); assert.equal(second.deleteStackPending, true);
  assert.deepEqual(moves, [first, second]);
  runtime.battleTime = first.skills.deleteStack.activeUntil;
  updateBossRuntime(runtime, 1 / 60); assert.equal(warnings.length, 2);
  life.damageBoss(f.lifecycle, 200000, "true", second);
  assert.equal(first.delSweep, undefined); assert.equal(second.delSweep.homeY, second.y);
  assert.equal(first.invincibleUntil, 0); assert.equal(second.invincibleUntil, Infinity);
  const firstHp = first.hp, secondHp = second.hp;
  assert.equal(life.damageBoss(f.lifecycle, 1000, "true", second), false);
  assert.equal(life.damageBoss(f.lifecycle, 1000, "true", first), true);
  assert.equal(second.hp, secondHp); assert.ok(first.hp < firstHp);
});

test("independent DEL state survives graph snapshots without sharing HP or skills", () => {
  const f = fixture("AE-T-4"); f.encounter.spawnBoss();
  const first = f.world.boss, second = first.independentBosses[0];
  second.hp = 420000; second.skills.deleteStack.sp = 7;
  const saved = decodeSaveGraph(captureBattleSnapshot({ boss: first }), () => ({})).boss;
  assert.equal(saved.hp, 500000); assert.equal(saved.independentBosses[0].hp, 420000);
  assert.equal(saved.independentBosses[0].skills.deleteStack.sp, 7);
  assert.notEqual(saved.skills, saved.independentBosses[0].skills);
});

test("phase transition clears field links, passengers and stored cargo without death rewards or wave reset", () => {
  const f = fixture(), { world, encounter } = f; encounter.spawnBoss();
  world.wave = 27; world.levelElapsed = 123456; world.waveTracker = { number: 27, totalWeight: 100, defeatedWeight: 15, spawnedAt: 0 };
  const ally = f.tower(), q = f.tower("q", 1), stored = f.enemy("triangle", 1, q.x);
  f.storage.storeBlockedEnemies(q, getCardDefinition("q")); assert.equal(f.storage.count, 1);
  const passenger = f.enemy(), carrier = f.enemy("parentheses");
  world.enemies.splice(world.enemies.indexOf(passenger), 1);
  passenger.inPlay = false; passenger.parenthesisCarrier = carrier; carrier.parenthesisCargo = [passenger];
  const linked = f.enemy(), equal = f.enemy("equals"); assert.ok(equal.healthPool);
  const boss = world.boss, id = boss.entityId, startingChars = world.chars;
  boss.x -= 200; boss.octahedronCopies = [createBossState("icosahedron", 0)];
  life.damageBoss(f.lifecycle, 1e12, "true");
  assert.equal(world.boss, boss); assert.equal(boss.entityId, id); assert.equal(world.bossPhaseIndex, 1);
  assert.equal(world.wave, 27); assert.equal(world.bossPhaseStartedAt, 123456); assert.equal(world.waveTracker, null);
  assert.equal(boss.x, world.bossHomePosition.x); assert.equal(boss.hp, world.currentBossPhaseConfig().maxHp);
  assert.equal(boss.skills.impact.sp, 75); assert.equal(boss.skills.leap.sp, 35);
  assert.equal(f.storage.count, 0); assert.equal(world.enemies.length, 0);
  for (const e of [stored, passenger, carrier, linked, equal]) assert.equal(e.inPlay, false);
  assert.equal(passenger.parenthesisCarrier, undefined); assert.equal(linked.healthPool, undefined);
  assert.deepEqual(carrier.parenthesisCargo, []); assert.deepEqual(boss.octahedronCopies, []);
  assert.equal(world.enemiesDefeated, 0); assert.equal(world.chars, startingChars); assert.ok(ally.inPlay);
  world.bossPhaseIndex = 3; assert.equal(encounter.bossDefeated(boss), false);
});

test("endless Boss succession is immediate, uses new IDs, preserves home and cleans only its dependents", () => {
  for (const levelId of ["IF-BE-1", "IF-BE-2", "IF-BE-3", "IF-BE-4"]) {
    const f = fixture(levelId), { world, encounter } = f; encounter.spawnBoss();
    const initial = world.boss, home = { ...world.bossHomePosition }, other = f.enemy("triangle");
    const dependents = world.enemies.filter(e => e !== other);
    initial.x -= 90; world.wave = 16; encounter.bossDefeated(initial);
    assert.equal(world.boss.rank, 2); assert.notEqual(world.boss.entityId, initial.entityId);
    assert.deepEqual({ x: world.boss.x, y: world.boss.y }, home); assert.equal(world.wave, 16);
    assert.equal(world.gameOver, false); assert.ok(world.enemies.includes(other));
    assert.ok(dependents.every(e => !e.inPlay && !world.enemies.includes(e)));
    if (levelId === "IF-BE-3") {
      const companions = world.enemies.filter(e => enemyFamily(e.kind) === "dodecahedronCompanion");
      assert.equal(companions.length, 3); assert.ok(companions.every(e => e.kind === "dodecahedronCompanion2"));
    }
    if (levelId === "IF-BE-4") {
      assert.equal(world.boss.invincibleUntil, Infinity); assert.equal(world.enemies.filter(e => e.kind === "solarBomb").length, 2);
    }
    assert.deepEqual(f.events.filter(e => e[0] === "rank"), [["rank", 1]]);
  }
});

test("unlimited-firepower scaling is applied once to normal and phase Boss initialization", () => {
  for (const levelId of ["1-10", "5-10", "IF-BE-3"]) {
    const normal = fixture(levelId), boosted = fixture(levelId, true);
    normal.encounter.spawnBoss(); boosted.encounter.spawnBoss();
    assert.equal(boosted.world.boss.maxHp, normal.world.boss.maxHp * 10);
    assert.equal(boosted.world.boss.hp, boosted.world.boss.maxHp);
  }
});

test("storage charges self damage once per capture and releases by current facing even after carrier removal", () => {
  const f = fixture("1-9"), q = f.tower("q"), a = f.enemy("triangle", q.lane, q.x), b = f.enemy("triangle", q.lane, q.x + 10);
  const hp = q.hp; f.storage.storeBlockedEnemies(q, getCardDefinition("q"));
  assert.equal(q.hp, hp - 800); assert.equal(f.storage.count, 2); assert.equal(f.world.enemies.length, 0);
  q.facingDirection = -1; q.x += CELL_WIDTH; q.lane++; q.y += 78;
  life.removeTower(f.lifecycle, q); f.world.battleTime = 4999; f.storage.update(); assert.equal(f.storage.count, 2);
  f.world.battleTime = 5000; f.storage.update(); f.storage.update();
  assert.equal(f.storage.count, 0); assert.deepEqual(f.world.enemies, [a, b]);
  for (const e of [a, b]) { assert.equal(e.x, q.x + CELL_WIDTH); assert.equal(e.lane, q.lane); assert.ok(e.inPlay); assert.equal("body" in e, false); }
});

test("NUL postpones saved actions and stored cargo, suspends shells and restores placement order without erasure", () => {
  const f = fixture("AE-10"), q = f.tower("q"), shell = f.tower("[]"), b = f.tower("B", 1);
  const e = f.enemy("triangle", q.lane, q.x); f.storage.storeBlockedEnemies(q, getCardDefinition("q"));
  f.queue.schedule(0, 1000, { type: "volley", tower: q, hitCount: 1 });
  f.nul.start(0, 10000); assert.equal(f.world.towers.length, 0); assert.equal(f.world.occupied.size, 0);
  assert.ok([q, shell, b].every(t => t.nullified && !t.inPlay)); assert.ok(f.nul.isOccupied(q.lane, q.column));
  assert.equal(f.queue.snapshot()[0].at, 11000); assert.equal(f.storage.snapshot()[0].releaseAt, 15000);
  f.world.battleTime = 10000; f.storage.update(); assert.equal(f.storage.count, 1);
  f.nul.update(10000); assert.deepEqual(f.world.towers, [q, shell, b]); assert.equal(q.parenthesisGuard, shell);
  f.world.battleTime = 15000; f.storage.update(); assert.ok(e.inPlay);
  assert.equal(f.events.some(e => e[0] === "removed"), false);
});

test("periodic NUL and cargo resume preserve their own deadlines through graph restoration", () => {
  const f = fixture("AE-EX-2"), a = f.tower("q"); f.world.battleTime = 59000;
  f.enemy("triangle", a.lane, a.x); f.storage.storeBlockedEnemies(a, getCardDefinition("q"));
  const periodic = f.world.options.level.periodicTowerNullification;
  f.nul.update(60000, periodic); assert.equal(a.nextNullificationAt, 120000);
  const saved = decodeSaveGraph(captureBattleSnapshot({ towers: f.world.towers, enemies: f.world.enemies,
    storage: f.storage.snapshot(), nullified: f.nul.snapshot(), actions: f.queue.snapshot() }), () => ({}));
  const restored = fixture("AE-EX-2"); restored.world.towers = saved.towers; restored.world.enemies = saved.enemies;
  restored.storage.restore(saved.storage); restored.nul.restore(saved.nullified); restored.queue.restore(saved.actions);
  for (const current of [f, restored]) {
    current.world.battleTime = 69999; current.nul.update(69999, periodic); current.storage.update(); assert.equal(current.world.towers.length, 0);
    current.world.battleTime = 70000; current.nul.update(70000, periodic); current.storage.update(); assert.equal(current.storage.count, 1);
    current.world.battleTime = 74000; current.nul.update(74000, periodic); current.storage.update(); assert.equal(current.storage.count, 0);
  }
  const data = current => captureBattleSnapshot({ towers: current.world.towers, enemies: current.world.enemies, nullified: current.nul.snapshot() });
  assert.equal(JSON.stringify(data(restored)), JSON.stringify(data(f)));
});

test("cell sealing erases both placement layers, is idempotent and leaves NUL cells temporarily absent", () => {
  const f = fixture("5-9"), a = f.tower("B", 3, COLUMNS - 1), shell = f.tower("[]", 3, COLUMNS - 1);
  f.world.wave = 4; f.world.applyWaveStartMechanics(column => f.cells.sealColumn(column));
  assert.equal(a.inPlay, false); assert.equal(shell.inPlay, false); assert.equal(f.world.sealedCells.size, LANES);
  assert.equal(f.events.filter(e => e[0] === "removed").length, 2);
  f.cells.sealColumn(COLUMNS - 1); assert.equal(f.events.filter(e => e[0] === "removed").length, 2);
  const nul = f.tower("B", 0, 0); f.nul.start(0, 10000, [nul]);
  f.cells.sealTimedCell(0, 0, 20000); assert.equal(f.events.filter(e => e[0] === "removed").length, 2);
  const b = f.tower("B", 1, 1); f.cells.warnCell(1, 1, 5000, 90000, 2000);
  f.world.timedCellSeals.update(6999, (l, c) => f.cells.eraseCell(l, c)); assert.ok(b.inPlay);
  f.world.timedCellSeals.update(7000, (l, c) => f.cells.eraseCell(l, c)); assert.equal(b.inPlay, false);
  f.world.timedCellSeals.update(97000, (l, c) => f.cells.eraseCell(l, c)); assert.equal(f.world.timedCellSeals.isSealed(1, 1), false);
});

test("base breach uses actual removal and immutable terminal world state without presentation", () => {
  const f = fixture("1-9"), e = f.enemy(); f.world.baseIntegrity = 1;
  assert.equal(f.encounter.enemyReachedBase(e), true);
  assert.equal(f.world.baseIntegrity, 0); assert.equal(e.inPlay, false); assert.equal(f.world.enemies.length, 0);
  assert.equal(f.world.result.outcome, "defeat"); assert.equal(f.world.flawlessRun, false);
  assert.equal(f.world.finish("victory"), false);
});
