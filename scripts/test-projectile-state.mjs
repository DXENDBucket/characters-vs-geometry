import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// No Phaser, DOM or rendering overrides: construction and capture must remain headless.
const load = createTypeScriptLoader();
const { createTowerProjectileState, createHomingTowerProjectileState, createMortarProjectileState,
  reflectedProjectileSpec } = load("src/game/projectileState.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { encodeSaveGraph, decodeSaveGraph } = load("src/game/saveGraph.ts");
const { consumeProjectileDamage, projectileDamageBudget, forEachProjectileHit } = load("src/game/projectileIntegrity.ts");
const { withTowerActionContext } = load("src/game/towerIdentity.ts");

const spec = (extras = {}) => ({ type: "bolt", x: 120, y: 240, lane: 2, speed: 430,
  damage: 350, damageType: "physical", splashRadius: 0, angleDegrees: 0, maxX: Infinity, ...extras });
function legacyTowerState(s) {
  const angle = s.angleDegrees * (Math.PI / 180);
  return {
    type: s.type, hitCount: s.hitCount ?? 1, partialHitDamage: s.partialHitDamage, initialDamageBudget: s.initialDamageBudget,
    lane: s.lane, x: s.x, y: s.y, vx: Math.cos(angle) * s.speed, vy: Math.sin(angle) * s.speed,
    damage: s.damage, damageType: s.damageType, debuff: s.debuff, debuffDuration: s.debuffDuration,
    splashRadius: s.splashRadius, maxX: s.maxX, limitDirection: s.limitDirection ?? (Math.cos(angle) < 0 ? -1 : 1),
    sourceTower: s.sourceTower, sourceBehaviorType: undefined
  };
}
function legacyCapture(state) {
  return encodeSaveGraph(state, object => {
    if (object.id?.startsWith("tower:")) return { kind: "tower", omit: new Set(["body", "border", "label"]) };
    if ("kind" in object && "waveNumber" in object) return { kind: "enemy", omit: new Set(["body", "statusMultiplierCache"]) };
    if ("advanceMinionKind" in object && "rank" in object) return { kind: "boss", omit: new Set(["body", "frame", "labelText"]) };
    if ("body" in object) return { kind: "owner" in object ? "mortar" : "sourceLane" in object ? "enemyProjectile" : "projectile", omit: new Set(["body"]) };
    return { kind: Array.isArray(object) ? "array" : "object" };
  });
}
class Visual { callback() {} }
const visual = () => { const v = new Visual(); v.parent = v; return v; };

function fixture() {
  const tower = { id: "tower:A:1", type: "A", inPlay: false, body: visual(), border: visual(), label: visual() };
  const enemy = { kind: "circle", waveNumber: 1, x: 500, y: 260, body: visual(), statusMultiplierCache: { stale: true } };
  const boss = { kind: "octahedron", rank: 2, advanceMinionKind: "square", x: 900, y: 200,
    body: visual(), frame: visual(), labelText: visual() };
  const shot = Object.assign(createTowerProjectileState(spec({ sourceTower: tower, hitCount: 3 })), {
    body: visual(), circuitChecked: true, lastGatheredAt: 300, targetEnemy: enemy
  });
  consumeProjectileDamage(shot, 120);
  const homing = Object.assign(createHomingTowerProjectileState({ ...spec({ damageType: "magic" }),
    acceleration: 160, maxSpeed: 1100, targetBossPart: boss, sourceTower: tower }), { body: visual() });
  const enemyShot = { x: 880, y: 100, vx: -430, damage: 450, damageType: "magic", sourceLane: 1,
    appearance: "ion", splashRadius: 180, hitCount: 2, lastGatheredAt: 700, body: visual() };
  consumeProjectileDamage(enemyShot, 300);
  const mortar = Object.assign(createMortarProjectileState({ owner: "enemy", fromX: 800, fromY: 300,
    targetX: 100, targetY: 200, damage: 800, damageType: "magic", rangeX: 70, rangeY: 70,
    marker: "text", markerText: "#", markerTextColor: "#00ffff", sourceEnemy: enemy, targetTower: tower,
    sourceTower: tower, targetEnemy: enemy, hitCount: 3, singleTarget: true, hitRadius: 40,
    radialFalloff: true, debuff: "slow", debuffDuration: 3000 }), { body: visual(), shiftSelfDamageApplied: true });
  mortar.progress = .45;
  consumeProjectileDamage(mortar, 1250);
  tower.storedShots = [{ type: "bolt", sourceTower: tower, sourceBehaviorType: "H", hitCount: 2,
    vx: 430, vy: 0, damage: 400, damageType: "magic", splashRadius: 0, remainingRange: Infinity,
    action: { event: { projectile: enemyShot, mortar }, baseDamage: 800 } }];
  // The source is no longer in play; it and the stored reflection must retain shared identity.
  return { towers: [], enemies: [enemy], boss, projectiles: [shot, homing], enemyProjectiles: [enemyShot],
    mortarProjectiles: [mortar], actions: [{ source: tower }], battleTime: 1000 };
}

test("headless tower projectile construction preserves legacy field order, exact angles and optional judgments", () => {
  for (const type of ["bolt", "star", "hash", "dollar", "shell", "chevron"]) {
    for (const angleDegrees of [-360, -179, -30, 0, 30, 90, 180, 360]) {
      for (const speed of [0, 430]) {
        const s = spec({ type, angleDegrees, speed, hitCount: 3, partialHitDamage: 125,
          initialDamageBudget: 1050, debuff: "slow", debuffDuration: 3000 });
        const actual = createTowerProjectileState(s), expected = legacyTowerState(s);
        assert.deepEqual(actual, expected);
        assert.deepEqual(Object.keys(actual), Object.keys(expected));
        assert.equal("body" in actual, false);
      }
    }
  }
  assert.equal(createTowerProjectileState(spec()).hitCount, 1);
  assert.equal(createTowerProjectileState(spec({ hitCount: 0 })).hitCount, 0);
  assert.equal(createTowerProjectileState(spec({ angleDegrees: 180, limitDirection: 1 })).limitDirection, 1);
});

test("copied towers and routed actions retain the behavior at firing time without changing the source", () => {
  const source = { type: "@", copiedType: "E" };
  const shot = createTowerProjectileState(spec({ sourceTower: source }));
  source.copiedType = "A";
  assert.equal(shot.sourceBehaviorType, "E");
  assert.equal(shot.sourceTower, source);
  const output = { type: "1" };
  const routed = withTowerActionContext(output, { type: "M", level: 3, stats: {} },
    () => createTowerProjectileState(spec({ sourceTower: output })));
  assert.equal(routed.sourceBehaviorType, "M");
  assert.equal(routed.sourceTower, output);
  assert.equal(createTowerProjectileState(spec({ sourceTower: output })).sourceBehaviorType, undefined);
});

test("homing construction preserves enemy/Boss references, initial direction and acceleration", () => {
  const enemy = { x: 490, y: 120 }, boss = { x: 210, y: 470 };
  for (const targets of [{}, { targetEnemy: enemy }, { targetBossPart: boss }, { targetEnemy: enemy, targetBossPart: boss }]) {
    const s = { ...spec(), ...targets, acceleration: 140, maxSpeed: 900 };
    const shot = createHomingTowerProjectileState(s);
    const target = targets.targetEnemy ?? targets.targetBossPart;
    const degrees = (target ? Math.atan2(target.y - s.y, target.x - s.x) : 0) * (180 / Math.PI);
    assert.deepEqual(shot, { ...legacyTowerState({ ...s, type: "chevron", angleDegrees: degrees, limitDirection: 1 }),
      targetEnemy: targets.targetEnemy, targetBossPart: targets.targetBossPart, speed: s.speed, acceleration: 140, maxSpeed: 900 });
    assert.equal(shot.targetEnemy, targets.targetEnemy);
    assert.equal(shot.targetBossPart, targets.targetBossPart);
  }
});

test("mortar state retains optional targeting, trajectory and damage fields without visuals", () => {
  for (const owner of ["tower", "enemy"]) {
    const s = { owner, fromX: 120, fromY: 200, targetX: 540, targetY: 350, damage: 500, damageType: "magic",
      rangeX: 70, rangeY: 80, marker: "text", markerText: "#", markerTextColor: "#00ffff",
      sourceEnemy: {}, sourceTower: {}, targetEnemy: {}, targetTower: {}, hitCount: 3,
      partialHitDamage: 250, initialDamageBudget: 1500, singleTarget: false, hitRadius: 40,
      radialFalloff: true, debuff: "slow", debuffDuration: 1000 };
    const shot = createMortarProjectileState(s);
    for (const [key, value] of Object.entries(s)) assert.equal(shot[key], value, key);
    assert.equal(shot.duration, 3240);
    assert.equal(shot.progress, 0);
    assert.equal(shot.x, s.fromX); assert.equal(shot.y, s.fromY);
    assert.equal("body" in shot, false);
    assert.equal(createMortarProjectileState({ ...s, duration: 900 }).duration, 900);
  }
});

test("reflection retains partial multi-hit judgments, explosion budget and direction limits", () => {
  const source = { type: "H" };
  for (const vx of [-430, 430]) {
    for (const splashRadius of [0, 180]) {
      const incoming = { x: 220, y: 100, sourceLane: 1, vx, splashRadius, damage: 400, damageType: "magic", hitCount: 4 };
      consumeProjectileDamage(incoming, 550);
      const reflected = createTowerProjectileState(reflectedProjectileSpec(incoming, "true", source));
      assert.equal(projectileDamageBudget(reflected), 1050);
      const hits = []; forEachProjectileHit(reflected, damage => hits.push(damage));
      assert.deepEqual(hits, [250, 400, 400]);
      assert.equal(reflected.initialDamageBudget, 1600);
      assert.equal(reflected.vx, -vx);
      assert.equal(reflected.limitDirection, vx < 0 ? 1 : -1);
      assert.equal(reflected.maxX, vx < 0 ? Infinity : -Infinity);
      assert.equal(reflected.type, splashRadius ? "shell" : "bolt");
      assert.equal(reflected.splashRadius, splashRadius);
      assert.equal(reflected.damageType, "true");
      assert.equal(reflected.sourceTower, source);
      assert.equal(incoming.damageType, "magic");
    }
  }
});

test("explicit projectile snapshot fields preserve the legacy graph byte for byte", () => {
  const state = fixture();
  assert.equal(JSON.stringify(captureBattleSnapshot(state)), JSON.stringify(legacyCapture(state)));
});

test("projectile snapshots ignore new display caches and work without projectile bodies", () => {
  const state = fixture(), expected = JSON.stringify(captureBattleSnapshot(state));
  for (const shot of [...state.projectiles, ...state.enemyProjectiles, ...state.mortarProjectiles]) {
    shot.trailCache = visual(); shot.debugDraw = () => {}; shot.screenPosition = { x: 99, y: 99 };
  }
  assert.equal(JSON.stringify(captureBattleSnapshot(state)), expected);
  for (const shot of [...state.projectiles, ...state.enemyProjectiles, ...state.mortarProjectiles]) delete shot.body;
  assert.equal(JSON.stringify(captureBattleSnapshot(state)), expected);
});

test("legacy data-only decode preserves removed sources, cyclic pipeline payloads, targets and partial damage", () => {
  const graph = JSON.parse(JSON.stringify(legacyCapture(fixture())));
  const state = decodeSaveGraph(graph, () => ({}));
  const source = state.projectiles[0].sourceTower;
  assert.equal(source, state.projectiles[1].sourceTower);
  assert.equal(source, state.actions[0].source);
  assert.equal(source, state.mortarProjectiles[0].targetTower);
  assert.equal(source, source.storedShots[0].sourceTower);
  assert.equal(source.storedShots[0].action.event.projectile, state.enemyProjectiles[0]);
  assert.equal(source.storedShots[0].action.event.mortar, state.mortarProjectiles[0]);
  assert.equal(state.projectiles[0].targetEnemy, state.enemies[0]);
  assert.equal(state.projectiles[1].targetBossPart, state.boss);
  assert.equal(state.projectiles[0].maxX, Infinity);
  assert.equal(state.projectiles[0].partialHitDamage, 230);
  assert.equal(state.mortarProjectiles[0].shiftSelfDamageApplied, true);
  assert.equal(JSON.stringify(captureBattleSnapshot(state)), JSON.stringify(graph));
  const stored = graph.nodes.find(n => n.data.remainingRange);
  assert.equal(stored.kind, "object", "stored pipeline packets are not live projectiles");
});

test("capture still rejects unsupported non-data objects outside the projectile boundary", () => {
  assert.throws(() => captureBattleSnapshot({ unregistered: { body: visual() } }), /Non-data/);
  assert.throws(() => captureBattleSnapshot({ cache: new Map() }), /Non-data/);
  assert.throws(() => captureBattleSnapshot({ boss: { kind: "unknown", rank: 1, advanceMinionKind: "circle" } }), /Unsupported boss/);
});

test("save graph field inclusion preserves object order, with omission taking precedence", () => {
  const data = { c: 3, a: 1, b: 2, visual: visual() };
  const graph = encodeSaveGraph(data, () => ({ kind: "object", include: new Set(["a", "b", "c"]), omit: new Set(["b"]) }));
  assert.deepEqual(Object.keys(graph.nodes[0].data), ["c", "a"]);
  assert.deepEqual(decodeSaveGraph(graph, () => ({})), { c: 3, a: 1 });
});
