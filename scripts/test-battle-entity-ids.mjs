import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
import { legacyEncodeBattleWireGraph } from "./helpers/legacy-battle-wire.mjs";

const load = createTypeScriptLoader();
const { BattleEntityIds, BATTLE_ENTITY_KINDS, parseBattleEntityId, setBattleEntityIds,
  identifyBattleEntity, withoutBattleEntityAllocation } = load("src/game/battleEntityIds.ts");
const { collectBattleEntities, restoreBattleEntityIds, BattleEntityIndex } = load("src/game/battleEntityGraph.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { decodeSaveGraph, canonicalSaveGraph } = load("src/game/saveGraph.ts");
const { encodeBattleWireGraph, decodeBattleWireGraph } = load("src/game/battleWireGraph.ts");
const { EdgeTowerControls } = load("src/game/edgeTowerControls.ts");
const { classifyBattleData } = load("src/game/battleDataSchema.ts");
const legacyWire = graph => legacyEncodeBattleWireGraph(graph, { canonicalSaveGraph, classifyBattleData, parseBattleEntityId });

const shapes = () => [
  { id: "tower:0", type: "A", inPlay: true },
  { kind: "circle", waveNumber: 1, inPlay: true },
  { kind: "octahedron", advanceMinionKind: "square", rank: 1 },
  { type: "bolt", limitDirection: 1, vx: 1 },
  { sourceLane: 0, vx: -1 },
  { owner: "tower", fromX: 10, progress: 0 },
  { type: "=", axis: "horizontal", lane: 0, column: 0 }
];
function fixture() {
  const ids = new BattleEntityIds();
  const [tower, enemy, boss, projectile, hostile, mortar, edge] = shapes()
    .map((entity, i) => ids.identify(BATTLE_ENTITY_KINDS[i], entity));
  const copy = ids.identify("boss", { ...boss, entityId: undefined });
  const cargo = ids.identify("enemy", { ...enemy, entityId: undefined, inPlay: false });
  const removed = ids.identify("tower", { ...tower, entityId: undefined, id: "tower:1", inPlay: false });
  enemy.parenthesisCargo = [cargo]; cargo.parenthesisCarrier = enemy;
  boss.octahedronCopies = [copy];
  tower.healthPool = { members: [tower, removed], hp: 100 };
  removed.healthPool = tower.healthPool;
  projectile.sourceTower = removed; projectile.targetEnemy = cargo; projectile.targetBossPart = copy;
  mortar.sourceTower = tower; mortar.targetEnemy = enemy;
  const state = { towers: [tower], enemies: [enemy], boss, projectiles: [projectile], enemyProjectiles: [hostile],
    mortarProjectiles: [mortar], edgeTowers: [edge], actions: [{ tower: removed, target: cargo }], entityIds: ids.snapshot() };
  return { ids, state, tower, enemy, boss, copy, cargo, removed, projectile, edge };
}

test("IDs are local, monotonic across kinds and retained by mutable entities", () => {
  const a = new BattleEntityIds(), b = new BattleEntityIds();
  const values = shapes();
  for (const [i, kind] of BATTLE_ENTITY_KINDS.entries()) {
    assert.equal(a.identify(kind, values[i]), values[i]);
    assert.equal(values[i].entityId, `${kind}:${i + 1}`);
    assert.equal(b.identify(kind, {}).entityId, values[i].entityId);
  }
  values[0].column = 8; values[0].level = 10;
  assert.equal(a.identify("tower", values[0]).entityId, "tower:1");
  assert.equal(a.snapshot().nextId, 8);
  assert.throws(() => a.identify("enemy", values[0]), /identity changed/);
  assert.throws(() => a.identify("tower", { ...values[0] }), /restored/);
  assert.throws(() => b.identify("tower", values[0]), /restored/);
  values[0].entityId = "tower:100";
  assert.throws(() => a.identify("tower", values[0]), /identity changed/);
});

test("invalid kinds, malformed IDs and numeric overflow are rejected", () => {
  const ids = new BattleEntityIds();
  for (const id of [null, 1, "", "tower:0", "tower:01", "tower:-1", "tower:1.5", "tower:1e2", "tower:1\n",
    "tower:9007199254740991", "enemy:9007199254740992", "thing:1", " boss:2"]) {
    assert.equal(parseBattleEntityId(id), undefined, String(id));
  }
  assert.deepEqual(parseBattleEntityId("boss:9007199254740990"), { kind: "boss", sequence: 9007199254740990 });
  assert.throws(() => ids.identify("body", {}), /kind/);
  assert.throws(() => ids.identify("tower", Object.freeze({})), TypeError);
  assert.equal(ids.snapshot().nextId, 1);
  ids.restore([], { version: 1, nextId: Number.MAX_SAFE_INTEGER });
  assert.throws(() => ids.identify("tower", {}), /exhausted/);
});

test("restore validates all identities before changing entities or the active allocator", () => {
  const ids = new BattleEntityIds(), original = ids.identify("tower", {});
  const missing = {}, existing = { entityId: "enemy:5" };
  for (const metadata of [null, 0, {}, { version: 2, nextId: 6 }, { version: 1, nextId: 0 },
    { version: 1, nextId: Infinity }, { version: 1, nextId: 1.5 }]) {
    assert.throws(() => ids.restore([], metadata), /allocator/);
  }
  const invalid = [
    [[{ kind: "enemy", entity: missing }], { version: 1, nextId: 6 }],
    [[{ kind: "enemy", entity: existing }], { version: 1, nextId: 5 }],
    [[{ kind: "tower", entity: existing }], undefined],
    [[{ kind: "enemy", entity: existing }, { kind: "enemy", entity: { ...existing } }], undefined],
    [[{ kind: "tower", entity: missing }, { kind: "tower", entity: missing }], undefined],
    [[{ kind: "tower", entity: missing }, { kind: "body", entity: {} }], undefined]
  ];
  for (const [entries, metadata] of invalid) {
    assert.throws(() => ids.restore(entries, metadata));
    assert.equal(missing.entityId, undefined); assert.equal(existing.entityId, "enemy:5");
    assert.equal(ids.snapshot().nextId, 2); assert.equal(ids.identify("tower", original), original);
  }
});

test("an empty restored battlefield never reuses a removed entity's ID", () => {
  const ids = new BattleEntityIds();
  for (let i = 0; i < 100; i++) ids.identify("projectile", {});
  const state = { towers: [], entityIds: ids.snapshot() };
  const restored = restoreBattleEntityIds(state);
  assert.equal(restored.identify("tower", {}).entityId, "tower:101");
  state.entityIds.nextId = 1;
  assert.equal(restored.identify("enemy", {}).entityId, "enemy:102");
});

test("legacy adoption is deterministic, preserves supplied IDs and includes detached references", () => {
  const first = fixture().state, second = fixture().state;
  for (const state of [first, second]) {
    delete state.entityIds;
    for (const { entity } of collectBattleEntities(state)) delete entity.entityId;
    state.boss.entityId = "boss:30";
    const ids = restoreBattleEntityIds(state);
    assert.equal(state.entityIds.nextId, 40); assert.equal(ids.snapshot().nextId, 40);
    assert.equal(state.boss.entityId, "boss:30");
    assert.equal(state.towers[0].entityId, "tower:31");
    assert.equal(collectBattleEntities(state).length, 10);
  }
  assert.deepEqual(captureBattleSnapshot(first), captureBattleSnapshot(second));
});

test("IDs and cyclic relationships survive JSON snapshots and resolve to the restored objects", () => {
  const f = fixture(), encoded = captureBattleSnapshot(f.state);
  const copy = decodeSaveGraph(JSON.parse(JSON.stringify(encoded)), () => ({}));
  const restoredIds = restoreBattleEntityIds(copy);
  const index = new BattleEntityIndex(copy), originalIndex = new BattleEntityIndex(f.state);
  assert.equal(index.size, 10);
  const ref = originalIndex.reference(f.removed), removed = index.resolve(ref);
  assert.notEqual(removed, f.removed); assert.equal(removed, copy.actions[0].tower);
  assert.equal(removed.healthPool, copy.towers[0].healthPool);
  assert.equal(copy.projectiles[0].sourceTower, removed);
  assert.equal(copy.projectiles[0].targetEnemy.parenthesisCarrier, copy.enemies[0]);
  assert.equal(copy.projectiles[0].targetBossPart, copy.boss.octahedronCopies[0]);
  assert.equal(index.resolve({ kind: "enemy", id: ref.id }), undefined);
  assert.equal(index.resolve({ kind: "tower", id: "tower:999" }), undefined);
  ref.id = "tower:999"; assert.equal(originalIndex.reference(f.removed).id, f.removed.entityId);
  assert.throws(() => index.reference(f.removed), /not in this battle/);
  assert.equal(restoredIds.identify("enemy", {}).entityId, f.ids.identify("enemy", {}).entityId);
});

test("collection and capture do not evaluate excluded display fields or allocate IDs", () => {
  const f = fixture(), initial = f.ids.snapshot();
  Object.defineProperty(f.tower, "body", { enumerable: true, get() { throw Error("Read renderer"); } });
  Object.defineProperty(f.enemy, "body", { enumerable: true, get() { throw Error("Read renderer"); } });
  Object.defineProperty(f.edge, "body", { enumerable: true, get() { throw Error("Read renderer"); } });
  assert.equal(collectBattleEntities(f.state).length, 10);
  assert.doesNotThrow(() => captureBattleSnapshot(f.state));
  assert.deepEqual(f.ids.snapshot(), initial);
  assert.throws(() => collectBattleEntities({ bad: new Map() }), /Non-data/);
});

test("identity checksums include allocation history; explicit behavior-only diagnostics do not", () => {
  const f = fixture();
  const legacy = captureBattleSnapshot(f.state, { includeEntityIds: false });
  assert.equal(legacy.nodes.some(node => "entityId" in node.data || "entityIds" in node.data), false);
  const expected = battleChecksum(f.state), rulesOnly = battleChecksum(f.state, { includeEntityIds: false });
  f.state.entityIds.nextId++;
  assert.notEqual(battleChecksum(f.state), expected);
  assert.equal(battleChecksum(f.state, { includeEntityIds: false }), rulesOnly);
  const decoded = decodeSaveGraph(legacy, () => ({}));
  assert.equal(battleChecksum(decoded), rulesOnly);
});

test("authoritative captures and indexes reject duplicate, missing and wrong-kind IDs", () => {
  const f = fixture(), original = f.enemy.entityId;
  for (const value of [undefined, f.tower.entityId, "enemy:999", "enemy:0"]) {
    f.enemy.entityId = value;
    assert.throws(() => captureBattleSnapshot(f.state), /battle entity ID/);
    if (value !== "enemy:999") assert.throws(() => new BattleEntityIndex(f.state), /entity index/);
  }
  f.enemy.entityId = original; f.cargo.entityId = original;
  assert.throws(() => captureBattleSnapshot(f.state), /duplicate/);
  assert.throws(() => new BattleEntityIndex(f.state), /entity index/);
  for (const metadata of [null, 0, { version: 2, nextId: 100 }]) {
    f.state.entityIds = metadata;
    assert.throws(() => captureBattleSnapshot(f.state), /allocator/);
  }
});

test("live factory bindings isolate worlds and suppress allocations during nested restore failures", () => {
  const a = {}, b = {}, idsA = new BattleEntityIds(), idsB = new BattleEntityIds();
  setBattleEntityIds(a, idsA); setBattleEntityIds(b, idsB);
  assert.equal(identifyBattleEntity(a, "tower", {}).entityId, "tower:1");
  assert.throws(() => withoutBattleEntityAllocation(a, () => {
    assert.equal(identifyBattleEntity(a, "tower", {}).entityId, undefined);
    assert.equal(identifyBattleEntity(b, "tower", {}).entityId, "tower:1");
    withoutBattleEntityAllocation(a, () => assert.equal(identifyBattleEntity(a, "enemy", {}).entityId, undefined));
    throw Error("bad snapshot");
  }), /bad snapshot/);
  assert.equal(identifyBattleEntity(a, "enemy", {}).entityId, "enemy:2");
  setBattleEntityIds(a, new BattleEntityIds());
  assert.equal(identifyBattleEntity(a, "enemy", {}).entityId, "enemy:1");
  assert.equal(identifyBattleEntity(b, "enemy", {}).entityId, "enemy:2");
});

test("edge IDs survive upgrades and mode changes; replacement at the same edge gets a new ID", () => {
  const ids = new BattleEntityIds();
  const runtime = { edges: [], card: { definition: { cost: 50, cooldown: 1000 }, readyAt: 0 },
    time: 0, cardTime: 0, chars: 10000, autoEnabled: true, reserve: 0, reserveFocused: false,
    spend() {}, changed() {}, identify: edge => ids.identify("edge", edge) };
  const controls = new EdgeTowerControls(() => runtime);
  const position = shapes().at(-1);
  controls.use(position); const edge = runtime.edges[0], id = edge.entityId;
  controls.cycle(edge); controls.toggleAuto(edge);
  runtime.cardTime = 1000; controls.attemptAutoUpgrade();
  assert.equal(edge.entityId, id); assert.equal(edge.level, 2); assert.equal(ids.snapshot().nextId, 2);
  runtime.edges.length = 0; runtime.cardTime = 2000;
  controls.use(edge); assert.notEqual(runtime.edges[0].entityId, id);
  assert.equal(runtime.edges[0].entityId, "edge:2");
});

function reverseFields(root) {
  const seen = new Set(), pending = [root];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    const entries = Object.entries(value);
    pending.push(...entries.map(([, child]) => child));
    if (!Array.isArray(value)) {
      for (const [key] of entries) delete value[key];
      for (const [key, child] of entries.reverse()) value[key] = child;
    }
  }
  return root;
}

