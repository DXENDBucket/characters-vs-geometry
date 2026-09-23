import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

test("O specializes in magic resistance without changing its cost, health or cooldown", () => {
  const { cardDefinitions } = createTypeScriptLoader()("src/data/cards.ts");
  const card = cardDefinitions.find(card => card.id === "O");
  assert.equal(card.armor, 300);
  assert.equal(card.magicResistance, 70);
  assert.equal(card.maxHp, 3000);
  assert.equal(card.cost, 125);
  assert.equal(card.cooldown, 20000);
  assert.equal(card.stats, "3000 A300 MR70");
});

// Load the pure rules with the project's compiler, without a browser or Phaser.
const source = fs.readFileSync(new URL("../src/game/rules/towerMovement.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});
const { planTowerMove } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const pushModule = ts.transpileModule(fs.readFileSync(new URL("../src/game/rules/towerPush.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});
const { planTowerPush } = await import(`data:text/javascript;base64,${Buffer.from(pushModule.outputText).toString("base64")}`);

test("box push moves contiguous chains in all four directions, leaving the source and towers beyond gaps unchanged", () => {
  for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const source = { id: "source", lane: 3, column: 6, inPlay: true };
    const towers = [source, ...[1, 2, 4].map(n => ({ id: String(n), lane: 3 + n * dy, column: 6 + n * dx, inPlay: true }))];
    const board = { lanes: 7, columns: 13, getTower: id => towers.find(t => t.id === id),
      occupantAt: (lane, column) => towers.find(t => t.lane === lane && t.column === column)?.id,
      isCellDeployable: () => true };
    const plan = planTowerPush(source, towers[1], board);
    assert.deepEqual(plan.map(m => m.towerId), ["1", "2"]);
    assert.equal(plan.every(m => m.toLane - m.fromLane === dy && m.toColumn - m.fromColumn === dx && !m.erased), true);
    assert.equal(source.lane, 3);
    assert.equal(source.column, 6);
    assert.equal(planTowerPush(source, source, board), null);
    assert.equal(planTowerPush(source, { lane: 4, column: 7 }, board), null);
    assert.equal(planTowerPush(source, { lane: 3 - dy, column: 6 - dx }, board), null);
  }
});

test("box push erases at board edges and sealed destinations instead of blocking", () => {
  for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const source = { id: "source", lane: dy < 0 ? 2 : dy > 0 ? 4 : 3, column: dx < 0 ? 2 : dx > 0 ? 10 : 6, inPlay: true };
    const towers = [source, ...[1, 2].map(n => ({ id: String(n), lane: source.lane + n * dy, column: source.column + n * dx, inPlay: true }))];
    const board = { lanes: 7, columns: 13, getTower: id => towers.find(t => t.id === id),
      occupantAt: (lane, column) => towers.find(t => t.lane === lane && t.column === column)?.id,
      isCellDeployable: () => true };
    assert.deepEqual(planTowerPush(source, towers[1], board).map(m => m.erased), [false, true]);
    board.isCellDeployable = (lane, column) => lane !== towers[2].lane || column !== towers[2].column;
    const sealed = planTowerPush(source, towers[1], board);
    assert.equal(sealed.length, 1);
    assert.equal(sealed[0].erased, true);
  }
});

const { LoadoutReselection, RESELECT_UNLOCK_LEVEL, RESELECT_COOLDOWN } = createTypeScriptLoader()("src/game/loadoutReselection.ts");

test("changing imitation target cannot reset the imitator cooldown and preserves the native slot", () => {
  const state = new LoadoutReselection();
  state.confirm(240000, [{ definition: { id: "?A" }, readyAt: 502000, displayTime: 500000 },
    { definition: { id: "A" }, readyAt: 501000 }]);
  assert.equal(state.cardReadyAt("?B", 500000, 240000), 502000);
  assert.equal(state.cardReadyAt("A"), 501000);
  const restored = new LoadoutReselection(); restored.restore(state.snapshot());
  assert.equal(restored.cardReadyAt("?=", 750000, 241000), 751000);
  assert.equal(restored.cardReadyAt("?()", 900000, 244000), 900000);
});

test("reselection unlocks after 2-4 and starts each battle and confirmation with a full 240-second cooldown", () => {
  const state = new LoadoutReselection();
  assert.equal(RESELECT_UNLOCK_LEVEL, "2-4");
  assert.equal(RESELECT_COOLDOWN, 240_000);
  assert.equal(state.isReady(0), false);
  assert.equal(state.readyRatio(0), 0);
  assert.equal(state.confirm(0, []), false);
  assert.equal(state.readyRatio(120_000), 0.5);
  assert.equal(state.isReady(239_999), false);
  assert.equal(state.isReady(240_000), true);
  assert.equal(state.confirm(240_000, []), true);
  assert.equal(state.isReady(240_000), false);
  assert.equal(state.readyRatio(240_000), 0);
  assert.equal(state.readyRatio(360_000), 0.5);
  assert.equal(state.isReady(479_999), false);
  assert.equal(state.isReady(480_000), true);
  assert.equal(state.readyRatio(999_999), 1);
  assert.equal(new LoadoutReselection().readyRatio(0), 0);
});

test("reselection preserves card deadlines across removal, return and separate card clocks", () => {
  const state = new LoadoutReselection();
  const a = { definition: { id: "A" }, readyAt: 900_000 };
  const c = { definition: { id: "c" }, readyAt: 123_456 };
  const cards = [a, c];
  state.confirm(240_000, cards);
  a.readyAt = 0;
  assert.equal(state.cardReadyAt("A"), 900_000);
  assert.equal(state.cardReadyAt("c"), 123_456);
  assert.equal(state.cardReadyAt("B"), 0);
  assert.equal(state.confirm(479_999, [a]), false);
  assert.equal(state.cardReadyAt("A"), 900_000);
  state.confirm(480_000, [{ definition: { id: "B" }, readyAt: 600_000 }]);
  assert.equal(state.cardReadyAt("A"), 900_000);
  assert.equal(state.cardReadyAt("B"), 600_000);
  state.confirm(720_000, [{ definition: { id: "A" }, readyAt: 950_000 }]);
  assert.equal(state.cardReadyAt("A"), 950_000);
  assert.equal(state.cardReadyAt("c"), 123_456);
});

function fixture() {
  const a = { id: "tower:0", lane: 1, column: 2, inPlay: true };
  const b = { id: "tower:1", lane: 2, column: 3, inPlay: true };
  const towers = new Map([[a.id, a], [b.id, b]]);
  const occupied = new Map([["1:2", a.id], ["2:3", b.id]]);
  const sealed = new Set();
  const board = {
    lanes: 7,
    columns: 13,
    getTower: (id) => towers.get(id),
    occupantAt: (lane, column) => occupied.get(`${lane}:${column}`),
    isCellDeployable: (lane, column) => !sealed.has(`${lane}:${column}`)
  };
  const command = (selected = [a, b], lane = 3, column = 7) => ({
    type: "moveTowers",
    sources: selected.map((tower) => ({ towerId: tower.id, lane: tower.lane, column: tower.column })),
    destination: { lane, column }
  });
  return { a, b, towers, occupied, sealed, board, command };
}

test("a JSON round-trip command preserves the diagonal formation and compounded cooldown", () => {
  const f = fixture();
  const request = JSON.parse(JSON.stringify(f.command()));
  assert.deepEqual(planTowerMove(request, f.board), {
    valid: true,
    moves: [
      { towerId: f.a.id, fromLane: 1, fromColumn: 2, toLane: 3, toColumn: 7 },
      { towerId: f.b.id, fromLane: 2, fromColumn: 3, toLane: 4, toColumn: 8 }
    ],
    cooldownMs: 18_000
  });
  assert.equal(planTowerMove(f.command([f.a]), f.board).cooldownMs, 15_000);
  const c = { id: "tower:2", lane: 3, column: 3, inPlay: true };
  f.towers.set(c.id, c);
  f.occupied.set("3:3", c.id);
  assert.ok(Math.abs(planTowerMove(f.command([f.a, f.b, c]), f.board).cooldownMs - 21_600) < 1e-8);
});

test("anchor is topmost, then leftmost, independent of selection order", () => {
  const f = fixture();
  const forward = planTowerMove(f.command(), f.board);
  const reversed = planTowerMove(f.command([f.b, f.a]), f.board);
  assert.deepEqual(reversed.moves.slice().reverse(), forward.moves);
  f.occupied.delete("2:3");
  f.b.lane = 1;
  f.occupied.set("1:3", f.b.id);
  const sameRow = planTowerMove(f.command([f.b, f.a]), f.board);
  assert.equal(sameRow.moves.find((move) => move.towerId === f.a.id).toColumn, 7);
});

test("moving a group into its own vacated cells is allowed", () => {
  const f = fixture();
  assert.equal(planTowerMove(f.command([f.a, f.b], 2, 3), f.board).valid, true);
});

test("an unrelated occupant blocks the entire move", () => {
  const f = fixture();
  f.occupied.set("4:8", "tower:other");
  assert.deepEqual(planTowerMove(f.command(), f.board), { valid: false, reason: "occupied" });
  assert.equal(f.a.lane, 1);
  assert.equal(f.b.lane, 2);
});

test("any sealed or out-of-bounds destination rejects the entire group", () => {
  const f = fixture();
  f.sealed.add("4:8");
  assert.deepEqual(planTowerMove(f.command(), f.board), { valid: false, reason: "sealed" });
  for (const [lane, column] of [[6, 7], [3, 12], [-1, 0], [0, -1]]) {
    assert.deepEqual(planTowerMove(f.command([f.a, f.b], lane, column), f.board), { valid: false, reason: "outside" });
  }
});

test("preview cannot authorize a later move after the board changes", () => {
  const f = fixture();
  const request = f.command();
  assert.equal(planTowerMove(request, f.board).valid, true);
  f.occupied.set("4:8", "tower:new");
  assert.deepEqual(planTowerMove(request, f.board), { valid: false, reason: "occupied" });
  f.occupied.delete("4:8");
  f.b.column += 1;
  assert.deepEqual(planTowerMove(request, f.board), { valid: false, reason: "stale" });
});

test("removed or replaced source towers invalidate the request", () => {
  for (const change of [
    (f) => { f.b.inPlay = false; },
    (f) => { f.towers.delete(f.b.id); },
    (f) => { f.occupied.set("2:3", "tower:replacement"); }
  ]) {
    const f = fixture();
    const request = f.command();
    change(f);
    assert.deepEqual(planTowerMove(request, f.board), { valid: false, reason: "stale" });
  }
});

test("duplicate sources and non-integral coordinates are rejected", () => {
  const f = fixture();
  assert.deepEqual(planTowerMove(f.command([f.a, f.a]), f.board), { valid: false, reason: "invalid" });
  for (const lane of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(planTowerMove(f.command([f.a], lane, 0), f.board), { valid: false, reason: "invalid" });
  }
  assert.deepEqual(planTowerMove(f.command([]), f.board), { valid: false, reason: "empty" });
});

test("planning never mutates the command or source state", () => {
  const f = fixture();
  const request = f.command();
  request.sources.forEach(Object.freeze);
  Object.freeze(request.sources);
  Object.freeze(request.destination);
  Object.freeze(request);
  Object.freeze(f.a);
  Object.freeze(f.b);
  const before = [...f.occupied];
  assert.equal(planTowerMove(request, f.board).valid, true);
  assert.deepEqual([...f.occupied], before);
});
