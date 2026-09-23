import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader();
const { syncTowerOccupancy, towerInPlacementLayer, towerAreaTargets, towerDamageReceiver, parenthesisAtPoint } = load("src/game/towerOccupancy.ts");
const { planTowerMove } = load("src/game/rules/towerMovement.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const { cardUnlockRequirement } = load("src/data/cardUnlocks.ts");
const tower = (type, column = 3) => ({ id: `${type}:${column}`, type, lane: 2, column, x: column * 80, y: 160, inPlay: true });

test("parenthesis shell keeps its own defenses, unlocks after AE-5 and upgrades HP", () => {
  const shell = cardDefinitions.find(card => card.id === "()"), O = cardDefinitions.find(card => card.id === "O");
  for (const key of ["maxHp", "attackPower", "cooldown"]) assert.equal(shell[key], O[key], key);
  assert.equal(shell.armor, 500); assert.equal(shell.magicResistance, 40);
  assert.equal(shell.cost, 275); assert.equal(shell.category, "defense");
  assert.equal(cardUnlockRequirement("()"), "AE-5");
  assert.equal(load("src/game/upgrades.ts").isMaxHpUpgradeable("()"), true);
});

test("either placement order keeps one independent inner layer and one shell", () => {
  for (const reverse of [false, true]) {
    const inner = tower("A"), shell = tower("()"), occupied = new Map();
    syncTowerOccupancy(reverse ? [shell, inner] : [inner, shell], occupied);
    assert.equal(occupied.get("2:3"), inner);
    assert.equal(towerInPlacementLayer(occupied, 2, 3, "A"), inner);
    assert.equal(towerInPlacementLayer(occupied, 2, 3, "()"), shell);
    assert.equal(towerDamageReceiver(inner), shell);
    assert.equal(towerDamageReceiver(shell), shell);
    assert.equal(parenthesisAtPoint(inner, inner.x, inner.y), undefined);
    assert.equal(parenthesisAtPoint(inner, inner.x + 32, inner.y), shell);
  }
});

test("area targets snapshot one judgment per cell, including when that judgment breaks the shell", () => {
  const inner = tower("A"), shell = tower("()"), occupied = new Map();
  syncTowerOccupancy([shell, inner], occupied);
  const targets = towerAreaTargets([shell, inner]); assert.deepEqual(targets, [inner]);
  shell.inPlay = false; syncTowerOccupancy([shell, inner], occupied);
  assert.equal(targets.length, 1); assert.equal(towerDamageReceiver(inner), inner);
  inner.inPlay = false; shell.inPlay = true; syncTowerOccupancy([shell, inner], occupied);
  assert.equal(occupied.get("2:3"), shell);
  assert.equal(towerInPlacementLayer(occupied, 2, 3, "A"), undefined);
  assert.deepEqual(towerAreaTargets([shell, inner]), [shell]);
});

test("movement checks occupancy in the moving tower's own layer", () => {
  const inner = tower("A"), shell = tower("()"), other = tower("B", 4), occupied = new Map();
  const towers = [inner, shell, other]; syncTowerOccupancy(towers, occupied);
  const byId = new Map(towers.map(tower => [tower.id, tower]));
  const board = { lanes: 7, columns: 13, getTower: id => byId.get(id), isCellDeployable: () => true,
    occupantAt: (lane, column, id) => towerInPlacementLayer(occupied, lane, column, byId.get(id).type)?.id };
  const move = target => planTowerMove({ type: "moveTowers", sources: [{ towerId: target.id, lane: 2, column: 3 }], destination: { lane: 2, column: 4 } }, board);
  assert.equal(move(shell).valid, true); assert.equal(move(inner).valid, false);
  shell.column = 4; syncTowerOccupancy(towers, occupied);
  assert.equal(towerDamageReceiver(inner), inner); assert.equal(towerDamageReceiver(other), shell);
});