test("canonical checksums ignore field insertion and traversal history, not identity, array order or exact numbers", () => {
  const f = fixture(), before = captureBattleSnapshot(f.state), expected = battleChecksum(f.state);
  reverseFields(f.state);
  const reordered = captureBattleSnapshot(f.state);
  assert.notEqual(JSON.stringify(before), JSON.stringify(reordered));
  assert.equal(battleChecksum(f.state), expected);
  assert.equal(JSON.stringify(canonicalSaveGraph(before)), JSON.stringify(canonicalSaveGraph(reordered)));
  assert.deepEqual(captureBattleSnapshot(f.state, { canonical: true }), canonicalSaveGraph(reordered));
  f.state.actions.push({ tower: f.tower, target: f.enemy });
  const hash = battleChecksum(f.state);
  f.state.actions.reverse(); assert.notEqual(battleChecksum(f.state), hash);
  f.state.actions.reverse(); assert.equal(battleChecksum(f.state), hash);
  f.enemy.x = 186.624576969851; const coordinate = battleChecksum(f.state);
  f.enemy.x = 186.62457696985103; assert.notEqual(battleChecksum(f.state), coordinate);
  f.enemy.x = 186.624576969851;
  f.projectile.sourceTower = f.tower; assert.notEqual(battleChecksum(f.state), coordinate);
});

