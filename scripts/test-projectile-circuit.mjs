import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader();
const { ProjectileCircuitController, edgeAtPoint, edgePosition } = load("src/game/projectileCircuit.ts");
const { EdgeTowerControls } = load("src/game/edgeTowerControls.ts");
const { projectileBankCapacity } = load("src/game/projectileBank.ts");
const { nodeOccupancy } = load("src/game/pipelineRules.ts");
const { syncTowerTopology } = load("src/game/towerTopology.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const { canUpgradeTowerWithCard, supportsTowerAutoUpgrade, withTowerActionContext } = load("src/game/towerIdentity.ts");
const { projectileDamageBudget, consumeProjectileDamage, forEachProjectileHit, projectileVisualScale } = load("src/game/projectileIntegrity.ts");

function fixture(types = ["A", "0", "1"]) {
  const state = { towers: [], edges: [], battleTime: 0, output: [],
    getDefinition: id => cardDefinitions.find(c => c.id === id),
    emit: (shot, outlet) => state.output.push({ shot, outlet, at: state.battleTime }), changed() {} };
  const controller = new ProjectileCircuitController(() => state);
  const place = (type, column, lane = 3, level = 1) => {
    const definition = state.getDefinition(type);
    const tower = { id: `tower:${state.towers.length}`, type, column, lane, level, levelBonus: 0, mirrorLevelBonus: 0,
      finalStats: { maxHp: 1200, armor: 150, magicResistance: 0, attackPower: definition.attackPower ?? 0 },
      trueDamageUntil: 0, placedOrder: state.towers.length, inPlay: true,
      x: BOARD_X + (column + .5) * CELL_WIDTH, y: BOARD_Y + (lane + .5) * CELL_HEIGHT };
    state.towers.push(tower); return tower;
  };
  const edge = (column, lane = 3, axis = "horizontal", mode = "=") => {
    const item = { type: "=", axis, column, lane, mode, level: 1 }; state.edges.push(item); return item;
  };
  types.forEach((type, col) => { place(type, col); if (col) edge(col - 1); }); controller.sync();
  const source = state.towers[0], bank = state.towers[1], outlet = state.towers.at(-1);
  const shot = (overrides = {}) => ({ type: "bolt", sourceTower: source, x: source.x + 26, y: source.y,
    vx: 400, vy: 0, maxX: source.x + 326, limitDirection: 1, damage: 400, damageType: "physical", hitCount: 1,
    splashRadius: 0, body: { destroy() { this.destroyed = true; } }, ...overrides });
  const tick = (dt = 40) => { state.battleTime += dt; controller.update(); };
  return { state, controller, source, bank, outlet, place, edge, shot, tick };
}
const hostile = (tower, damage = 900, hitCount = 1) => ({ x: tower.x, y: tower.y, damage, hitCount,
  body: { setScale(value) { this.scale = value; } } });

test("pipeline component prices and cooldowns match their individual panels", () => {
  for (const [id, cost, cooldown] of [["=", 50, 1000], ["0", 50, 3000], ["1", 50, 3000], ["+", 500, 10000], ["-", 500, 10000], ["*", 500, 10000]]) {
    const card = cardDefinitions.find(card => card.id === id);
    assert.deepEqual([card.cost, card.cooldown], [cost, cooldown], id);
  }
});

test("magic shield spends multi-hit reserves at 3:1, retaining partial shots and never forwarding", () => {
  const f = fixture(["A", "*", "1"]), flashes = [];
  f.state.shielded = tower => flashes.push(tower);
  assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement("*"), "AE-7");
  assert.equal(f.controller.capture(f.shot({ damage: 300, hitCount: 4 })), true);
  f.tick(); assert.equal(f.state.output.length, 0);
  assert.equal(f.controller.absorbMagicDamage(f.bank, 150), 0);
  const stored = f.bank.projectileNode.input[0];
  assert.equal(projectileDamageBudget(stored), 750);
  assert.equal(stored.hitCount, 3);
  assert.equal(stored.partialHitDamage, 150);
  assert.equal(f.controller.absorbMagicDamage(f.source, 300), 50);
  assert.equal(f.bank.projectileNode.input.length, 0);
  assert.equal(f.controller.absorbMagicDamage(f.bank, 100), 100);
  assert.deepEqual(flashes, [f.bank, f.source]);
});

