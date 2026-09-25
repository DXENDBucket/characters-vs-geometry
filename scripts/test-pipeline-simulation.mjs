import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// These are the live rules with data factories, not engine or gameplay stubs.
const load = createTypeScriptLoader();
const { ProjectileCircuitSimulation } = load("src/game/projectileCircuitRules.ts");
const { TargetedEffectSimulation } = load("src/game/targetedEffectRules.ts");
const { emitPipelineShot, healPipelineArea, routePipelineTowerAction } = load("src/game/pipelineActionRules.ts");
const { TowerExtractionPool } = load("src/game/towerExtraction.ts");
const { TowerSkillSimulation } = load("src/game/towerSkillSimulation.ts");
const { TowerStorageSimulation } = load("src/game/towerStorageRules.ts");
const { BattleActionQueue } = load("src/game/battleActions.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { createEnemyState } = load("src/game/enemyState.ts");
const projectiles = load("src/game/projectileState.ts");
const { projectileDamageBudget, forEachProjectileHit } = load("src/game/projectileIntegrity.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { syncTowerOccupancy } = load("src/game/towerOccupancy.ts");
const { syncTowerTopology } = load("src/game/towerTopology.ts");
const { syncTowerFinalStats } = load("src/game/unitStatRules.ts");
const { triggerShockTower, executeShockPulse } = load("src/game/triggerTowerRules.ts");
const { reflectEnemyAttack, updateTowerProjectiles } = load("src/game/projectileRuntime.ts");
const { NO_PROJECTILE_PRESENTATION } = load("src/game/projectilePresentation.ts");
const { NO_TOWER_COMBAT_PRESENTATION } = load("src/game/towerCombatPresentation.ts");
const { NO_TOWER_SKILL_PRESENTATION } = load("src/game/towerSkillPresentation.ts");
const { NO_TRIGGER_TOWER_PRESENTATION } = load("src/game/triggerTowerPresentation.ts");
const { NO_UNIT_LIFECYCLE_PRESENTATION } = load("src/game/unitLifecyclePresentation.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const life = load("src/game/unitLifecycle.ts");

function fixture(saved) {
  const state = saved ?? { towers: [], enemies: [], edges: [], projectiles: [], enemyProjectiles: [], mortarProjectiles: [],
    occupied: new Map(), battleTime: 0, boss: null, chars: 100000, order: 0, cardStates: ["b", "t", "!", "y"].map(id => ({ definition: getCardDefinition(id), readyAt: 0 })) };
  const queue = new BattleActionQueue(), extraction = new TowerExtractionPool();
  state.occupied ??= new Map();
  if (saved?.pending) queue.restore(saved.pending);
  if (saved?.extraction) extraction.restore(saved.extraction);
  const common = { ...state, get battleTime() { return state.battleTime; }, getDefinition: getCardDefinition,
    getBoss: () => state.boss, setBoss: boss => { state.boss = boss; }, finalDamageReduction: 0,
    getWaveTracker() {}, onEnemyDefeated() {}, onTowerDamaged() {}, endLevel() {},
    scheduleBattleAction: (delay, action) => queue.schedule(state.battleTime, delay, action),
    damageTower: (t, damage, type) => life.damageTower(lifecycle, t, damage, type),
    damageEnemy: (e, damage, type, source) => life.damageEnemy(lifecycle, e, damage, type, source),
    damageBoss: (damage, type, part) => life.damageBoss(lifecycle, damage, type, part),
    removeTower: t => life.removeTower(lifecycle, t),
    onTowerAction: (t, event) => routePipelineTowerAction(t, event, circuit, combat, getCardDefinition) };
  const lifecycle = { ...common, presentation: NO_UNIT_LIFECYCLE_PRESENTATION, onTowerRemoved: () => refresh() };
  const storage = new TowerStorageSimulation(() => common);
  const createTower = (definition, lane, column, time, order, options) => createTowerState(definition, lane, column, time, order, options);
  const place = (type = "A", column = 1, lane = 3, level = 1) => {
    const t = createTower(getCardDefinition(type), lane, column, state.battleTime, state.order++);
    t.level = level; syncTowerFinalStats(t); state.towers.push(t); refresh(); return t;
  };
  const combat = { ...common, presentation: NO_TOWER_COMBAT_PRESENTATION,
    createProjectile: projectiles.createTowerProjectileState, createHomingProjectile: projectiles.createHomingTowerProjectileState,
    createMortar: projectiles.createMortarProjectileState,
    gainChars: amount => { state.chars += amount; }, storeBlockedEnemies: (t, d) => storage.storeBlockedEnemies(t, d),
    spawnTower: (id, lane, column, level, facing) => { const t = place(id, column, lane, level); t.facingDirection = facing ?? 1; return t; } };
  const trigger = { ...common, presentation: NO_TRIGGER_TOWER_PRESENTATION, gameOver: false };
  const skills = new TowerSkillSimulation(() => ({ ...common, presentation: NO_TOWER_SKILL_PRESENTATION }));
  const targetedRuntime = { ...common, createTower, cardTimeFor: () => state.battleTime,
    nextTowerOrder: () => state.order++, getChars: () => state.chars, spendChars: n => { state.chars -= n; },
    extraction, updateLevelAuras: () => refresh() };
  const targeted = new TargetedEffectSimulation(() => targetedRuntime);
  const projectileRuntime = { ...combat, presentation: NO_PROJECTILE_PRESENTATION,
    routeProjectile: p => circuit.capture(p), interceptProjectile: (p, from) => circuit.intercept(p, from) };
  const actions = { combat, trigger, getDefinition: getCardDefinition,
    skill: (t, event) => skills.imitateSkill(t, event), targeted: (type, t, level) => targeted.imitate(type, t, level),
    detonate: t => life.detonateSlowAuraTower(lifecycle, t), reflect: (t, p) => reflectEnemyAttack(projectileRuntime, t, p, true) };
  const circuit = new ProjectileCircuitSimulation(() => ({ ...state, getDefinition: getCardDefinition,
    emit: (shot, t) => emitPipelineShot(shot, t, actions), heal: (t, amount) => healPipelineArea(t, amount, combat) }));
  for (const port of [lifecycle, combat, trigger, targetedRuntime, projectileRuntime]) {
    Object.defineProperty(port, "battleTime", { get: () => state.battleTime });
  }
  function refresh() { syncTowerOccupancy(state.towers, state.occupied); syncTowerTopology(state.towers); circuit.sync(); }
  refresh();
  const edge = (column, lane = 3, mode = ">", axis = "horizontal", level = 1) => {
    const e = { type: "=", column, lane, axis, mode, level }; state.edges.push(e); refresh(); return e;
  };
  const enemy = (x, lane = 3, kind = "trapezoid") => {
    const e = createEnemyState({ kind, lane, x, time: 0, waveNumber: 1, waveWeight: 10, finalDamageReduction: 0 }, () => .5);
    state.enemies.push(e); return e;
  };
  const shot = (source, overrides = {}) => projectiles.createTowerProjectileState({ type: "bolt", sourceTower: source,
    x: source.x + 26, y: source.y, lane: source.lane, speed: 400, damage: 400, damageType: "physical",
    hitCount: 3, splashRadius: 0, angleDegrees: 0, maxX: source.x + 500, ...overrides });
  const tick = (ms = 40) => {
    state.battleTime += ms;
    queue.update(state.battleTime, action => {
      if (action.type === "targetedEffect") targeted.resolvePendingEffectCard(action.tower);
      else if (action.type === "shock") executeShockPulse(trigger, action);
      else if (action.type === "spellMortar") skills.launchSpellMortar(action);
      else throw Error(`Unexpected action ${action.type}`);
    });
    circuit.update(); skills.update(ms / 1000, state.battleTime);
  };
  const snapshot = () => {
    const { occupied, ...data } = state;
    return captureBattleSnapshot({ ...data, pending: queue.snapshot(), extraction: extraction.value });
  };
  return { state, circuit, targeted, targetedRuntime, extraction, combat, trigger, skills, actions, lifecycle,
    place, edge, enemy, shot, tick, snapshot, projectileRuntime, refresh };
}

test("bodyless capture and reversed output preserve each partial judgment and its armor threshold", () => {
  const f = fixture(), a = f.place(), bank = f.place("0", 2), outlet = f.place("1", 4, 3, 2);
  f.edge(1); f.edge(2); f.edge(3); outlet.facingDirection = -1;
  const first = f.shot(a, { partialHitDamage: 100 }), second = f.shot(a, { hitCount: 2 });
  f.state.projectiles.push(first); updateTowerProjectiles(f.projectileRuntime, 0);
  assert.equal(f.state.projectiles.length, 0); assert.equal(bank.projectileBank.shots.length, 1);
  f.tick(); assert.equal(f.state.projectiles.length, 0);
  assert.equal(f.circuit.capture(second), true); f.tick();
  assert.equal(f.state.projectiles.length, 2);
  const emitted = f.state.projectiles[0], judgments = [];
  forEachProjectileHit(emitted, damage => judgments.push(damage)); assert.deepEqual(judgments, [100, 400, 400]);
  assert.equal(emitted.sourceTower, a); assert.equal(emitted.vx, -400); assert.equal(emitted.x, outlet.x - 26);
  assert.equal(emitted.circuitChecked, true); assert.equal("body" in emitted, false);
  const actual = f.enemy(outlet.x), expected = f.enemy(outlet.x);
  forEachProjectileHit(emitted, damage => life.damageEnemy(f.lifecycle, actual, damage, "physical", a));
  for (const damage of judgments) life.damageEnemy(f.lifecycle, expected, damage, "physical", a);
  assert.equal(actual.hp, expected.hp);
});

test("queued attachments, extraction and cooldown refunds restore without a display", () => {
  const f = fixture(), target = f.place("B", 2, 3, 5);
  f.extraction.restore(3000);
  assert.equal(f.targeted.use(getCardDefinition("t"), 3, 2, target), "handled");
  const pending = f.state.towers.find(t => t.transient), level = pending.level;
  assert.ok(level > 1); assert.equal(target.trueDamageUntil, 0);
  const r = fixture(decodeSaveGraph(f.snapshot(), () => ({})));
  f.tick(); r.tick(); assert.deepEqual(r.snapshot(), f.snapshot());
  assert.equal(target.trueDamageUntil, 40 + level * 12000); assert.equal(pending.inPlay, false);
  assert.equal(f.state.cardStates.find(c => c.definition.id === "t").readyAt, 40 + getCardDefinition("t").cooldown / level);
  f.targeted.imitate("b", target, 1); assert.equal(target.facingDirection, -1);
  f.targeted.imitate("!", target, 1); assert.equal(target.continuousAttack, true);
  f.targeted.imitate("y", target, 2); assert.equal(target.inPlay, false);
  assert.equal(f.extraction.value, getCardDefinition("B").cost * 5 * .75);
});

test("pending attachment upgrades and mirrored recipients consume neither extra charges nor refunds", () => {
  const f = fixture(), target = f.place("B", 1), other = f.place("B", 5);
  const card = getCardDefinition("t"); f.targeted.use(card, 3, 1, target);
  f.state.cardStates.find(c => c.definition.id === "t").readyAt = 0;
  f.targeted.use(card, 3, 1, target);
  const original = f.state.towers.find(t => t.transient); assert.equal(original.level, 2);
  const mirrored = f.targeted.createMirroredEffect(original, other);
  assert.equal(mirrored.level, 2); assert.equal(mirrored.mirroredEffect, true);
  f.targetedRuntime.runMirrorGroupEvent = (_tower, action) => { action(original); action(mirrored); };
  original.mirrorGroupId = mirrored.mirrorGroupId = "mirror:1";
  const chars = f.state.chars; f.tick();
  assert.equal(f.state.chars, chars); assert.equal(target.trueDamageUntil, 24040); assert.equal(other.trueDamageUntil, 24040);
  assert.equal(f.state.cardStates.find(c => c.definition.id === "t").readyAt, 40 + card.cooldown / 2);
  assert.ok(!original.inPlay && !mirrored.inPlay);
});

test("one-shot source vanishes once and its saved action damages only from the outlet", () => {
  const f = fixture(), source = f.place("F", 1), bank = f.place("0", 2), outlet = f.place("1", 7);
  for (let c = 1; c < 7; c++) f.edge(c);
  const nearby = f.enemy(source.x), remote = f.enemy(outlet.x), hp = nearby.hp;
  triggerShockTower(f.trigger, source);
  assert.equal(source.inPlay, false); assert.equal(nearby.hp, hp); assert.equal(bank.projectileBank.shots.length, 1);
  const r = fixture(decodeSaveGraph(f.snapshot(), () => ({})));
  for (let i = 0; i < 60; i++) { f.tick(); r.tick(); }
  assert.equal(nearby.hp, hp); assert.ok(remote.hp < hp); assert.equal(outlet.inPlay, true);
  assert.deepEqual(r.snapshot(), f.snapshot());
});

test("healing, shielding and mortar interception spend the existing partial-hit budget", () => {
  const f = fixture(), a = f.place(), plus = f.place("+", 2), minus = f.place("-", 2, 2), shield = f.place("*", 2, 4);
  f.edge(1); f.edge(1, 3, ">", "vertical"); f.edge(1, 2); f.edge(1, 2, "<", "vertical"); f.edge(1, 4);
  const b = f.place("B", 3); b.hp -= 500;
  plus.projectileNode.input.push({ ...f.shot(a), remainingRange: 0 }); f.tick();
  assert.equal(b.hp, b.maxHp - 260); assert.equal(plus.projectileNode.input.length, 0);
  shield.projectileNode.input.push({ ...f.shot(a), remainingRange: 0 });
  assert.equal(f.circuit.absorbDamage(b, 150, "magic"), 0);
  assert.equal(projectileDamageBudget(shield.projectileNode.input[0]), 750);
  assert.equal(shield.projectileNode.input[0].partialHitDamage, 350);
  assert.equal(f.circuit.absorbDamage(b, 100, "physical"), 100);
  minus.projectileNode.input.push({ ...f.shot(a), remainingRange: 0 });
  const mortar = projectiles.createMortarProjectileState({ owner: "enemy", fromX: minus.x, fromY: minus.y,
    targetX: minus.x, targetY: minus.y, damage: 900, damageType: "magic", rangeX: 50, rangeY: 50 });
  assert.equal(f.circuit.intercept(mortar, mortar), false); assert.equal(projectileDamageBudget(mortar), 660);
  assert.equal(minus.projectileNode.input.length, 0); assert.equal("body" in mortar, false);
});

test("routed skill and reflection execute real pure skills and projectile factories", () => {
  const f = fixture(), source = f.place("w", 1), outlet = f.place("1", 2); f.edge(1);
  source.skills.airPatrol.sp = 10; f.skills.activateAirPatrolTower(source);
  assert.equal(source.flyingUntil, 0); f.tick(); assert.ok(outlet.flyingUntil > f.state.battleTime);
  assert.equal(outlet.pipelineSkillContexts.w.level, 1);
  const reflection = { x: source.x, y: source.y, vx: -300,
    damage: 600, damageType: "magic", hitCount: 3, partialHitDamage: 200, sourceLane: 3 };
  assert.equal(f.circuit.captureAction(source, { kind: "reflection", projectile: reflection }), true);
  f.tick(); assert.equal(f.state.projectiles.length, 1);
  assert.equal(projectileDamageBudget(f.state.projectiles[0]), 1400);
  assert.equal(f.state.projectiles[0].sourceTower, source);
});

test("routed storage pays self damage at its source, not a second time at its outlet", () => {
  const f = fixture(), source = f.place("q", 1), outlet = f.place("1", 3); f.edge(1); f.edge(2);
  f.enemy(source.x, 3, "triangle"); const remote = f.enemy(outlet.x, 3, "triangle");
  const hp = source.hp, outputHp = outlet.hp;
  assert.equal(routePipelineTowerAction(source, { kind: "attack" }, f.circuit, f.combat, getCardDefinition), true);
  assert.equal(source.hp, hp - 400); f.tick();
  assert.equal(remote.inPlay, false); assert.equal(outlet.hp, outputHp);
});

test("logical topology, edge budgets and saved routing remain isolated across worlds", () => {
  const make = () => {
    const f = fixture(), source = f.place(), bank = f.place("0", 2), swap = f.place("&", 3), outlet = f.place("1", 9, 0, 7);
    swap.topologyTarget = { lane: 0, column: 9 }; f.edge(1); f.edge(2); f.refresh();
    for (let i = 0; i < 25; i++) assert.equal(f.circuit.capture(f.shot(source)), true);
    assert.equal(f.circuit.capture(f.shot(source)), false);
    return { f, bank, outlet };
  };
  const a = make(), b = make(), r = fixture(decodeSaveGraph(a.f.snapshot(), () => ({})));
  for (let i = 0; i < 120; i++) {
    a.f.tick(); b.f.tick(); r.tick();
    if (i % 10 === 0) assert.deepEqual(a.f.snapshot(), r.snapshot());
  }
  assert.deepEqual(a.f.snapshot(), b.f.snapshot());
  assert.equal(a.f.state.projectiles.length, 21); assert.equal(a.bank.projectileBank.shots.length, 0);
  assert.equal(a.outlet.projectileNode.input.length, 4);
});