test("fused wire traversal preserves the previous exact bytes across reference and key permutations", () => {
  const f = fixture();
  f.state.mixedKeys = { 10: { source: f.removed }, 2: { enemy: f.enemy },
    z: [f.cargo, null, f.copy, -0, NaN, Infinity, -Infinity], a: f.tower.healthPool };
  const original = captureBattleSnapshot(f.state), expected = JSON.stringify(legacyWire(original));
  for (let round = 0; round < 40; round++) {
    const order = original.nodes.map((_, i) => i);
    let seed = round + 1;
    for (let i = order.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1); [order[i], order[j]] = [order[j], order[i]];
    }
    const indices = new Map(order.map((old, index) => [old, index]));
    const remap = value => value && typeof value === "object" && "ref" in value ? { ref: indices.get(value.ref) } : value;
    const input = { root: remap(original.root), nodes: order.map(index => ({ kind: original.nodes[index].kind,
      data: Object.fromEntries(Object.entries(original.nodes[index].data).reverse().map(([key, value]) => [key, remap(value)])) })) };
    // Valid but unreachable records are removed by canonical traversal, even if not battle entities.
    input.nodes.push({ kind: "object", data: { ignored: true } });
    const before = JSON.stringify(input);
    assert.equal(JSON.stringify(legacyWire(input)), expected);
    const wire = encodeBattleWireGraph(input);
    assert.equal(JSON.stringify(wire), expected);
    assert.equal(JSON.stringify(input), before);
    assert.equal(battleChecksum(decodeSaveGraph(decodeBattleWireGraph(wire), () => ({}))), battleChecksum(f.state));
    wire.objects[0].data.changed = true;
    assert.equal(JSON.stringify(input), before);
  }
  for (const root of [null, true, 42, "plain", { number: "-0" }]) {
    const graph = { root, nodes: [] };
    assert.equal(JSON.stringify(encodeBattleWireGraph(graph)), JSON.stringify(legacyWire(graph)));
  }
});