test("magic shield covers 21 logical cells including itself but excludes four corners", () => {
  const f = fixture(["A"]), shield = f.place("*", 5);
  f.controller.sync();
  shield.projectileNode.input.push(f.shot({ damage: 30000 }));
  for (let dl = -3; dl <= 3; dl++) for (let dc = -3; dc <= 3; dc++) {
    const target = f.place("B", 5 + dc, 3 + dl);
    const inside = Math.abs(dl) <= 2 && Math.abs(dc) <= 2 && !(Math.abs(dl) === 2 && Math.abs(dc) === 2);
    assert.equal(f.controller.absorbMagicDamage(target, 10), inside ? 0 : 10, `${dl},${dc}`);
  }
  const remote = f.place("B", 12, 0), swap = f.place("&", 6, 3);
  swap.topologyTarget = { column: 12, lane: 0 };
  syncTowerTopology(f.state.towers);
  assert.equal(f.controller.absorbMagicDamage(remote, 10), 0);
  assert.equal(f.controller.absorbMagicDamage(swap, 10), 10);
});

test("overlapping magic shields spend in placement order, only once per absorbed damage", () => {
  const f = fixture(["*", "*", "B"]), [first, second, target] = f.state.towers;
  let flashes = 0; f.state.shielded = () => flashes++;
  first.projectileNode.input.push(f.shot({ damage: 90 }), f.shot({ damage: 210 }));
  second.projectileNode.input.push(f.shot({ damage: 600 }));
  assert.equal(f.controller.absorbMagicDamage(target, 150), 0);
  assert.equal(first.projectileNode.input.length, 0);
  assert.equal(projectileDamageBudget(second.projectileNode.input[0]), 450);
  assert.equal(flashes, 1);
  second.inPlay = false;
  assert.equal(f.controller.absorbMagicDamage(target, 20), 20);
  assert.equal(flashes, 1);
});

test("shield capacity upgrades preserve stock; copied shields use the same input-only behavior", () => {
  const f = fixture(["A", "*"]);
  f.state.edges[0].level = 100;
  for (let i = 0; i < 128; i++) assert.equal(f.controller.capture(f.shot()), true);
  assert.equal(f.controller.capture(f.shot()), false);
  f.bank.level = 2; f.controller.sync();
  assert.equal(f.controller.capture(f.shot()), true);
  assert.equal(f.bank.projectileNode.input.length, 129);
  assert.equal(supportsTowerAutoUpgrade(f.bank), true);
  f.bank.type = "@"; f.bank.copiedType = "*"; f.controller.sync();
  assert.equal(f.controller.absorbMagicDamage(f.bank, 100), 0);
  assert.equal(projectileDamageBudget(f.bank.projectileNode.input[0]), 100);
  f.bank.copiedType = "B";
  assert.equal(f.controller.absorbMagicDamage(f.bank, 100), 100);
});

test("shield rejects zero-damage payloads and survives fractional exhaustion without losing later shots", () => {
  const f = fixture(["A", "*"]);
  assert.equal(f.controller.capture(f.shot({ damage: 0 })), false);
  for (const damage of [1, 2, 300]) f.controller.capture(f.shot({ damage }));
  assert.ok(Math.abs(f.controller.absorbMagicDamage(f.bank, 1)) < 1e-12);
  const total = f.bank.projectileNode.input.reduce((sum, shot) => sum + projectileDamageBudget(shot), 0);
  assert.ok(Math.abs(total - 300) < 1e-12);
});

test("edge placement is internal-only; zero upgrades normally, numeric outlet does not auto-upgrade", () => {
  const edge = { type: "=", axis: "horizontal", lane: 2, column: 3 };
  const p = edgePosition(edge); assert.deepEqual(edgeAtPoint(p.x, p.y), edge);
  const v = { ...edge, axis: "vertical" }, q = edgePosition(v); assert.deepEqual(edgeAtPoint(q.x, q.y), v);
  assert.equal(edgeAtPoint(BOARD_X, BOARD_Y + CELL_HEIGHT / 2), undefined);
  assert.equal(canUpgradeTowerWithCard({ type: "0" }, "0"), true);
  assert.equal(canUpgradeTowerWithCard({ type: "0" }, "1"), false);
  assert.equal(supportsTowerAutoUpgrade({ type: "0" }), true);
  assert.equal(supportsTowerAutoUpgrade({ type: "1" }), false);
});

