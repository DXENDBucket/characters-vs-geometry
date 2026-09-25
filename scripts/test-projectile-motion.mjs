import assert from "node:assert/strict";
import test from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const noop = () => {};
const load = createTypeScriptLoader({
  phaser: { default: { Utils: { Array: { Remove(array, item) {
    const index = array.indexOf(item);
    if (index >= 0) array.splice(index, 1);
  } } } } },
  "src/registry/cards.ts": {},
  "src/registry/enemies.ts": { enemyIsBossCompanion: () => false },
  "src/render/combatEffects.ts": { makeHitShards: noop },
  "src/game/projectiles.ts": { isTowerProjectileOutOfBounds: (_p, limit) => limit },
  "src/game/slowAura.ts": { slowAuraSources: () => [], movementSpeedMultiplier: () => 1 },
  "src/game/orientation.ts": {},
  "src/game/gathering.ts": { gatheringIsActive: () => false },
  "src/game/statusEffects.ts": {},
  "src/game/cardAttackConfigs.ts": {},
  "src/game/unitStats.ts": {},
  "src/game/towers.ts": {}
});
const { ProjectileMotionFrame, segmentCircleHitTime } = load("src/game/projectileMotion.ts");
const { updateTowerProjectiles } = load("src/game/projectileRuntime.ts");
const { BOARD_Y, CELL_HEIGHT } = load("src/config.ts");
const makeEnemy = (x, extras = {}) => ({ kind: "circle", x, y: 0, lane: 0, inPlay: true, statusEffects: [], ...extras });
const makeProjectile = (extras = {}) => ({
  x: 0, y: 0, vx: 100, vy: 0, lane: 0, type: "bolt", damage: 100, damageType: "physical",
  hitCount: 1, limitDirection: 1, maxX: 10000, body: { setPosition: noop, destroy: noop }, ...extras
});
function runtime(enemies, projectiles) {
  const hits = [];
  return {
    enemies, projectiles, towers: [], scene: {}, battleTime: 100,
    projectileMotion: new ProjectileMotionFrame(), getBoss: () => null,
    hits, damageEnemy: (enemy, damage) => hits.push({ enemy, damage })
  };
}

test("relative sweep detects crossing, stationary shots, tangency and misses", () => {
  assert.equal(segmentCircleHitTime(-100, 0, 100, 0, 20), 0.4);
  assert.equal(segmentCircleHitTime(-100, 20, 100, 20, 20), 0.5);
  assert.equal(segmentCircleHitTime(-100, 21, 100, 21, 20), Infinity);
  assert.equal(segmentCircleHitTime(100, 0, 200, 0, 20), Infinity);
  assert.equal(segmentCircleHitTime(100, 0, 100, 0, 20), Infinity);
  assert.equal(segmentCircleHitTime(0, 0, 0, 0, 20), 0);
});

test("extreme-speed enemies crossing a stationary shot take each stacked hit separately", () => {
  const e = makeEnemy(-10000), p = makeProjectile({ vx: 0, hitCount: 3 });
  const r = runtime([e], [p]);
  r.projectileMotion.begin(r.projectiles);
  r.projectileMotion.record(e, 10000, 0, e.x, e.y);
  updateTowerProjectiles(r, 1 / 60);
  assert.deepEqual(r.hits.map(hit => hit.damage), [100, 100, 100]);
  assert.equal(r.projectiles.length, 0);
});

test("direct projectiles hit the earliest contact regardless of enemy array order", () => {
  const far = makeEnemy(800), near = makeEnemy(200);
  const r = runtime([far, near], [makeProjectile({ vx: 1000 })]);
  r.projectileMotion.begin(r.projectiles);
  updateTowerProjectiles(r, 1);
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].enemy, near);
});

test("new shots do not retroactively hit old paths; teleports and stale frames are excluded", () => {
  const e = makeEnemy(-1000), old = makeProjectile(), fresh = makeProjectile();
  const motion = new ProjectileMotionFrame();
  motion.begin([old]);
  motion.record(e, 1000, 0, -1000, 0);
  assert.ok(motion.hitTime(e, old, 0, 0, 22) < Infinity);
  assert.equal(motion.hitTime(e, fresh, 0, 0, 22), Infinity);
  e.x = -2000;
  assert.equal(motion.hitTime(e, old, 0, 0, 22), Infinity);
  e.x = -1000;
  motion.begin([old]);
  assert.equal(motion.hitTime(e, old, 0, 0, 22), Infinity);
});

test("high flying and burrowed enemies remain immune to direct projectiles", () => {
  for (const state of [{ highFlightUntil: 1000 }, { burrowed: true }]) {
    const e = makeEnemy(-1000, state), p = makeProjectile();
    const r = runtime([e], [p]);
    r.projectileMotion.begin(r.projectiles);
    r.projectileMotion.record(e, 1000, 0, -1000, 0);
    updateTowerProjectiles(r, 1);
    assert.equal(r.hits.length, 0);
  }
});