test("fused wire encoding retains full input validation and entity identity rejection", () => {
  const original = captureBattleSnapshot(fixture().state);
  const mutations = [
    graph => { graph.root = { ref: graph.nodes.length }; },
    graph => { graph.nodes.find(node => node.kind === "enemy").data.entityId = "tower:5"; },
    graph => { graph.nodes.find(node => node.kind === "enemy").kind = "tower"; },
    graph => { graph.nodes[graph.root.ref].data.entityId = "tower:50"; },
    graph => { graph.nodes.find(node => node.kind === "array").data["-1"] = 0; },
    graph => { Object.defineProperty(graph.nodes[0].data, "__proto__", { value: null, enumerable: true }); },
    graph => {
      const index = graph.nodes.length;
      graph.nodes.push(structuredClone(graph.nodes.find(node => node.kind === "enemy")));
      graph.nodes[graph.root.ref].data.duplicate = { ref: index };
    },
    graph => { graph.nodes.push({ kind: "object", data: { invalidEvenWhenUnreachable: NaN } }); }
  ];
  for (const mutate of mutations) {
    const input = structuredClone(original); mutate(input);
    assert.throws(() => legacyWire(input));
    assert.throws(() => encodeBattleWireGraph(input));
  }
});

test("wire references use stable IDs for every entity kind, preserving cycles, detached sources and shared pools", () => {
  const f = fixture(), graph = captureBattleSnapshot(f.state), wire = encodeBattleWireGraph(graph);
  assert.equal(wire.entities.length, 10);
  assert.ok(wire.objects.every(node => node.kind === "array" || node.kind === "object"));
  const shot = wire.entities.find(e => e.id === f.projectile.entityId);
  assert.deepEqual(shot.data.sourceTower, { entity: f.removed.entityId });
  assert.deepEqual(shot.data.targetEnemy, { entity: f.cargo.entityId });
  assert.deepEqual(shot.data.targetBossPart, { entity: f.copy.entityId });
  assert.ok(wire.entities.some(e => e.kind === "edge" && e.id === f.edge.entityId));
  assert.ok(wire.entities.every(e => !("entityId" in e.data)));
  const restored = decodeSaveGraph(decodeBattleWireGraph(JSON.parse(JSON.stringify(wire))), () => ({}));
  assert.equal(battleChecksum(restored), battleChecksum(f.state));
  assert.equal(restored.actions[0].tower, restored.projectiles[0].sourceTower);
  assert.equal(restored.towers[0].healthPool, restored.actions[0].tower.healthPool);
  assert.equal(restored.enemies[0].parenthesisCargo[0].parenthesisCarrier, restored.enemies[0]);
  assert.equal(restored.projectiles[0].targetBossPart, restored.boss.octahedronCopies[0]);
  assert.equal(restoreBattleEntityIds(restored).identify("tower", {}).entityId, "tower:11");
  reverseFields(f.state);
  assert.equal(JSON.stringify(encodeBattleWireGraph(captureBattleSnapshot(f.state))), JSON.stringify(wire));
  assert.deepEqual(captureBattleSnapshot(decodeSaveGraph(graph, () => ({}))), graph, "Local save encoding is unchanged");
});