test("source captures only across allowed directions; closed-only and reverse-only connections fire normally", () => {
  for (const mode of ["=", ">", "<", "!="]) {
    const f = fixture(["A", "0"]); f.state.edges[0].mode = mode;
    const shot = f.shot(); assert.equal(f.controller.capture(shot), mode === "=" || mode === ">");
    assert.equal(f.bank.projectileBank.shots.length, mode === "=" || mode === ">" ? 1 : 0);
    assert.equal("shots" in f.state.edges[0], false);
  }
  const f = fixture(["0", "A"]); f.state.edges[0].mode = "<";
  assert.equal(f.controller.capture(f.shot({ sourceTower: f.bank })), true);
  assert.equal(f.source.projectileBank.shots.length, 1);
});

test("source can directly feed a numeric outlet; output waits for the exact full batch", () => {
  const f = fixture(["A", "1"]); f.outlet.level = 3;
  for (let i = 0; i < 2; i++) assert.equal(f.controller.capture(f.shot()), true);
  f.tick(); assert.equal(f.state.output.length, 0);
  assert.equal(f.controller.capture(f.shot({ hitCount: 2 })), true);
  f.tick(); assert.equal(f.state.output.length, 3);
  assert.deepEqual(f.state.output.map(e => e.at), [80, 80, 80]);
  assert.deepEqual(f.state.output.map(e => e.shot.hitCount), [1, 1, 2]);
});

test("directional pipes forward once per tick without recapturing emitted shots", () => {
  const f = fixture(["A", "0", "0", "1"]);
  f.state.edges.forEach(edge => { edge.mode = ">"; });
  f.controller.capture(f.shot({ hitCount: 3 })); f.controller.update();
  assert.equal(f.bank.projectileBank.shots.length, 1);
  f.tick(); assert.equal(f.state.output.length, 0);
  assert.equal(f.state.towers[2].projectileBank.shots.length, 1);
  f.tick(); assert.equal(f.state.output.length, 1);
  assert.equal(f.state.output[0].shot.hitCount, 3); assert.equal(f.state.output[0].shot.remainingRange, 300);
  f.tick(); assert.equal(f.state.output.length, 1);
  assert.equal(f.controller.capture(f.shot({ circuitChecked: true })), false);
});

test("bidirectional pipes include the incoming route in round-robin distribution", () => {
  const f = fixture(["A", "0", "0", "1"]);
  f.outlet.level = 2;
  for (let i = 0; i < 4; i++) f.controller.capture(f.shot());
  f.tick(); assert.equal(f.state.towers[2].projectileBank.shots.length, 4);
  // Legacy save metadata must not suppress this route either.
  f.state.towers[2].projectileBank.shots[0].pipelinePreviousTowerId = f.bank.id;
  f.tick();
  assert.equal(f.bank.projectileBank.shots.length, 2);
  assert.equal(f.state.output.length, 2);
  assert.equal(f.state.towers[2].projectileBank.shots.length, 0);
  for (let i = 0; i < 12; i++) f.tick();
  assert.equal(f.state.output.length, 4);
});

test("closed bidirectional loops preserve ammo and move at most once per tick", () => {
  for (const reverseOrder of [false, true]) {
    const f = fixture(["A", "0", "0"]), other = f.outlet;
    if (reverseOrder) { f.bank.placedOrder = 3; f.controller.sync(); }
    f.controller.capture(f.shot({ hitCount: 3 }));
    const original = f.bank.projectileBank.shots[0];
    for (let i = 0; i < 300; i++) {
      f.tick();
      const expected = i % 2 === 0 ? other : f.bank;
      assert.equal(expected.projectileBank.shots[0], original);
      f.controller.update();
      assert.equal(expected.projectileBank.shots[0], original);
      assert.equal(f.bank.projectileBank.shots.length + other.projectileBank.shots.length, 1);
      assert.equal(projectileDamageBudget(original), 1200);
    }
    assert.equal(f.state.output.length, 0);
  }
});

