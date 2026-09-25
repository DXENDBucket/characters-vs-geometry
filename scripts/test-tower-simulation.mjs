import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// Real state factories and damage rules: no Phaser, browser globals or gameplay mocks.
const load = createTypeScriptLoader();
const { advanceTowerAttacks, executeTowerVolley } = load("src/game/towerCombat.ts");
const { cardBehaviorsById } = load("src/game/cardBehaviorRules.ts");
const { TowerSkillSimulation } = load("src/game/towerSkillSimulation.ts");
const { triggerShockTower, executeShockPulse } = load("src/game/triggerTowerRules.ts");
const { NO_TOWER_COMBAT_PRESENTATION } = load("src/game/towerCombatPresentation.ts");
const { NO_TOWER_SKILL_PRESENTATION } = load("src/game/towerSkillPresentation.ts");
const { NO_TRIGGER_TOWER_PRESENTATION } = load("src/game/triggerTowerPresentation.ts");
const { NO_UNIT_LIFECYCLE_PRESENTATION } = load("src/game/unitLifecyclePresentation.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { createEnemyState } = load("src/game/enemyState.ts");
const { createBossState } = load("src/game/bossState.ts");
const { createTowerProjectileState, createHomingTowerProjectileState, createMortarProjectileState } = load("src/game/projectileState.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { syncTowerOccupancy } = load("src/game/towerOccupancy.ts");
const { applyStatusEffect } = load("src/game/statusEffects.ts");
const { refreshStatusEffect } = load("src/game/rules/statusEffectRules.ts");
const { getTowerSkillState } = load("src/game/skillState.ts");
const { towerAttackAmount } = load("src/game/unitStatRules.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const life = load("src/game/unitLifecycle.ts");
const tower = (id = "A", column = 3, lane = 3) => createTowerState(getCardDefinition(id), lane, column, 0, lane * 100 + column);
const enemy = (kind = "triangle", column = 7, lane = 3) => createEnemyState({
  kind, lane, x: tower("B", column, lane).x, waveNumber: 1, waveWeight: 10, time: 0, finalDamageReduction: 0
}, () => .5);

function fixture(towers = [], enemies = [], boss = null) {
  const events = [], pending = [], data = { towers, enemies, boss, projectiles: [], enemyProjectiles: [],
    mortarProjectiles: [], occupied: new Map(), battleTime: 0, gameOver: false, battlePaused: false };
  syncTowerOccupancy(towers, data.occupied);
  const lifecycle = { ...data, presentation: NO_UNIT_LIFECYCLE_PRESENTATION, finalDamageReduction: 0, bossPhaseIndex: 0,
    getBoss: () => data.boss, setBoss: boss => { data.boss = boss; },
    getWaveTracker() {}, onEnemyDefeated() {}, onTowerDamaged() {}, endLevel() {},
    onTowerRemoved: unit => events.push(["removed", unit.id]) };
  const common = { ...data, get battleTime() { return data.battleTime; },
    getDefinition: getCardDefinition, scheduleBattleAction: (delay, action) => pending.push({ delay, action }),
    damageEnemy: (e, amount, type, source) => life.damageEnemy(lifecycle, e, amount, type, source),
    damageBoss: (amount, type, part) => life.damageBoss(lifecycle, amount, type, part),
    damageTower: (t, amount, type) => life.damageTower(lifecycle, t, amount, type),
    removeTower: t => life.removeTower(lifecycle, t) };
  const combat = { ...common, presentation: NO_TOWER_COMBAT_PRESENTATION,
    createProjectile: createTowerProjectileState, createHomingProjectile: createHomingTowerProjectileState,
    createMortar: createMortarProjectileState, storeBlockedEnemies: t => events.push(["store", t.id]),
    gainChars: amount => events.push(["chars", amount]),
    spawnTower: (id, lane, column, level, facingDirection) => {
      const t = tower(id, column, lane); Object.assign(t, { level, facingDirection }); towers.push(t);
      syncTowerOccupancy(towers, data.occupied); return t;
    } };
  const skillRuntime = { ...common, presentation: NO_TOWER_SKILL_PRESENTATION };
  const skills = new TowerSkillSimulation(() => skillRuntime);
  const trigger = { ...common, presentation: NO_TRIGGER_TOWER_PRESENTATION };
  const fire = (t, hits = 1) => cardBehaviorsById[t.copiedType ?? t.type].execute(t, getCardDefinition(t.copiedType ?? t.type), combat, hits);
  return { data, combat, skills, skillRuntime, trigger, pending, events, fire };
}

test("actual tower volleys compress timing without merging per-hit damage or stale copied actions", () => {
  const a = tower(), e = enemy(), f = fixture([a], [e]); a.level = 7;
  advanceTowerAttacks(f.combat, 1000);
  assert.deepEqual(f.pending.map(p => p.action.hitCount), [2, 2, 1, 1, 1]);
  for (const { action } of f.pending) executeTowerVolley(f.combat, action);
  assert.equal(f.data.projectiles.length, 5);
  assert.deepEqual(f.data.projectiles.map(p => p.hitCount), [2, 2, 1, 1, 1]);
  assert.ok(f.data.projectiles.every(p => p.damage === towerAttackAmount(a, getCardDefinition("A")) && !("body" in p)));
  a.copyRevision = 1;
  executeTowerVolley(f.combat, f.pending[0].action);
  assert.equal(f.data.projectiles.length, 5);
});

test("an unavailable attack interval cannot become ready through infinity arithmetic", () => {
  const a = tower(), f = fixture([a], [enemy()]);
  a.finalStats.attackSpeed = undefined;
  advanceTowerAttacks(f.combat, 1000);
  assert.equal(f.pending.length, 0);
  assert.equal(a.lastFire, -Infinity);
});

test("homing targets prefer the closest regular flier to the source and also support Boss parts", () => {
  const a = tower("x"), near = enemy("triangle", 4), far = enemy("triangle", 8), high = enemy("triangle", 5);
  applyStatusEffect(far, "flying", 10000, 0); applyStatusEffect(high, "highFlying", 10000, 0);
  const f = fixture([a], [near, far, high]); f.fire(a);
  assert.equal(f.data.projectiles.length, 4);
  assert.ok(f.data.projectiles.every(p => p.targetEnemy === far && p.acceleration > 0));
  const boss = createBossState("octahedron", 0);
  const b = fixture([a], [], boss); b.fire(a);
  assert.ok(b.data.projectiles.every(p => p.targetBossPart === boss));
});

test("magic lasers stop at resistance, preserve debuffs and isolate nested-world targeting buffers", () => {
  const a = tower("d"), first = enemy("triangle", 5), stop = enemy("trapezoid", 6), behind = enemy("triangle", 7);
  const f = fixture([a], [first, stop, behind]), other = fixture([tower("d")], [enemy("triangle", 8)]);
  const damage = f.combat.damageEnemy, seen = [];
  f.combat.damageEnemy = (...args) => { seen.push(args[0]); other.fire(other.data.towers[0]); return damage(...args); };
  const hp = behind.hp; f.fire(a);
  assert.deepEqual(seen, [first, stop]);
  assert.equal(behind.hp, hp);
  assert.ok(first.statusEffects.some(s => s.name === "sunder"));
  assert.ok(stop.statusEffects.some(s => s.name === "sunder"));
});

test("production, area healing and reversed summoning work through pure runtime ports", () => {
  const producer = tower("X", 0), healer = tower("e"), ally = tower("B", 4), summoner = tower("s", 8);
  const f = fixture([producer, healer, ally, summoner]); ally.hp -= 500;
  f.fire(producer); assert.ok(f.events.some(([kind, amount]) => kind === "chars" && amount > 0));
  const hp = ally.hp; f.fire(healer); assert.ok(ally.hp > hp);
  summoner.level = 3; summoner.facingDirection = -1;
  f.combat.isCellDeployable = (_lane, column) => column !== 7;
  f.fire(summoner);
  const child = f.data.towers.at(-1);
  assert.equal(child.type, "a"); assert.equal(child.column, 6); assert.equal(child.level, 3); assert.equal(child.facingDirection, -1);
});

test("one-shot routed effects consume their source without applying a second local effect", () => {
  for (const routed of [false, true]) {
    const a = tower("F"), e = enemy("triangle", 4), f = fixture([a], [e]), hp = e.hp;
    f.trigger.onTowerAction = () => routed;
    triggerShockTower(f.trigger, a);
    assert.equal(a.inPlay, false);
    assert.deepEqual(f.events[0], ["removed", a.id]);
    if (routed) { assert.equal(f.pending.length, 0); assert.equal(e.hp, hp); }
    else {
      assert.ok(f.pending.length > 0);
      for (const { action } of f.pending) executeShockPulse(f.trigger, action);
      assert.ok(e.hp < hp);
    }
  }
});

test("bodyless skill activation, expiry and movement completion use the current presentation port", () => {
  const units = ["w", "o", "j", "#"].map((id, i) => tower(id, i)), f = fixture(units);
  let viewed = 0;
  f.skillRuntime.presentation = { ...NO_TOWER_SKILL_PRESENTATION, borderAlpha: () => viewed++ };
  f.skills.update(10, 10000); assert.ok(viewed > 0);
  f.skillRuntime.presentation = NO_TOWER_SKILL_PRESENTATION; const previous = viewed;
  for (const t of units.slice(0, 3)) assert.equal(f.skills.activateManualSkills([t], t.type, null), "handled");
  assert.equal(units[0].flyingUntil, 10000);
  units[3].moveVisual = { fromX: 0, fromY: 0, startedAt: 0, duration: 500 };
  f.skills.update(0, 10001);
  assert.equal(units[0].flyingUntil, 0); assert.equal(units[3].moveVisual, undefined);
  assert.equal(viewed, previous);
  assert.ok(units.every(t => !("body" in t)));
});

test("guardian uses real tower health and preserves full charge until healing is needed", () => {
  const h = tower("h"), b = tower("B", 4), f = fixture([h, b]);
  f.skills.update(20, 20000); assert.equal(h.skills.guardian.sp, 20);
  b.hp = 100; f.skills.update(1, 21000);
  assert.equal(h.skills.guardian.sp, 0); assert.ok(b.hp > 100);
});

test("in-flight skill mortars survive source removal and graph snapshot restoration without views", () => {
  const s = tower("S"), e = enemy("trapezoid", 7), f = fixture([s], [e]);
  getTowerSkillState(s, "spellMortar").sp = 30;
  assert.equal(f.skills.activateManualSkills([s], "S", { x: e.x, y: e.y }), "handled");
  assert.deepEqual(f.pending.map(p => p.delay), [0, 500, 1000]);
  f.skills.launchSpellMortar(f.pending[0].action); f.skills.update(.5, 500);
  s.inPlay = false;
  const saved = decodeSaveGraph(captureBattleSnapshot({ towers: [s], enemies: [e], flights: f.skills.snapshotFlights() }), () => ({}));
  const restored = fixture(saved.towers, saved.enemies);
  for (const flight of saved.flights) restored.skills.restoreSpellMortarFlight(flight);
  const hp = e.hp, restoredEnemy = saved.enemies[0];
  f.skills.update(3, 3500); restored.skills.update(3, 3500);
  assert.ok(e.hp < hp);
  assert.equal(restoredEnemy.hp, e.hp);
  assert.equal(restoredEnemy.inPlay, e.inPlay);
  assert.deepEqual(restored.skills.snapshotFlights(), f.skills.snapshotFlights());
});

test("refreshing a restored status keeps modifier values and serialized field order identical", () => {
  for (const name of ["sunder", "frozen", "flying", "haste", "power"]) {
    const unit = { statusEffects: [] };
    refreshStatusEffect(unit, name, 1000);
    const restored = decodeSaveGraph(captureBattleSnapshot(unit), () => ({}));
    const originalEffect = restored.statusEffects[0];
    refreshStatusEffect(unit, name, 2000);
    refreshStatusEffect(restored, name, 2000);
    assert.equal(restored.statusEffects[0], originalEffect);
    assert.equal(JSON.stringify(captureBattleSnapshot(restored)), JSON.stringify(captureBattleSnapshot(unit)), name);
  }
});
