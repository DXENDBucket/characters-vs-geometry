import assert from "node:assert/strict";
import test from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({
  phaser: { default: {} },
  "src/registry/enemies.ts": { enemyIsBossCompanion: kind => kind === "companion" },
  "src/game/enemyBehaviors.ts": {
    enemyIsBurrowed: enemy => enemy.burrowed,
    enemyIsHighFlying: enemy => enemy.highFlying
  },
  "src/game/solarBomb.ts": { enemyIsSolarBomb: enemy => enemy.kind === "solarBomb" },
  "src/game/cardAttackConfigs.ts": {},
  "src/game/statusEffects.ts": { hasStatusEffectName: enemy => !!enemy.flying },
  "src/game/towers.ts": { towerIsFlying: tower => !!tower.flying },
  "src/game/unitStats.ts": {}
});
const { BOARD_X, CELL_WIDTH, COLUMNS } = load("src/config.ts");
const { getSweptBlockingTowerFromOccupied: sweep, getBlockingTowerFromOccupied: blocker } =
  load("src/game/targeting.ts");
const tower = (column, extras = {}) => ({
  column, lane: 0, x: BOARD_X + (column + 0.5) * CELL_WIDTH,
  inPlay: true, transient: false, ...extras
});
const occupied = (...towers) => new Map(towers.map(t => [`${t.lane}:${t.column}`, t]));
const enemy = (x, extras = {}) => ({ kind: "triangle10000", lane: 0, x, ...extras });

test("fast enemies stop at the first crossed tower in either direction", () => {
  const left = tower(2), right = tower(8), cells = occupied(left, right);
  const forward = sweep(cells, enemy(1e9), -1e9);
  assert.equal(forward.tower, right);
  assert.equal(forward.x, right.x + 38);
  const reverse = sweep(cells, enemy(-1e9), 1e9);
  assert.equal(reverse.tower, left);
  assert.equal(reverse.x, left.x - 38);
  assert.equal(blocker(cells, enemy(forward.x)), right);
  assert.equal(blocker(cells, enemy(reverse.x)), left);
});

test("short moves only collide when they actually reach the boundary", () => {
  const t = tower(5), cells = occupied(t);
  assert.equal(sweep(cells, enemy(t.x + 100), t.x + 39), undefined);
  assert.equal(sweep(cells, enemy(t.x + 100), t.x + 38).tower, t);
  assert.equal(sweep(cells, enemy(t.x + 100), t.x + 200), undefined);
  assert.equal(sweep(cells, enemy(t.x + 100), t.x + 100), undefined);
});

test("sweeps preserve ground and flying blocking rules", () => {
  const ground = tower(2), airborne = tower(8, { flying: true });
  const cells = occupied(ground, airborne);
  assert.equal(sweep(cells, enemy(1e9), -1e9).tower, ground);
  assert.equal(sweep(cells, enemy(1e9, { flying: true }), -1e9).tower, airborne);
  for (const state of [{ highFlying: true }, { burrowed: true }, { kind: "companion" }, { kind: "solarBomb" }]) {
    assert.equal(sweep(cells, enemy(1e9, state), -1e9), undefined);
  }
});

test("removed, transient and other-lane towers cannot block a sweep", () => {
  const cells = occupied(tower(8, { inPlay: false }), tower(6, { transient: true }), tower(4, { lane: 1 }));
  assert.equal(sweep(cells, enemy(1e9), -1e9), undefined);
});

test("work stays bounded by board columns even at extreme speeds", () => {
  let reads = 0;
  const cells = { get() { reads += 1; } };
  assert.equal(sweep(cells, enemy(1e100), -1e100), undefined);
  assert.equal(reads, COLUMNS);
});