test("connection flow has a bounded burst and refills at 25 shots per level per second", () => {
  const f = fixture(["A", "0"]);
  for (let i = 0; i < 25; i++) assert.equal(f.controller.capture(f.shot()), true);
  assert.equal(f.controller.capture(f.shot()), false);
  f.state.battleTime = 20; assert.equal(f.controller.capture(f.shot()), false);
  f.state.battleTime = 40; assert.equal(f.controller.capture(f.shot()), true);
  f.state.edges[0].level = 2; f.state.battleTime += 20; assert.equal(f.controller.capture(f.shot()), true);
});

test("buffer capacity scales with level and retains over-capacity ammo when temporary levels expire", () => {
  for (const type of ["0", "-", "+"]) {
    const f = fixture(["A", type]); f.state.edges[0].level = 100;
    for (let i = 0; i < 128; i++) assert.equal(f.controller.capture(f.shot()), true);
    assert.equal(f.controller.capture(f.shot()), false);
    f.bank.level = 2; assert.equal(projectileBankCapacity(f.bank), 256);
    for (let i = 0; i < 128; i++) assert.equal(f.controller.capture(f.shot()), true);
    f.bank.levelBonus = 1; assert.equal(f.controller.capture(f.shot()), true);
    f.bank.levelBonus = 0; f.controller.sync();
    assert.equal((f.bank.projectileBank?.shots ?? f.bank.projectileNode.input).length, 257);
    assert.equal(f.controller.capture(f.shot()), false);
  }
});

test("interceptors and numeric outlets are input-only even with outward or bidirectional pipes", () => {
  for (const type of ["-", "1", "+"]) {
    const f = fixture(["A", type, "0"]); f.bank.level = 2;
    for (const mode of ["=", ">", "<", "!="]) {
      f.state.edges[1].mode = mode; f.controller.sync();
      assert.equal(f.controller.isEdgeActive(f.state.edges[1]), mode === "=" || mode === "<");
    }
    f.state.edges[1].mode = "="; f.controller.sync();
    f.controller.capture(f.shot()); f.tick(1000);
    assert.equal(f.bank.projectileNode.input.length, 1);
    assert.equal(f.outlet.projectileBank.shots.length, 0);
    f.controller.capture(f.shot()); f.tick(1000);
    assert.equal(f.outlet.projectileBank.shots.length, 0);
    assert.equal(f.state.output.length, type === "1" ? 2 : 0);
    assert.equal(f.bank.projectileNode.input.length, type === "1" ? 0 : 2);
  }
});

test("healing outlet converts the complete multi-hit damage budget at five to one and never forwards", () => {
  const f = fixture(["A", "+", "1"]);
  const heals = []; f.state.heal = (tower, amount) => { assert.equal(tower, f.bank); heals.push(amount); return true; };
  f.controller.capture(f.shot({ hitCount: 3, partialHitDamage: 200 })); f.tick();
  assert.deepEqual(heals, [200]); assert.equal(nodeOccupancy(f.bank), 0);
  assert.equal(f.state.output.length, 0); assert.equal(f.outlet.projectileNode.input.length, 0);
});

test("healing stock waits for injured allies; upgrades increase capacity without increasing healing or throughput", () => {
  const f = fixture(["A", "+"]); f.state.edges[0].level = 100;
  let injured = false, healed = 0;
  f.state.heal = (_tower, amount) => { assert.equal(amount, 80); if (!injured) return false; healed++; return true; };
  for (let i = 0; i < 128; i++) assert.equal(f.controller.capture(f.shot()), true);
  assert.equal(f.controller.capture(f.shot()), false);
  f.tick(1000); assert.equal(nodeOccupancy(f.bank), 128);
  injured = true; f.tick(); assert.equal(healed, 25);
  f.controller.capture(f.shot()); f.controller.update(); assert.equal(healed, 25);
  f.tick(39); assert.equal(healed, 25); f.tick(1); assert.equal(healed, 26);
  const stock = f.bank.projectileNode.input[0];
  f.bank.level = 2; f.controller.sync(); assert.equal(projectileBankCapacity(f.bank), 256);
  assert.equal(f.bank.projectileNode.input[0], stock);
  f.controller.capture(f.shot()); f.tick(20); assert.equal(healed, 26);
  f.tick(20); assert.equal(healed, 27);
});

