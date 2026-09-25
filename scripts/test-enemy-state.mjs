import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// No engine or render stubs: data construction and queries must load headlessly.
const load = createTypeScriptLoader();
const { createEnemyState, enemyBaseStatsFromDefinition } = load("src/game/enemyState.ts");
const rules = load("src/game/enemyCombatRules.ts");
const registry = load("src/registry/enemies.ts");
const effects = load("src/game/rules/statusEffectRules.ts");
const { BOARD_Y, CELL_HEIGHT, CELL_WIDTH, LANES, ENEMY_SPEED, ENEMY_SPEED_VARIANCE } = load("src/config.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { encodeSaveGraph, decodeSaveGraph } = load("src/game/saveGraph.ts");
const options = (kind, extra = {}) => ({ kind, lane: 3, x: 1100, time: 2500,
  waveNumber: 21, waveWeight: 123, finalDamageReduction: .3, ...extra });
const enemy = (kind = "circle", extra = {}) => createEnemyState(options(kind, extra), () => .5);
const kinds = [...Object.keys(registry.allEnemyDefinitions),
  ...Object.keys(load("src/data/enemyArchetypes.ts").enemyArchetypes)
    .filter(family => family !== "solarBomb").map(family => registry.enemyKindAtRank(family, 10000))];

test("all enemy families and dynamic ranks construct independent base/final panels without visuals", () => {
  for (const kind of kinds) {
    const definition = registry.getEnemyDefinition(kind), state = enemy(kind, { environmentHpMultiplier: 1.7 });
    const speed = ENEMY_SPEED * (definition.speedMultiplier ?? 1);
    const base = enemyBaseStatsFromDefinition(definition, { speed, attackSpeed: rules.enemyAttackSpeed(kind), finalDamageReduction: .3 });
    assert.deepEqual(state.baseStats, base, kind);
    assert.deepEqual(state.finalStats, { ...base, maxHp: definition.hp * 1.7 }, kind);
    assert.notEqual(state.baseStats, state.finalStats);
    assert.equal(state.hp, state.maxHp); assert.equal(state.hp, definition.hp * 1.7);
    assert.equal(state.attackAt, 2500 + base.attackInterval);
    assert.equal(state.damage, definition.damage); assert.equal(state.damageType, definition.damageType);
    assert.equal(state.weight, 123); assert.equal(state.waveNumber, 21);
    assert.equal(state.inPlay, true); assert.equal(state.nextHasteTrailAt, 2500);
    assert.equal("body" in state, false); assert.equal("statusMultiplierCache" in state, false);
    assert.deepEqual(Object.keys(state), Object.keys(enemy()), "legacy initialization order stays stable");
  }
});

test("enemy speed variance consumes exactly one injected draw except for leaders and solar bombs", () => {
  for (const kind of kinds) for (const value of [0, .5, 1]) {
    let calls = 0;
    const state = createEnemyState(options(kind), () => { calls++; return value; });
    const fixed = registry.enemyIsLeader(kind) || kind === "solarBomb";
    const base = ENEMY_SPEED * (registry.getEnemyDefinition(kind).speedMultiplier ?? 1);
    assert.equal(calls, fixed ? 0 : 1, kind);
    assert.equal(state.speed, fixed ? base : base * (1 - ENEMY_SPEED_VARIANCE + value * 2 * ENEMY_SPEED_VARIANCE), kind);
  }
});

test("special spawn coordinates, timer sentinels and facing overrides remain unchanged", () => {
  const ordinary = enemy("triangle", { lane: 2 });
  assert.equal(ordinary.y, BOARD_Y + 2.5 * CELL_HEIGHT); assert.equal(ordinary.lane, 2);
  for (const lane of [0, 3, LANES - 1]) {
    const wave = enemy("tilde3", { lane });
    assert.equal(wave.y, BOARD_Y + (Math.min(LANES - 2, lane) + 1) * CELL_HEIGHT);
    assert.equal(wave.oscillationCenterY, wave.y); assert.equal(wave.oscillationLastY, wave.y);
    assert.equal(wave.oscillationPhase, 0);
  }
  assert.equal(ordinary.oscillationCenterY, undefined);
  assert.equal(enemy("burrowArrow").burrowAt, 8500);
  assert.deepEqual(enemy("burrowArrow").burrowCargo, []);
  assert.equal(ordinary.burrowCargo, undefined);
  assert.equal(enemy("hexMace", { movementDirection: 1 }).maceFacingDirection, 1);
  assert.equal(enemy("hexMace", { movementDirection: 1, maceFacingDirection: -1 }).maceFacingDirection, -1);
  assert.equal(enemy("slopeTriangle", { movementDirection: 1 }).slopeFacingDirection, 1);
  assert.equal(enemy("solarBomb", { movementDirection: 1 }).solarBombVelocityX, enemy("solarBomb").speed);
  assert.equal(enemy("solarBomb").solarBombVelocityY, 0);
  assert.equal(enemy("chevronLeader").ionChargeMs, 0);
  assert.equal(enemy("chevronLeader").chevronAssault, false);
});

test("archangels start with permanent flight and a separate three-second high-flight effect", () => {
  const state = enemy("archangelHeptagon3");
  assert.deepEqual(state.statusEffects, [
    { name: "flying", expiresAt: Infinity, speedMultiplier: 1, showHalo: false },
    { name: "highFlying", expiresAt: 5500, speedMultiplier: 2.5, attackMultiplier: undefined,
      showHalo: false, physicalDamageTaken: undefined }
  ]);
  assert.equal(rules.enemyIsHighFlying(state), true);
  assert.equal(effects.expireStatusEffects(state, 5499), false);
  assert.equal(effects.expireStatusEffects(state, 5500), true);
  assert.equal(rules.enemyIsHighFlying(state), false);
  assert.equal(effects.hasStatusEffectName(state, "flying"), true);
});

test("skill, status, cargo and panel state is never shared between spawns", () => {
  const a = enemy("archangelHeptagon"), b = enemy("archangelHeptagon");
  a.skills.ascension.sp = 0; a.statusEffects[0].expiresAt = 1;
  a.baseStats.maxHp = 1; a.finalStats.maxHp = 2;
  assert.equal(b.skills.ascension.sp, 10); assert.equal(b.statusEffects[0].expiresAt, Infinity);
  assert.equal(b.baseStats.maxHp, registry.getEnemyDefinition(b.kind).hp);
  assert.equal(b.finalStats.maxHp, b.baseStats.maxHp);
  const c = enemy("burrowArrow"), d = enemy("burrowArrow");
  c.burrowCargo.push(a); assert.deepEqual(d.burrowCargo, []);
  assert.deepEqual(enemy("hexagon").skills, {}); assert.deepEqual(enemy("heart").skills, {});
  assert.equal(enemy("angelPentagon2").skills.wings.sp, 2);
  assert.equal(enemy("angelPentagon2").skills.wings.regenMultiplier, 1.2);
});

test("combat queries preserve attack modes, shot counts, exact deadlines and leader exclusions", () => {
  for (const kind of kinds) {
    const state = enemy(kind), registration = registry.getEnemyRegistration(kind);
    const ranged = ["ranged", "mortar", "laser"].includes(registration.attackMode);
    assert.equal(rules.shouldEnemyShoot(state, state.attackAt - 1), false, kind);
    assert.equal(rules.shouldEnemyShoot(state, state.attackAt), ranged, kind);
    assert.equal(rules.enemyVolleyShotCount(state), ranged ? registration.rank : 1, kind);
    const cannotMelee = ranged || ["blockedDetonator", "siegeRam", "mace", "companion"].includes(registration.attackMode)
      || ["heart", "slopeTriangle", "chevronLeader", "solarBomb"].includes(registration.family);
    assert.equal(rules.canEnemyMelee(state), !cannotMelee, kind);
    assert.equal(rules.enemyIgnoresLeaderRestrictedMechanics(state), registry.enemyIsLeader(kind) || kind === "solarBomb", kind);
  }
});

test("high-flight queries inherit carriers and do not implicitly expire effects or path sentinels", () => {
  const passenger = enemy(), carrier = enemy("parentheses");
  passenger.parenthesisCarrier = carrier;
  carrier.highFlightUntil = 0;
  assert.equal(rules.enemyIsHighFlying(passenger), true);
  carrier.highFlightUntil = undefined;
  effects.refreshStatusEffect(carrier, "highFlying", 0);
  assert.equal(rules.enemyIsHighFlying(passenger), true);
  effects.expireStatusEffects(carrier, 0); assert.equal(rules.enemyIsHighFlying(passenger), false);
  effects.refreshStatusEffect(passenger, "highFlying", 1000);
  assert.equal(rules.enemyIsHighFlying(passenger), false, "the carrier owns airborne status while boarded");
  passenger.parenthesisCarrier = undefined; assert.equal(rules.enemyIsHighFlying(passenger), true);
  passenger.burrowed = true; assert.equal(rules.enemyIsBurrowed(passenger), true);
});

test("siege acceleration preserves distance clamping and base speed for ordinary enemies", () => {
  const ram = enemy("triangleRam3");
  for (const cells of [-2, 0, 3.5, 7, 100]) {
    ram.x = ram.spawnX - cells * CELL_WIDTH;
    assert.equal(rules.siegeRamSpeed(ram), ram.baseStats.speed * Math.sqrt(1 + 15 * Math.max(0, Math.min(1, cells / 7))));
  }
  assert.equal(rules.siegeRamSpeed(enemy()), enemy().baseStats.speed);
});

class Visual {}
const visualKeys = ["body", "shape", "statusBorder", "frozenBorder", "powerIcon", "sunderIcon",
  "armorIcon", "magicResistanceIcon", "flyingHalo", "statusMultiplierCache"];
function fixture() {
  const carrier = enemy("parentheses"), passenger = enemy("tilde"), arrow = enemy("burrowArrow");
  const owner = enemy("equals3"), member = enemy("triangleRam3"), companion = enemy("dodecahedronCompanion2");
  for (const unit of [carrier, passenger, arrow, owner, member, companion]) {
    Object.assign(unit, Object.fromEntries(visualKeys.map(key => [key, new Visual()])));
  }
  carrier.parenthesisCargo = [passenger]; carrier.parenthesisHpBonus = 1000;
  passenger.parenthesisCarrier = carrier;
  arrow.burrowCargo = [member]; member.inPlay = false;
  owner.healthLinksInitialized = true;
  owner.healthPool = member.healthPool = { owner, members: [owner, member], hp: 123, maxHp: 5000 };
  Object.assign(carrier, { highFlightStartedAt: 1000, highFlightUntil: 3000,
    highFlightStartX: 1100, highFlightStartY: 400, highFlightTargetX: 500, highFlightTargetY: 400, highFlightPeakHeight: 100 });
  Object.assign(companion, { bossOrbitAngle: 1, bossOrbitRadius: 2, bossCompanionIndex: 3,
    bossCompanionNextActionAt: 9000, bossCompanionActionPhase: "mortar", blockedByTowerId: "tower:1", blockedSince: 2000 });
  return { enemies: [carrier, arrow, owner, companion], actions: [{ target: member, source: passenger }] };
}
function legacyCapture(state) {
  return encodeSaveGraph(state, value => "kind" in value && "waveNumber" in value
    ? { kind: "enemy", omit: new Set(visualKeys) } : { kind: Array.isArray(value) ? "array" : "object" });
}

test("explicit enemy snapshots preserve legacy graph order, optional state and cyclic references", () => {
  const state = fixture();
  assert.equal(JSON.stringify(captureBattleSnapshot(state)), JSON.stringify(legacyCapture(state)));
  const graph = JSON.parse(JSON.stringify(legacyCapture(state)));
  const restored = decodeSaveGraph(graph, () => ({}));
  const [carrier, arrow, owner, companion] = restored.enemies;
  assert.equal(carrier.parenthesisCargo[0].parenthesisCarrier, carrier);
  assert.equal(arrow.burrowCargo[0].healthPool, owner.healthPool);
  assert.equal(owner.healthPool.owner, owner);
  assert.equal(owner.healthPool.members[1], arrow.burrowCargo[0]);
  assert.equal(restored.actions[0].target, arrow.burrowCargo[0]);
  assert.equal(restored.actions[0].source, carrier.parenthesisCargo[0]);
  assert.equal(companion.bossCompanionActionPhase, "mortar");
  assert.equal(carrier.highFlightUntil, 3000);
  assert.equal(JSON.stringify(captureBattleSnapshot(restored)), JSON.stringify(graph));
});

test("enemy renderer caches cannot enter snapshots and capture also accepts pure states", () => {
  const state = fixture(), expected = JSON.stringify(captureBattleSnapshot(state));
  for (const unit of [...state.enemies, state.enemies[0].parenthesisCargo[0], state.enemies[1].burrowCargo[0]]) {
    const cache = new Visual(); cache.self = cache;
    unit.futureRenderCache = cache; unit.onDraw = () => {};
    for (const key of visualKeys) delete unit[key];
  }
  assert.equal(JSON.stringify(captureBattleSnapshot(state)), expected);
  const plain = { enemies: [enemy("archangelHeptagon")] };
  const restored = decodeSaveGraph(JSON.parse(JSON.stringify(captureBattleSnapshot(plain))), () => ({}));
  assert.equal(restored.enemies[0].statusEffects[0].expiresAt, Infinity);
});