test("wire reconstruction is independent of entity record order and data property order", () => {
  const state = fixture().state, wire = encodeBattleWireGraph(captureBattleSnapshot(state));
  const copy = structuredClone(wire);
  copy.entities.reverse(); reverseFields(copy);
  const restoredGraph = decodeBattleWireGraph(copy);
  assert.equal(battleChecksum(decodeSaveGraph(restoredGraph, () => ({}))), battleChecksum(state));
  assert.equal(JSON.stringify(encodeBattleWireGraph(restoredGraph)), JSON.stringify(wire));
});

test("wire decoding rejects missing, duplicate, hidden, mismatched and unreachable entities before hydration", () => {
  const original = encodeBattleWireGraph(captureBattleSnapshot(fixture().state));
  for (const mutate of [
    w => w.version++, w => w.extra = 1, w => w.root = { ref: 0 },
    w => w.root = { object: w.objects.length }, w => w.root = { entity: "enemy:999" },
    w => w.entities.push(structuredClone(w.entities[0])), w => w.entities[0].kind = "tower",
    w => w.entities[0].id = "boss:0", w => w.entities[0].data.entityId = w.entities[0].id,
    w => w.entities[0].data.body = 1,
    w => w.entities[0].data.x = { entity: w.entities[0].id, extra: 1 },
    w => w.entities[0].data.x = { number: "+0" }, w => w.entities[0].data.x = NaN,
    w => w.entities[0].data.x = { object: -1 },
    w => w.entities[0].data.x = Object.assign(Object.create({}), { entity: w.entities[0].id }),
    w => w.objects.push({ kind: "object", data: {} }),
    w => w.objects.push({ kind: "object", data: { type: "=", axis: "horizontal" } }),
    w => w.objects[0].data = JSON.parse('{"__proto__":null}'),
    w => w.objects.find(n => n.kind === "array").data.length = 100000000,
    w => w.objects.find(n => n.kind === "array").data[250001] = null,
    w => w.objects = new Array(250001).fill({ kind: "object", data: {} })
  ]) {
    const value = structuredClone(original); mutate(value);
    assert.throws(() => decodeBattleWireGraph(value));
  }
  const noIds = captureBattleSnapshot(fixture().state, { includeEntityIds: false });
  assert.throws(() => encodeBattleWireGraph(noIds), /identity/);
});

