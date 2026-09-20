import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader();
const { withTowerActionContext } = load("src/game/towerIdentity.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const topology = load("src/game/towerTopology.ts");
function fixture() {
  const towers = [];
  const place = (type, column, lane = 3, level = 1) => {
    const tower = { id: `tower:${towers.length}`, type, column, lane, level, inPlay: true, transient: false };
    towers.push(tower); return tower;
  };
  return { towers, place, getDefinition: id => cardDefinitions.find(c => c.id === id) };
}

test("borrowed action contexts never grant persistent zeal, unyielding or slow auras", () => {
  const { towerAuraSources, syncUnyieldingAuras } = load("src/game/towerAuras.ts");
  const { slowAuraSources } = load("src/game/slowAura.ts");
  const f = fixture(), number = f.place("1", 2);
  for (const type of ["e", "g", "T"]) {
    withTowerActionContext(number, { type, level: 5, stats: {} }, () => {
      assert.equal(towerAuraSources(f.towers).hasZeal, false);
      syncUnyieldingAuras(f.towers);
      assert.equal(number.unyieldingRatio, 0);
      assert.equal(slowAuraSources(f.towers).hasAura, false);
    });
  }
});

test("AE-4 panel, wave pool and rewards", () => {
  const level = load("src/data/levels.ts").getLevelConfig("AE-4");
  assert.equal(level.totalWaves, 20); assert.equal(level.unlockAfter, "AE-3");
  assert.deepEqual(level.enemyKinds, ["circle", "triangle", "triangle2", "triangle3", "equals", "equals2", "equals3", "mortarTriangle", "pentagon"]);
  assert.deepEqual([level.firstWaveWeight, level.waveWeightIncrement, level.waveWeightIncrementGrowth, level.startingChars], [25, 18, 3, 500]);
  for (const [id, cost, cd] of [["+", 1000, 30000], ["&", 4200, 120000]]) {
    const card = fixture().getDefinition(id);
    assert.deepEqual([card.cost, card.cooldown, card.category, card.attackPower], [cost, cd, "function", 0]);
    assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement(id), "AE-4");
  }
  assert.equal(load("src/game/upgrades.ts").isMaxHpUpgradeable("&"), true);
});

test("topology swaps compose in activation order and removal recomputes the remaining permutation", () => {
  const f = fixture(), first = f.place("&", 1), second = f.place("&", 5), target = f.place("A", 9);
  first.placedOrder = 1; second.placedOrder = 2;
  first.topologyTarget = { lane: 3, column: 5 }; first.topologyOrder = 10;
  second.topologyTarget = { lane: 3, column: 9 }; second.topologyOrder = 20;
  topology.syncTowerTopology(f.towers);
  assert.deepEqual(topology.towerCell(first), { lane: 3, column: 9 });
  assert.deepEqual(topology.towerCell(second), { lane: 3, column: 1 });
  assert.deepEqual(topology.towerCell(target), { lane: 3, column: 5 });
  assert.equal(first.column, 1); assert.equal(target.column, 9);
  first.inPlay = false; topology.syncTowerTopology(f.towers);
  assert.deepEqual(topology.towerCell(second), { lane: 3, column: 9 });
  assert.deepEqual(topology.towerCell(target), { lane: 3, column: 5 });
  second.inPlay = false; topology.syncTowerTopology(f.towers);
  assert.equal(topology.towerCell(target).column, 9);
});

test("logical auras and range outlines include remote cells and leave holes", () => {
  const f = fixture(), e = f.place("e", 2), swap = f.place("&", 3), remote = f.place("A", 10, 6);
  for (const tower of f.towers) {
    tower.x = load("src/config.ts").BOARD_X + (tower.column + .5) * load("src/config.ts").CELL_WIDTH;
    tower.y = load("src/config.ts").BOARD_Y + (tower.lane + .5) * load("src/config.ts").CELL_HEIGHT;
  }
  swap.topologyTarget = { lane: remote.lane, column: remote.column }; swap.topologyOrder = 0;
  topology.syncTowerTopology(f.towers);
  assert.equal(topology.inFriendlyRange(e, remote, 2, true), true);
  assert.equal(topology.inFriendlyRange(e, swap, 2, true), false);
  const lines = [], graphics = { lineStyle() { return this; }, lineBetween(...args) { lines.push(args); return this; } };
  load("src/render/towerLogicalRange.ts").drawLogicalTowerRange(graphics, e, 2, true, 0xffffff);
  const { CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
  const edge = tower => [tower.x - e.x - CELL_WIDTH / 2, tower.y - e.y - CELL_HEIGHT / 2,
    tower.x - e.x + CELL_WIDTH / 2, tower.y - e.y - CELL_HEIGHT / 2];
  assert.ok(lines.some(line => JSON.stringify(line) === JSON.stringify(edge(remote))));
  assert.ok(lines.some(line => JSON.stringify(line) === JSON.stringify(edge(swap))));
});
