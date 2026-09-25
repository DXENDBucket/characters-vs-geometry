import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { validBattleOperation, executeBattleOperation, towerOperationRef, edgeOperationRef, LOCAL_BATTLE_ACTOR } = load("src/game/battleOperations.ts");
const { BattleSession } = load("src/game/battleSession.ts");
const { BATTLE_RULES_VERSION } = load("src/game/battleSimulation.ts");
const { LANES, COLUMNS } = load("src/config.ts");
const towerRef = id => ({ kind: "tower", id: `tower:${id}` });
const edgeRef = id => ({ kind: "edge", id: `edge:${id}` });
const clone = value => JSON.parse(JSON.stringify(value));
const operations = () => [
  { type: "deploy", card: "A", cell: { lane: 1, column: 2 }, expected: towerRef(1) },
  { type: "effect", card: "b", cell: { lane: 1, column: 2 }, target: towerRef(1) },
  { type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 1, column: 2 }, expected: edgeRef(4) },
  { type: "erase", target: towerRef(1) },
  { type: "autoUpgrade", targets: [towerRef(1), edgeRef(4)], enabled: true },
  { type: "edgeMode", target: edgeRef(4), mode: "<" },
  { type: "move", sources: [{ target: towerRef(1), lane: 1, column: 2 }], destination: { lane: 2, column: 4 } }
];
function fixture() {
  const towers = [1, 2].map((id, index) => ({ entityId: `tower:${id}`, id: `tower:${id - 1}`, type: "A",
    inPlay: true, lane: 1, column: index + 2 }));
  const edges = [{ type: "=", entityId: "edge:4", axis: "horizontal", lane: 1, column: 2 }];
  const applied = [], authorized = [];
  const actors = new Map([["local", LOCAL_BATTLE_ACTOR], ["builder", { id: "builder", permissions: ["build"] }],
    ["viewer", { id: "viewer", permissions: [] }], ["peer", { id: "peer", permissions: ["build", "edit", "move"] }]]);
  const denied = new Set();
  const runtime = {
    ended: false, actor: id => actors.get(id), tower: id => towers.find(tower => tower.entityId === id),
    edge: id => edges.find(edge => edge.entityId === id),
    card: id => ["A", "b", "=", "?A"].includes(id) ? { id } : undefined,
    towerAt: cell => towers.find(tower => tower.lane === cell.lane && tower.column === cell.column),
    edgeAt: pos => edges.find(edge => ["axis", "lane", "column"].every(key => edge[key] === pos[key])),
    affected: (operation, primary) => primary,
    authorize: (actor, operation, targets) => {
      authorized.push([actor.id, operation.type, targets]);
      return ![...targets.towers, ...targets.edges].some(target => denied.has(target.entityId));
    },
    apply: (operation, primary) => { applied.push([operation, primary]); return "handled"; }
  };
  return { runtime, actors, towers, edges, denied, applied, authorized };
}

test("all semantic operations round-trip as bounded JSON with explicit identities and decisions", () => {
  for (const operation of operations()) {
    assert.equal(validBattleOperation(clone(operation)), true, operation.type);
    const f = fixture(), before = clone(operation);
    assert.equal(executeBattleOperation("local", operation, f.runtime), "handled");
    assert.equal(f.applied.length, 1); assert.deepEqual(operation, before);
    assert.equal(f.authorized[0][0], "local");
  }
  assert.equal(validBattleOperation({ type: "edgeCard", card: "=", position: { axis: "vertical", lane: LANES - 2, column: COLUMNS - 1 }, expected: null }), true);
});

