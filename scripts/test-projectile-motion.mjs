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
  "src/game/enemyBehaviors.ts": {
    enemyIsBurrowed: e => e.burrowed,
    enemyIsHighFlying: e => e.highFlying
  },
  "src/game/slowAura.ts": { slowAuraSources: () => [], movementSpeedMultiplier: () => 1 },
  "src/game/solarBomb.ts": { enemyIsSolarBomb: () => false },
  "src/game/orientation.ts": {},
  "src/game/gathering.ts": { gatheringIsActive: () => false },
  "src/game/statusEffects.ts": {},
  "src/game/cardAttackConfigs.ts": {},
  "src/game/unitStats.ts": {},
  "src/game/towers.ts": {}
});
const { ProjectileMotionFrame, segmentCircleHitTime } = load("src/game/projectileMotion.ts");
const { updateTowerProjectiles } = load("src/game/projectileRuntime.ts");
const makeEnemy = (x, extras = {}) => ({ x, y: 0, lane: 0, inPlay: true, statusEffects: [], ...extras });
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
  for (const state of [{ highFlying: true }, { burrowed: true }]) {
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