test("old bundler jobs and completed stock migrate without losing damage or duplicating effects", () => {
  const f = fixture(["A", "+"]); f.controller.capture(f.shot({ hitCount: 5 }));
  const shot = f.bank.projectileNode.input.pop();
  f.bank.projectileNode.processing = { shots: [shot], count: 5, completeAt: 200 };
  f.bank.projectileNode.output.push({ ...shot, hitCount: 10 });
  f.controller.sync(); f.controller.sync();
  assert.equal(f.bank.projectileNode.processing, undefined);
  assert.equal(nodeOccupancy(f.bank), 2);
  assert.equal(f.bank.projectileNode.input.reduce((sum, shot) => sum + projectileDamageBudget(shot), 0), 6000);
});

test("actions snapshot source stats and survive source removal; outlet execution cannot be captured again", () => {
  const f = fixture(["f", "0", "1"]); f.source.level = 3; f.source.levelBonus = 1;
  f.source.finalStats.attackPower = 321;
  assert.equal(f.controller.captureAction(f.source, { kind: "shock" }), true);
  const stored = f.bank.projectileBank.shots[0];
  f.source.finalStats.attackPower = 999; f.source.level = 9; f.source.inPlay = false;
  f.controller.sync(); f.tick();
  assert.equal(f.state.output.length, 1); assert.equal(f.state.output[0].shot, stored);
  assert.equal(stored.action.level, 4); assert.equal(stored.action.stats.attackPower, 321);
  assert.equal(stored.action.event.kind, "shock");
  withTowerActionContext(f.outlet, { type: "f", level: 4, stats: stored.action.stats }, () => {
    assert.equal(f.controller.captureAction(f.outlet, { kind: "shock" }), false);
  });
});

test("non-damage actions use buffers and numeric outlets but cannot clog damage converters", () => {
  for (const target of ["0", "1", "+", "-"]) {
    const f = fixture(["X", target]);
    assert.equal(f.controller.captureAction(f.source, { kind: "production" }), target === "0" || target === "1");
  }
  const f = fixture(["w", "0"]); f.state.edges[0].mode = "!="; f.controller.sync();
  assert.equal(f.controller.captureAction(f.source, { kind: "skill" }), false);
});

test("local interceptor requires delivered ammo, never steals across closed pipes, and keeps partial leftovers", () => {
  const f = fixture(["A", "0", "-"]); f.controller.capture(f.shot()); f.controller.capture(f.shot()); f.controller.capture(f.shot());
  const target = { ...hostile(f.outlet, 180), owner: "enemy", progress: .8 };
  assert.equal(f.controller.intercept(target, target), false); assert.equal(projectileDamageBudget(target), 180);
  f.state.edges[1].mode = "!="; f.tick(); f.controller.intercept(target, target);
  assert.equal(projectileDamageBudget(target), 180);
  f.state.edges[1].mode = ">"; f.tick();
  f.controller.intercept(target, target); assert.equal(projectileDamageBudget(target), 100);
  f.tick(100); f.controller.intercept(target, target); assert.equal(projectileDamageBudget(target), 20);
  f.tick(100); assert.equal(f.controller.intercept(target, target), true);
  assert.equal(projectileDamageBudget(f.outlet.projectileNode.input[0]), 300);
});