test("schema rejects unknown fields, arbitrary payloads, duplicate IDs, sparse lists and out-of-board inputs", () => {
  const invalid = [null, [], {}, new Date(), { type: "erase", target: { kind: "tower", id: "enemy:1" } },
    { type: "erase", target: towerRef(0) }, { type: "edgeMode", target: edgeRef(4), mode: "evil" },
    { ...operations()[0], cost: 0 }, { ...operations()[0], damage: Infinity }, { ...operations()[0], cell: { lane: 1, column: 2, x: 0 } },
    { ...operations()[0], card: "A".repeat(17) }, { ...operations()[0], expected: undefined },
    { type: "autoUpgrade", targets: [], enabled: true }, { type: "autoUpgrade", targets: Array(1), enabled: true },
    { type: "autoUpgrade", targets: [towerRef(1), towerRef(1)], enabled: true },
    { type: "autoUpgrade", targets: Array.from({ length: 1000 }, (_, i) => towerRef(i + 1)), enabled: true },
    { ...operations()[6], sources: Array(1) }, { ...operations()[6], sources: [] },
    { ...operations()[6], sources: [operations()[6].sources[0], operations()[6].sources[0]] },
    { ...operations()[2], position: { axis: "horizontal", lane: 0, column: COLUMNS - 1 } },
    { ...operations()[2], position: { axis: "vertical", lane: LANES - 1, column: 0 } }];
  for (const value of [-1, LANES, Infinity, NaN, .5, "1"]) invalid.push({ ...operations()[0], cell: { lane: value, column: 2 } });
  for (const op of invalid) {
    const f = fixture();
    assert.equal(validBattleOperation(op), false, JSON.stringify(op));
    assert.equal(executeBattleOperation("local", op, f.runtime), "invalid");
    assert.equal(f.authorized.length, 0); assert.equal(f.applied.length, 0);
  }
});

test("participant capabilities and host ownership policy reject before applying any group member", () => {
  const f = fixture();
  for (const actor of ["unknown", "viewer"]) for (const op of operations()) {
    assert.equal(executeBattleOperation(actor, op, f.runtime), "forbidden");
  }
  for (const id of ["", "p".repeat(65), "a.b", "a\nb", "../local", null]) {
    assert.equal(executeBattleOperation(id, operations()[0], f.runtime), "invalid");
  }
  assert.equal(executeBattleOperation("builder", operations()[0], f.runtime), "handled");
  assert.equal(executeBattleOperation("builder", operations()[3], f.runtime), "forbidden");
  f.denied.add("tower:2");
  const group = { type: "autoUpgrade", targets: [towerRef(1), towerRef(2)], enabled: true };
  assert.equal(executeBattleOperation("peer", group, f.runtime), "forbidden");
  assert.equal(f.applied.length, 1);
  f.denied.clear(); assert.equal(executeBattleOperation("peer", group, f.runtime), "handled");
  assert.deepEqual(f.applied.at(-1)[1].towers, f.towers);
});

test("authorization sees secondary column/mirror targets before resource or cooldown mutation", () => {
  const f = fixture();
  f.runtime.affected = () => ({ towers: f.towers, edges: f.edges });
  f.denied.add("tower:2");
  assert.equal(executeBattleOperation("local", operations()[0], f.runtime), "forbidden");
  assert.equal(f.applied.length, 0);
  assert.deepEqual(f.authorized[0][2].towers, f.towers);
});

test("deployment explicitly distinguishes empty placement from upgrading a specific occupant", () => {
  const f = fixture(), request = operations()[0];
  assert.equal(executeBattleOperation("local", { ...request, expected: null }, f.runtime), "stale");
  f.towers[0].entityId = "tower:99";
  assert.equal(executeBattleOperation("local", request, f.runtime), "stale");
  assert.equal(f.towers[0].id, "tower:0", "legacy placement keys must not satisfy entity references");
  delete f.towers[0].entityId;
  assert.equal(executeBattleOperation("local", { ...request, expected: null }, f.runtime), "stale");
  f.towers.length = 0;
  assert.equal(executeBattleOperation("local", request, f.runtime), "stale");
  assert.equal(executeBattleOperation("local", { ...request, expected: null }, f.runtime), "handled");
});