test("canonical graph traversal handles deep cycles without recursion and retains non-finite values", () => {
  const graph = { root: { ref: 0 }, nodes: Array.from({ length: 12000 }, (_, i) => ({ kind: "object", data: {
    next: { ref: (i + 1) % 12000 }, maximum: { number: "Infinity" }, minimum: { number: "-Infinity" }, invalid: { number: "NaN" }
  } })) };
  const before = JSON.stringify(graph), canonical = canonicalSaveGraph(graph);
  assert.equal(JSON.stringify(graph), before);
  assert.equal(JSON.stringify(encodeBattleWireGraph(graph)), JSON.stringify(legacyWire(graph)));
  const restored = decodeSaveGraph(decodeBattleWireGraph(encodeBattleWireGraph(graph)), () => ({}));
  assert.equal(restored.maximum, Infinity); assert.equal(restored.minimum, -Infinity); assert.ok(Number.isNaN(restored.invalid));
  let current = restored; for (let i = 0; i < 12000; i++) current = current.next;
  assert.equal(current, restored);
  assert.equal(canonical.nodes.length, 12000);
  assert.deepEqual(captureBattleSnapshot(restored, { canonical: true }), canonical);
});

test("signed zero survives local and wire JSON checkpoints and affects authoritative checksums", () => {
  const f = fixture(); f.enemy.x = -0; f.enemy.y = 0;
  const graph = captureBattleSnapshot(f.state), expected = battleChecksum(f.state);
  for (const encoded of [JSON.parse(JSON.stringify(graph)),
    decodeBattleWireGraph(JSON.parse(JSON.stringify(encodeBattleWireGraph(graph))))]) {
    const state = decodeSaveGraph(encoded, () => ({}));
    assert.ok(Object.is(state.enemies[0].x, -0));
    assert.ok(Object.is(state.enemies[0].y, 0));
    assert.equal(battleChecksum(state), expected);
  }
  f.enemy.x = 0;
  assert.notEqual(battleChecksum(f.state), expected);
});
