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
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT, COLUMNS } = load("src/config.ts");
const { getSweptBlockingTowerFromOccupied: sweep, getBlockingTowerFromOccupied: blocker } =
  load("src/game/targeting.ts");
const tower = (column, extras = {}) => ({
  column, lane: 0, x: BOARD_X + (column + 0.5) * CELL_WIDTH, y: BOARD_Y + CELL_HEIGHT / 2,
  inPlay: true, transient: false, ...extras
});
const occupied = (...towers) => new Map(towers.map(t => [`${t.lane}:${t.column}`, t]));
const enemy = (x, extras = {}) => ({ kind: "triangle10000", lane: 0, x, ...extras });

test("heart lane relocation resets a tilde's oscillation center and phase rather than shifting an old path", () => {
  const { relocateEnemyToLane, oscillationTarget, OSCILLATION_AMPLITUDE } = load("src/game/oscillatingMovement.ts");
  const e = enemy(400, { y: 500, oscillationCenterY: 475, oscillationLastY: 500, oscillationPhase: 2 });
  const y = BOARD_Y + CELL_HEIGHT * 3.5;
  relocateEnemyToLane(e, 3, y);
  assert.deepEqual([e.y, e.lane, e.oscillationCenterY, e.oscillationLastY, e.oscillationPhase], [y, 3, y, y, 0]);
  assert.equal(oscillationTarget(e, 0).y, y);
  assert.equal(oscillationTarget(e, 1).y, y + OSCILLATION_AMPLITUDE);
});

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

test("oscillating enemies can sweep into a tower from an adjacent lane", () => {
  const t = tower(5), cells = occupied(t);
  const e = enemy(t.x + 200, { lane: 1, y: t.y + CELL_HEIGHT, oscillationCenterY: t.y + CELL_HEIGHT / 2 });
  const hit = sweep(cells, e, t.x - 200, t.y);
  assert.equal(hit.tower, t);
  assert.ok(hit.fraction >= 0 && hit.fraction <= 1);
  e.x = hit.x; e.y = hit.y;
  assert.equal(blocker(cells, e), t);
  assert.equal(sweep(cells, { ...e, x: t.x + 200, y: t.y + CELL_HEIGHT }, t.x - 200, t.y + CELL_HEIGHT), undefined);
});

test("tilde motion has a four second period, bounded amplitude, and follows teleports", () => {
  const { oscillationTarget, commitOscillation, OSCILLATION_AMPLITUDE } = load("src/game/oscillatingMovement.ts");
  const center = BOARD_Y + 3 * CELL_HEIGHT;
  const e = enemy(800, { y: center, oscillationCenterY: center, oscillationPhase: 0, oscillationLastY: center });
  const expected = [center + OSCILLATION_AMPLITUDE, center, center - OSCILLATION_AMPLITUDE, center];
  for (const y of expected) {
    const target = oscillationTarget(e, 1);
    assert.ok(Math.abs(target.y - y) < 1e-9);
    commitOscillation(e, target.y, target.phase);
  }
  e.y += CELL_HEIGHT;
  assert.ok(Math.abs(oscillationTarget(e, 0).y - e.y) < 1e-9);
  assert.equal(e.oscillationCenterY, center + CELL_HEIGHT);
});