test("removed, transient, NUL or moved targets cannot be operated on by stale commands", () => {
  for (const change of [{ inPlay: false }, { transient: true }, { nullified: true }, { entityId: "tower:99" }]) {
    const f = fixture(); Object.assign(f.towers[0], change);
    for (const op of [operations()[1], operations()[3], operations()[4], operations()[6]]) {
      assert.equal(executeBattleOperation("local", op, f.runtime), "stale");
    }
    assert.equal(f.applied.length, 0);
  }
  const f = fixture(); f.towers[0].column = 6;
  assert.equal(executeBattleOperation("local", operations()[1], f.runtime), "stale");
  assert.equal(executeBattleOperation("local", operations()[6], f.runtime), "stale");
  assert.equal(f.applied.length, 0);
});

test("edge reconstruction at the same position and wrong-kind references cannot steal an old operation", () => {
  const f = fixture(); f.edges[0].entityId = "edge:99";
  for (const op of [operations()[2], operations()[4], operations()[5]]) {
    assert.equal(executeBattleOperation("local", op, f.runtime), "stale");
  }
  const empty = { ...operations()[2], expected: null };
  assert.equal(executeBattleOperation("local", empty, f.runtime), "stale");
  delete f.edges[0].entityId;
  assert.equal(executeBattleOperation("local", empty, f.runtime), "stale");
  f.edges.length = 0;
  assert.equal(executeBattleOperation("local", empty, f.runtime), "handled");
});

test("cards come from the actor runtime, including imitator variants, and ended battles do not apply", () => {
  const f = fixture();
  assert.equal(executeBattleOperation("local", { ...operations()[0], card: "?A" }, f.runtime), "handled");
  assert.equal(executeBattleOperation("local", { ...operations()[0], card: "U" }, f.runtime), "forbidden");
  assert.equal(executeBattleOperation("local", { ...operations()[0], card: "not-a-card" }, f.runtime), "forbidden");
  f.runtime.ended = true;
  assert.equal(executeBattleOperation("local", operations()[0], f.runtime), "unavailable");
  assert.equal(f.applied.length, 1);
});

test("reference builders never fall back to placement IDs or leak live objects", () => {
  const f = fixture();
  assert.deepEqual(towerOperationRef(f.towers[0]), towerRef(1));
  assert.deepEqual(edgeOperationRef(f.edges[0]), edgeRef(4));
  const ref = towerOperationRef(f.towers[0]); ref.id = "tower:999";
  assert.equal(f.towers[0].entityId, "tower:1");
  assert.throws(() => towerOperationRef({ id: "tower:1" }), /Unidentified/);
  assert.throws(() => edgeOperationRef({ entityId: "tower:1" }), /Unidentified/);
  assert.throws(() => LOCAL_BATTLE_ACTOR.permissions.push("admin"), TypeError);
});

test("semantic commands participate in actual session recording, clone isolation and deterministic playback", () => {
  const options = { version: BATTLE_RULES_VERSION, levelId: "1-1", difficulty: 3, difficultyVersion: 2,
    selectedCards: ["A"], unlimitedFirepower: false, debug: false, seed: 42 };
  const session = new BattleSession(options), f = fixture();
  const command = { type: "operation", actorId: "local", operation: operations()[0] };
  session.submit(command, c => executeBattleOperation(c.actorId, c.operation, f.runtime));
  command.operation.cell.column = 12;
  const replay = session.exportReplay();
  assert.equal(replay.commands[0].command.operation.cell.column, 2);
  const restored = new BattleSession(options, replay), other = fixture();
  restored.advance(0, { step() {}, canAdvance: () => true,
    executeCommand: c => executeBattleOperation(c.actorId, c.operation, other.runtime) });
  assert.deepEqual(other.applied, f.applied);
  replay.commands[0].command.operation.target = {};
  assert.throws(() => new BattleSession(options, replay), /Invalid battle operation/);
});