test("homing projectiles sweep only their locked target", () => {
  const other = makeEnemy(10), target = makeEnemy(-1000);
  const p = makeProjectile({ type: "chevron", targetEnemy: target, speed: 100 });
  const r = runtime([other, target], [p]);
  r.projectileMotion.begin(r.projectiles);
  r.projectileMotion.record(target, 1000, 0, -1000, 0);
  updateTowerProjectiles(r, 1 / 60);
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].enemy, target);
});

test("crossed projectiles resolve before exiting enemies damage the base", () => {
  const e = makeEnemy(-1000), p = makeProjectile({ vx: 0 });
  const r = runtime([e], [p]);
  let exits = 0;
  r.damageEnemy = enemy => { enemy.inPlay = false; };
  r.projectileMotion.begin(r.projectiles);
  r.projectileMotion.record(e, 1000, 0, -1000, 0);
  r.projectileMotion.deferExit(e, () => { exits += 1; });
  assert.equal(exits, 0);
  updateTowerProjectiles(r, 1 / 60);
  r.projectileMotion.finish();
  assert.equal(exits, 0);
  e.inPlay = true;
  r.projectileMotion.begin([p]);
  r.projectileMotion.deferExit(e, () => { exits += 1; });
  r.projectileMotion.finish();
  assert.equal(exits, 1);
});

test("unrelated lanes are not collision candidates", () => {
  const r = runtime([makeEnemy(50, { lane: 1 })], [makeProjectile()]);
  updateTowerProjectiles(r, 1);
  assert.equal(r.hits.length, 0);
});

test("E's upper and lower angled shots hit adjacent lanes in either facing direction", () => {
  for (const direction of [-1, 1]) for (const angle of [-10, 10]) {
    const radians = angle * Math.PI / 180;
    const startY = BOARD_Y + 3.5 * CELL_HEIGHT;
    const targetLane = 3 + Math.sign(angle);
    const travelTime = CELL_HEIGHT / Math.abs(540 * Math.sin(radians));
    const e = makeEnemy(direction * 540 * Math.cos(radians) * travelTime, {
      y: BOARD_Y + (targetLane + 0.5) * CELL_HEIGHT, lane: targetLane
    });
    const p = makeProjectile({ lane: 3, y: startY, vx: direction * 540 * Math.cos(radians), vy: 540 * Math.sin(radians),
      limitDirection: direction, maxX: direction * 10000 });
    const r = runtime([e], [p]);
    for (let frame = 0; frame < 120 && r.projectiles.length; frame++) {
      r.projectileMotion.begin(r.projectiles);
      updateTowerProjectiles(r, 1 / 60);
    }
    assert.equal(r.hits.length, 1, `direction ${direction}, angle ${angle}`);
    assert.equal(r.hits[0].enemy, e);
  }
});

test("cross-lane sweeps choose earliest contact, include hitbox margins and reject distant lanes", () => {
  const y = BOARD_Y + 1.5 * CELL_HEIGHT;
  const near = makeEnemy(0, { y: y + CELL_HEIGHT, lane: 2 });
  const far = makeEnemy(0, { y: y + CELL_HEIGHT * 2, lane: 3 });
  const r = runtime([far, near], [makeProjectile({ y, lane: 1, vx: 0, vy: CELL_HEIGHT * 3 })]);
  updateTowerProjectiles(r, 1);
  assert.equal(r.hits[0].enemy, near);
  const edge = makeEnemy(0, { y: BOARD_Y + 2 * CELL_HEIGHT + 4, lane: 2 });
  const r2 = runtime([edge], [makeProjectile({ y: BOARD_Y + 2 * CELL_HEIGHT - 18, lane: 1, vx: 0, vy: 2 })]);
  updateTowerProjectiles(r2, 1);
  assert.equal(r2.hits[0].enemy, edge);
  const r3 = runtime([far], [makeProjectile({ y, lane: 1, vx: 0, vy: 5 })]);
  updateTowerProjectiles(r3, 1);
  assert.equal(r3.hits.length, 0);
});

test("oscillating enemies remain candidates when crossing into a different projectile lane", () => {
  const e = makeEnemy(0, { y: 40, lane: 1, oscillationCenterY: 0 });
  const p = makeProjectile({ vx: 0 });
  const r = runtime([e], [p]);
  r.projectileMotion.begin(r.projectiles);
  r.projectileMotion.record(e, 0, -40, 0, 40);
  updateTowerProjectiles(r, 1 / 60);
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].enemy, e);
});