test("interception respects friendly mortars and sweeps high speed shots without changing intact judgments", () => {
  const f = fixture(["A", "-"]); f.controller.capture(f.shot());
  const friendly = { ...hostile(f.outlet), owner: "tower" }; assert.equal(f.controller.intercept(friendly, friendly), false);
  const target = hostile(f.outlet, 400, 3); target.x += CELL_WIDTH * 5;
  f.controller.intercept(target, { x: f.outlet.x - CELL_WIDTH * 5, y: f.outlet.y });
  assert.equal(projectileDamageBudget(target), 1120); assert.equal(target.hitCount, 3);
  consumeProjectileDamage(target, 100);
  const hits = []; forEachProjectileHit(target, d => hits.push(d)); assert.deepEqual(hits, [220, 400, 400]);
  assert.ok(projectileVisualScale(target) < projectileVisualScale({ damage: 400, hitCount: 3 }));
});

test("homing projectiles bypass per-projectile capture because their complete action is routed separately", () => {
  const f = fixture(["0", "A", "0"]), a = f.bank;
  assert.equal(f.controller.capture(f.shot({ type: "chevron", sourceTower: a })), false);
  assert.equal(f.controller.capture(f.shot({ sourceTower: a, targetEnemy: {} })), false);
  for (let i = 0; i < 10; i++) f.controller.capture(f.shot({ sourceTower: a }));
  assert.equal(f.source.projectileBank.shots.length, 5); assert.equal(f.outlet.projectileBank.shots.length, 5);
});

test("edge controls cycle four modes, upgrade without inventory and respect automatic upgrade reserves", () => {
  const state = { edges: [], card: { definition: cardDefinitions.find(c => c.id === "="), readyAt: 0 },
    time: 0, cardTime: 0, chars: 10000, autoEnabled: true, reserve: 0, reserveFocused: false,
    spend: cost => { state.chars -= cost; }, changed() {} };
  const controls = new EdgeTowerControls(() => state), position = { type: "=", axis: "horizontal", column: 1, lane: 2 };
  assert.equal(controls.use(position), "handled");
  const edge = state.edges[0]; assert.equal(edge.mode, "=");
  for (const mode of [">", "<", "!=", "="]) { controls.cycle(edge); assert.equal(edge.mode, mode); }
  assert.equal(controls.use(position), "cooldown");
  state.cardTime = 999; assert.equal(controls.use(position), "cooldown");
  state.cardTime = 1000; controls.use(position); assert.equal(edge.level, 2);
  controls.toggleAuto(edge); state.cardTime = 2000; state.reserve = state.chars;
  controls.attemptAutoUpgrade(); assert.equal(edge.level, 2);
  state.reserve = 0; controls.attemptAutoUpgrade(); assert.equal(edge.level, 3);
  assert.equal(state.chars, 9850); assert.equal("shots" in edge, false);
});

test("logical topology determines neighbors while disconnected inventory remains local", () => {
  const f = fixture(["A", "0"]);
  f.bank.column = 5;
  syncTowerTopology(f.state.towers); f.controller.sync();
  assert.equal(f.controller.capture(f.shot()), false);
  const swap = f.place("&", 1); swap.topologyTarget = { lane: 3, column: 5 };
  syncTowerTopology(f.state.towers); f.controller.sync();
  assert.equal(f.controller.capture(f.shot()), true);
  f.state.edges.length = 0; f.controller.sync(); f.tick(10000);
  assert.equal(f.bank.projectileBank.shots.length, 1);
});

test("empty and unrelated occupied cells are transparent without changing projectile ownership", () => {
  const f = fixture(["A"]), blocker = f.place("B", 2), expensive = f.place("U", 3), bank = f.place("0", 5);
  for (let col = 0; col < 5; col++) f.edge(col, 3, "horizontal", ">");
  f.controller.sync();
  assert.ok(f.state.edges.every(edge => f.controller.isEdgeActive(edge)));
  assert.equal(f.controller.capture(f.shot({ hitCount: 3 })), true);
  const stored = bank.projectileBank.shots[0];
  assert.equal(stored.sourceTower, f.source); assert.equal(stored.hitCount, 3);
  assert.equal(stored.remainingRange, 300);
  assert.equal(blocker.projectileNode, undefined); assert.equal(expensive.projectileNode, undefined);
  assert.equal(f.controller.capture(f.shot({ sourceTower: expensive })), false);
  assert.equal(bank.projectileBank.shots.length, 1);
});

