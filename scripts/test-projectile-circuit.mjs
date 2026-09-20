import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader();
const { ProjectileCircuitController, edgeAtPoint, edgePosition, PROJECTILE_BANK_CAPACITY } = load("src/game/projectileCircuit.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const { canUpgradeTowerWithCard, supportsTowerAutoUpgrade } = load("src/game/towerIdentity.ts");
const { projectileBankCapacity } = load("src/game/projectileBank.ts");
const { TowerExtractionPool } = load("src/game/towerExtraction.ts");
const { projectileDamageBudget, consumeProjectileDamage, forEachProjectileHit, projectileVisualScale } = load("src/game/projectileIntegrity.ts");
const { encodeSaveGraph, decodeSaveGraph } = load("src/game/saveGraph.ts");

function fixture() {
  const state = { towers: [], edges: [], battleTime: 0, getDefinition: id => cardDefinitions.find(c => c.id === id),
    emit: (shot, outlet) => state.output.push({ shot, outlet }), changed() {}, output: [] };
  const controller = new ProjectileCircuitController(() => state);
  const place = (type, column, lane = 3, level = 1) => {
    const tower = { id: `tower:${state.towers.length}`, type, column, lane, level, placedOrder: state.towers.length, inPlay: true,
      x: BOARD_X + (column + .5) * CELL_WIDTH, y: BOARD_Y + (lane + .5) * CELL_HEIGHT };
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

function hostile(tower, damage = 900, hitCount = 1) {
  return { x: tower.x, y: tower.y, damage, hitCount, body: { setScale(value) { this.scale = value; } } };
}

test("damage budgets cancel judgments in order instead of changing the armor threshold of intact hits", () => {
  const shot = { damage: 400, hitCount: 3 };
  assert.equal(consumeProjectileDamage(shot, 500), 500);
  const hits = []; forEachProjectileHit(shot, damage => hits.push(damage));
  assert.deepEqual(hits, [300, 400]); assert.equal(projectileDamageBudget(shot), 700);
  assert.ok(projectileVisualScale(shot) < projectileVisualScale({ damage: 400, hitCount: 3 }));
  assert.equal(consumeProjectileDamage(shot, 999), 700); assert.equal(shot.hitCount, 0);
  assert.equal(consumeProjectileDamage({ damage: 0 }, 400), 0);
});

test("bundling preserves independent judgments and does not merge incompatible source effects or spread angles", () => {
  const f = fixture(); f.outlet.type = "+"; f.controller.sync();
  for (let i = 0; i < 5; i++) f.controller.capture(f.shot());
  f.controller.release(f.bank); f.controller.update();
  assert.equal(f.state.output.length, 1); assert.equal(f.state.output[0].shot.hitCount, 15);
  const hits = []; forEachProjectileHit(f.state.output[0].shot, d => hits.push(Math.max(0, d - 300)));
  assert.equal(hits.reduce((a, b) => a + b, 0), 1500);
  f.state.output = [];
  f.controller.capture(f.shot()); f.controller.capture(f.shot({ vy: -30 }));
  f.controller.capture(f.shot({ damageType: "magic" }));
  f.controller.capture(f.shot({ partialHitDamage: 200 }));
  f.controller.release(f.bank); f.controller.update();
  assert.equal(f.state.output.length, 4);
});

test("subtractor alone completes a circuit and weak ammo needs multiple interception ticks to stop a mortar", () => {
  const f = fixture(); f.outlet.type = "-"; f.controller.sync();
  for (let i = 0; i < 3; i++) assert.equal(f.controller.capture(f.shot({ hitCount: 1 })), true);
  const target = { ...hostile(f.outlet), owner: "enemy", progress: .8 };
  assert.equal(f.controller.intercept(target, target), false);
  assert.equal(projectileDamageBudget(target), 500); assert.equal(f.bank.projectileBank.shots.length, 2);
  f.controller.intercept(target, target); assert.equal(projectileDamageBudget(target), 500);
  f.state.battleTime = 100; f.controller.intercept(target, target); assert.equal(projectileDamageBudget(target), 100);
  f.state.battleTime = 200; assert.equal(f.controller.intercept(target, target), true);
  assert.equal(f.bank.projectileBank.shots.length, 1);
  assert.equal(projectileDamageBudget(f.bank.projectileBank.shots[0]), 300);
});

test("swept interception catches fast shots, ignores friendly mortars, respects disconnection and updates release stock", () => {
  const f = fixture(); const minus = f.place("-", 2, 4); f.edge(2, 3, "vertical"); f.controller.sync();
  f.controller.capture(f.shot({ damage: 400, hitCount: 1 })); f.controller.release(f.bank);
  const friend = { ...hostile(minus), owner: "tower" }; assert.equal(f.controller.intercept(friend, friend), false);
  const target = hostile(minus, 500); target.x += CELL_WIDTH * 5;
  assert.equal(f.controller.intercept(target, { x: minus.x - CELL_WIDTH * 5, y: minus.y }), false);
  assert.equal(projectileDamageBudget(target), 100); assert.equal(f.bank.projectileBank.remaining, 0);
  f.controller.capture(f.shot()); f.state.edges.pop(); f.controller.sync(); f.state.battleTime = 200;
  const next = hostile(minus); assert.equal(f.controller.intercept(next, next), false);
  assert.equal(projectileDamageBudget(next), 900);
});

test("multiple subtractors spend shared ammunition once and partial budgets survive serialization", () => {
  const f = fixture(); f.outlet.type = "-";
  const second = f.place("-", 2, 4); f.edge(2, 3, "vertical"); f.controller.sync();
  f.controller.capture(f.shot({ damage: 400, hitCount: 1 })); f.controller.capture(f.shot({ damage: 400, hitCount: 1 }));
  const target = hostile(second, 900); f.controller.intercept(target, target);
  assert.equal(projectileDamageBudget(target), 100); assert.equal(f.bank.projectileBank.shots.length, 0);
  const snapshot = JSON.parse(JSON.stringify(encodeSaveGraph({ target, next: second.nextInterceptionAt },
    object => ({ kind: "object", omit: new Set(["body"]) }))));
  const restored = decodeSaveGraph(snapshot, () => ({}));
  assert.equal(restored.next, 100); assert.equal(projectileDamageBudget(restored.target), 100);
  assert.equal(projectileVisualScale(restored.target), projectileVisualScale(target));
});

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
  assert.equal(canUpgradeTowerWithCard({ type: "0" }, "0"), true);
  assert.equal(canUpgradeTowerWithCard({ type: "0" }, "1"), false);
  assert.equal(supportsTowerAutoUpgrade({ type: "0" }), true);
  assert.equal(supportsTowerAutoUpgrade({ type: "1" }), false);
  const pool = new TowerExtractionPool(); pool.restore(6000);
  assert.deepEqual(pool.plan(cardDefinitions.find(c => c.id === "0")), { levels: 10, cost: 6000, usesPool: true });
});

test("bank upgrades expand capacity without replacing stock; lost temporary levels retain over-capacity ammo", () => {
  const f = fixture();
  for (let i = 0; i < 128; i++) assert.equal(f.controller.capture(f.shot()), true);
  const first = f.bank.projectileBank.shots[0];
  assert.equal(f.controller.capture(f.shot()), false);
  f.bank.level = 2; f.controller.sync();
  assert.equal(projectileBankCapacity(f.bank), 256);
  for (let i = 0; i < 128; i++) assert.equal(f.controller.capture(f.shot()), true);
  assert.equal(f.bank.projectileBank.shots[0], first);
  assert.equal(f.controller.capture(f.shot()), false);
  f.bank.levelBonus = 1;
  assert.equal(projectileBankCapacity(f.bank), 384);
  assert.equal(f.controller.capture(f.shot()), true);
  f.bank.levelBonus = 0; f.controller.sync();
  assert.equal(f.bank.projectileBank.shots.length, 257);
  assert.equal(f.controller.capture(f.shot()), false);
  f.controller.release(f.bank); f.controller.update();
  f.state.battleTime += 40; f.controller.update();
  assert.equal(f.controller.capture(f.shot()), true);
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
