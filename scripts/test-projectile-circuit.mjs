import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader();
const { ProjectileCircuitController, edgeAtPoint, edgePosition, PROJECTILE_BANK_CAPACITY } = load("src/game/projectileCircuit.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const { canUpgradeTowerWithCard } = load("src/game/towerIdentity.ts");
const { TowerExtractionPool } = load("src/game/towerExtraction.ts");

function fixture() {
  const state = { towers: [], edges: [], battleTime: 0, getDefinition: id => cardDefinitions.find(c => c.id === id),
    emit: (shot, outlet) => state.output.push({ shot, outlet }), changed() {}, output: [] };
  const controller = new ProjectileCircuitController(() => state);
  const place = (type, column, lane = 3, level = 1) => {
    const tower = { id: `tower:${state.towers.length}`, type, column, lane, level, placedOrder: state.towers.length, inPlay: true };
    state.towers.push(tower); return tower;
  };
  const edge = (column, lane = 3, axis = "horizontal") => state.edges.push({ type: "=", axis, column, lane });
  const source = place("A", 0), bank = place("0", 1), outlet = place("1", 2);
  edge(0); edge(1); controller.sync();
  const shot = overrides => ({ type: "bolt", sourceTower: source, x: 10, y: 20, vx: 400, vy: 30, maxX: 310,
    limitDirection: 1, damage: 400, damageType: "physical", hitCount: 3, splashRadius: 0,
    body: { destroy() { this.destroyed = true; } }, ...overrides });
  return { state, controller, source, bank, outlet, edge, place, shot };
}

test("special equals occupies only internal grid edges; numeric prices and cooldowns are updated", () => {
  const edge = { type: "=", axis: "horizontal", lane: 2, column: 3 };
  const p = edgePosition(edge); assert.deepEqual(edgeAtPoint(p.x, p.y), edge);
  const vertical = { type: "=", axis: "vertical", lane: 2, column: 3 }, v = edgePosition(vertical);
  assert.deepEqual(edgeAtPoint(v.x, v.y), vertical);
  assert.equal(edgeAtPoint(BOARD_X, BOARD_Y + CELL_HEIGHT / 2), undefined);
  assert.equal(edgeAtPoint(BOARD_X + CELL_WIDTH / 2, BOARD_Y + CELL_HEIGHT / 2), undefined);
  for (const id of ["0", "1"]) {
    const card = cardDefinitions.find(c => c.id === id); assert.equal(card.cost, 600); assert.equal(card.cooldown, 10000);
  }
  assert.equal(cardDefinitions.find(c => c.id === "=").category, "special");
  assert.equal(canUpgradeTowerWithCard({ type: "0" }, "0"), false);
  assert.equal(canUpgradeTowerWithCard({ type: "0" }, "1"), true);
  const pool = new TowerExtractionPool(); pool.restore(6000);
  assert.deepEqual(pool.plan(cardDefinitions.find(c => c.id === "0")), { levels: 1, cost: 600, usesPool: false });
});

test("captures real shots once, retains individual judgments and remaining range, releases without extra damage", () => {
  const f = fixture(), shot = f.shot();
  assert.equal(f.controller.capture(shot), true); assert.equal(shot.body.destroyed, true);
  assert.equal(f.controller.capture(shot), false); assert.equal(f.bank.projectileBank.shots.length, 1);
  const stored = f.bank.projectileBank.shots[0];
  assert.equal(stored.remainingRange, 300); assert.equal(stored.hitCount, 3); assert.equal(stored.damage, 400);
  f.controller.release(f.bank); f.controller.update();
  assert.equal(f.state.output.length, 1); assert.equal(f.state.output[0].outlet, f.outlet);
  assert.equal(f.state.output[0].shot, stored); assert.equal(f.bank.projectileBank.shots.length, 0);
  f.controller.release(f.bank); f.controller.update(); assert.equal(f.state.output.length, 1);
});

test("disconnected or incomplete networks do not swallow shots; release pauses on disconnection", () => {
  const f = fixture(); f.controller.capture(f.shot()); f.controller.capture(f.shot());
  f.controller.release(f.bank); f.controller.update(); assert.equal(f.state.output.length, 1);
  f.state.edges.pop(); f.controller.sync();
  assert.equal(f.controller.capture(f.shot()), false);
  f.state.battleTime = 500; f.controller.update(); assert.equal(f.state.output.length, 1);
  f.edge(1); f.controller.sync(); f.controller.update(); assert.equal(f.state.output.length, 2);
  f.outlet.inPlay = false; assert.equal(f.controller.capture(f.shot()), false);
});

test("a full bank passes overflow through, and shots received during discharge await the next click", () => {
  const f = fixture();
  for (let i = 0; i < PROJECTILE_BANK_CAPACITY; i++) assert.equal(f.controller.capture(f.shot()), true);
  const overflow = f.shot(); assert.equal(f.controller.capture(overflow), false); assert.equal(overflow.body.destroyed, undefined);
  f.controller.release(f.bank); f.controller.update();
  assert.equal(f.controller.capture(f.shot({ damage: 700 })), true);
  f.controller.release(f.bank); // Repeated clicks cannot extend an active discharge.
  f.state.battleTime = 10000; f.controller.update();
  assert.equal(f.state.output.length, PROJECTILE_BANK_CAPACITY);
  assert.equal(f.bank.projectileBank.shots.length, 1);
  f.controller.release(f.bank); f.controller.update(); assert.equal(f.state.output.at(-1).shot.damage, 700);
});

test("homing, unrelated towers and prior routed shots bypass storage", () => {
  const f = fixture();
  assert.equal(f.controller.capture(f.shot({ type: "chevron" })), false);
  assert.equal(f.controller.capture(f.shot({ sourceTower: f.place("A", 5) })), false);
  assert.equal(f.controller.capture(f.shot({ circuitChecked: true })), false);
  assert.equal(f.controller.capture(f.shot({ vx: 0 })), false);
  assert.equal(f.bank.projectileBank.shots.length, 0);
});

test("branches distribute a fixed set of shots and higher outlet numbers change grouping, not damage", () => {
  const f = fixture(), outlet2 = f.place("1", 1, 4, 2); f.edge(1, 3, "vertical"); f.controller.sync();
  for (let i = 0; i < 9; i++) f.controller.capture(f.shot());
  f.controller.release(f.bank); f.controller.update(); f.state.battleTime = 1000; f.controller.update();
  assert.equal(f.state.output.length, 9);
  assert.equal(f.state.output.filter(e => e.outlet === f.outlet).length, 3);
  assert.equal(f.state.output.filter(e => e.outlet === outlet2).length, 6);
  assert.equal(f.state.output.reduce((n, e) => n + e.shot.damage * e.shot.hitCount, 0), 10800);
});

test("two banks never duplicate one shot and a destroyed bank cannot capture", () => {
  const f = fixture(), bank2 = f.place("0", 1, 4); f.edge(1, 3, "vertical"); f.controller.sync();
  f.controller.capture(f.shot());
  assert.equal(f.bank.projectileBank.shots.length + bank2.projectileBank.shots.length, 1);
  f.bank.inPlay = false; f.controller.capture(f.shot()); assert.equal(bank2.projectileBank.shots.length, 1);
});

test("edge circuits use logical tower positions without changing physical positions", () => {
  const f = fixture(), topology = load("src/game/towerTopology.ts");
  f.source.column = 9; f.source.lane = 6;
  const swap = f.place("&", 0);
  swap.topologyTarget = { column: 9, lane: 6 }; swap.topologyOrder = 0;
  topology.syncTowerTopology(f.state.towers); f.controller.sync();
  assert.equal(f.controller.capture(f.shot()), true);
  assert.equal(f.source.column, 9); assert.equal(f.source.lane, 6);
  swap.inPlay = false; topology.syncTowerTopology(f.state.towers); f.controller.sync();
  assert.equal(f.controller.capture(f.shot()), false);
});