test("five distinct receivers share equally regardless of branch depth, route count or edge order", () => {
  for (const reverseEdges of [false, true]) {
    const f = fixture(["A"]);
    const banks = [f.place("0", 1, 2), ...[3, 5, 7, 9].map(col => f.place("0", col, 4))];
    for (let col = 0; col < 9; col++) f.edge(col);
    f.edge(1, 2, "vertical");
    for (const col of [3, 5, 7, 9]) f.edge(col, 3, "vertical");
    // An alternate route and a loop must not give the far receivers extra shares.
    for (let col = 2; col < 8; col++) f.edge(col, 2);
    f.edge(2, 2, "vertical"); f.edge(8, 2, "vertical");
    f.state.edges.forEach(edge => { edge.level = 10; });
    if (reverseEdges) f.state.edges.reverse();
    f.controller.sync();
    for (let i = 0; i < 50; i++) assert.equal(f.controller.capture(f.shot()), true);
    assert.deepEqual(banks.map(bank => bank.projectileBank.shots.length), [10, 10, 10, 10, 10]);
    assert.equal(new Set(banks.flatMap(bank => bank.projectileBank.shots)).size, 50);
  }
});

test("transparent routes charge every edge atomically and honor closed or reversed bottlenecks", () => {
  const f = fixture(["A"]), bank = f.place("0", 4);
  for (let col = 0; col < 4; col++) f.edge(col, 3, "horizontal", ">");
  const last = f.state.edges.at(-1); last.flowCredit = 0; last.flowUpdatedAt = 0;
  f.controller.sync();
  assert.equal(f.controller.capture(f.shot()), false);
  assert.ok(f.state.edges.slice(0, -1).every(edge => edge.flowCredit === 25));
  f.state.battleTime = 40;
  assert.equal(f.controller.capture(f.shot()), true);
  assert.ok(f.state.edges.slice(0, -1).every(edge => edge.flowCredit === 24));
  assert.equal(last.flowCredit, 0);
  for (const mode of ["!=", "<"]) {
    last.mode = mode; f.controller.sync();
    assert.equal(f.controller.capture(f.shot()), false);
  }
  assert.equal(bank.projectileBank.shots.length, 1);
});

test("saturated paths reroute through alternate transparent links within the same tick", () => {
  const f = fixture(["A"]), bank = f.place("0", 2);
  f.edge(0); const narrow = f.edge(1); narrow.flowCredit = 1; narrow.flowUpdatedAt = 0;
  f.edge(0, 2, "vertical"); f.edge(0, 2); f.edge(1, 2); f.edge(2, 2, "vertical");
  f.controller.sync();
  assert.equal(f.controller.capture(f.shot()), true);
  assert.equal(narrow.flowCredit, 0);
  assert.equal(f.controller.capture(f.shot()), true);
  assert.equal(bank.projectileBank.shots.length, 2);
  assert.ok(f.state.edges.slice(2).every(edge => edge.flowCredit === 24));
});

test("real nodes cannot be bypassed when full, but their removal opens transparent transit", () => {
  for (const type of ["0", "1", "+", "-"]) {
    const f = fixture(["A"]), middle = f.place(type, 2), end = f.place("0", 4);
    for (let col = 0; col < 4; col++) f.edge(col, 3, "horizontal", ">").level = 100;
    f.controller.sync();
    const capacity = type === "1" ? 1 : 128;
    for (let i = 0; i < capacity; i++) assert.equal(f.controller.capture(f.shot()), true);
    assert.equal(f.controller.capture(f.shot()), false);
    assert.equal(end.projectileBank.shots.length, 0);
    middle.inPlay = false; f.controller.sync();
    assert.equal(f.controller.capture(f.shot()), true);
    assert.equal(end.projectileBank.shots.length, 1);
  }
});

test("transparent loops without a receiver cannot swallow or duplicate a source shot", () => {
  const f = fixture(["A"]);
  f.edge(0); f.edge(1, 2, "vertical"); f.edge(0, 2); f.edge(0, 2, "vertical");
  f.controller.sync();
  for (let i = 0; i < 100; i++) assert.equal(f.controller.capture(f.shot()), false);
  assert.ok(f.state.edges.every(edge => !f.controller.isEdgeActive(edge) && edge.flowCredit === 25));
});
