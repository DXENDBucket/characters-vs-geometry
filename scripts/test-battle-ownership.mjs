import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { LEGACY_BATTLE_POLICY, validBattlePolicy, sameBattlePolicy } = load("src/game/battlePolicy.ts");
const { BATTLE_PERMISSIONS } = load("src/game/battleParticipants.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { towerOperationRef: ref, edgeOperationRef } = load("src/game/battleOperations.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { validateBattleSave } = load("src/game/validateBattleSave.ts");
const { encodeBattleWireGraph, decodeBattleWireGraph } = load("src/game/battleWireGraph.ts");
const { towerCell } = load("src/game/towerTopology.ts");
const { executeTowerVolley } = load("src/game/towerCombat.ts");
const { executePipelineAction } = load("src/game/pipelineActionRules.ts");
const options = (cards, owner = true) => ({ version: BATTLE_RULES_VERSION, difficultyVersion: 2, levelId: "AE-EX-2", difficulty: 3,
  seed: 499, debug: true, unlimitedFirepower: false, selectedCards: cards,
  policy: { ...LEGACY_BATTLE_POLICY, ...(owner ? { towerAccess: "owner" } : {}) },
  participants: [{ id: "a", permissions: BATTLE_PERMISSIONS }, { id: "b", permissions: BATTLE_PERMISSIONS }, { id: "viewer", permissions: [] }] });
function fixture(cards = ["A", "B", "m", "s", "@", "()", "#", "&", "b", "="], owner = true) {
  const runtime = createIndependentBattle(options(cards, owner));
  runtime.world.chars = 1e6; runtime.session.controls.autoUpgradeEnabled = false;
  const hash = () => battleChecksum(runtime.snapshot(cards[0]));
  const ready = card => { runtime.world.loadout.byId.get(card).readyAt = 0; };
  const place = (actor, card, lane, column) => {
    ready(card);
    assert.equal(runtime.executeOperation(actor, { type: "deploy", card, cell: { lane, column }, expected: null }), "deployed");
    return runtime.world.towers.find(t => (t.sourceCardId ?? t.type) === card && t.lane === lane && t.column === column && !t.transient);
  };
  const reject = (actor, operation, expected = "forbidden") => {
    const before = hash(); assert.equal(runtime.executeOperation(actor, operation), expected); assert.equal(hash(), before);
  };
  return { runtime, hash, ready, place, reject };
}
const move = (towers, lane, column) => ({ type: "move", sources: towers.map(t => ({ target: ref(t), lane: t.lane, column: t.column })), destination: { lane, column } });
const upgrade = tower => ({ type: "deploy", card: tower.type, cell: { lane: tower.lane, column: tower.column }, expected: ref(tower) });
const erase = tower => ({ type: "erase", target: ref(tower) });
const effect = (card, target) => ({ type: "effect", card, cell: { lane: target.lane, column: target.column }, target: ref(target) });

test("captured owner policy is optional, bounded, immutable and distinguishes replay permissions", () => {
  const baseline = { ...LEGACY_BATTLE_POLICY };
  assert.equal(sameBattlePolicy(baseline, { ...baseline, towerAccess: "shared" }), true);
  assert.equal(sameBattlePolicy(baseline, { ...baseline, towerAccess: "owner" }), false);
  for (const towerAccess of [null, undefined, true, "all", {}]) assert.equal(validBattlePolicy({ ...baseline, towerAccess }), false);
  const config = options(["A"]), runtime = createIndependentBattle(config);
  config.policy.towerAccess = "shared"; assert.equal(runtime.session.policy.towerAccess, "owner");
  assert.throws(() => { runtime.session.policy.towerAccess = "shared"; });
});

test("owner gates reject upgrades, erase, mixed selection and movement before any mutation", () => {
  const f = fixture(), a = f.place("a", "A", 2, 1), b = f.place("b", "B", 4, 1);
  assert.equal(a.ownerId, "a"); assert.equal(b.ownerId, "b");
  f.reject("b", upgrade(a)); f.reject("b", erase(a));
  f.reject("b", { type: "autoUpgrade", targets: [ref(b), ref(a)], enabled: true });
  f.reject("b", move([a, b], 1, 2));
  f.reject("viewer", erase(a));
  f.reject("a", { ...upgrade(a), ownerId: "b" }, "invalid");
  f.ready("A"); assert.equal(f.runtime.executeOperation("a", upgrade(a)), "deployed");
  assert.equal(a.level, 2); assert.equal(a.ownerId, "a");
  assert.equal(f.runtime.executeOperation("b", erase(b)), "handled");
});

test("legacy shared mode still allows cooperative operations without adding owner fields", () => {
  const f = fixture(["A", "B"], false), a = f.place("a", "A", 2, 1);
  assert.equal(Object.hasOwn(a, "ownerId"), false);
  f.ready("A"); assert.equal(f.runtime.executeOperation("b", upgrade(a)), "deployed");
  assert.equal(f.runtime.executeOperation("b", erase(a)), "handled");
});

test("edge upgrades, modes and auto-upgrade selection carry and enforce ownership", () => {
  const f = fixture(["="]);
  const place = { type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 2, column: 2 }, expected: null };
  assert.equal(f.runtime.executeOperation("a", place), "handled");
  const edge = f.runtime.world.edgeTowers[0], target = edgeOperationRef(edge);
  assert.equal(edge.ownerId, "a");
  f.reject("b", { ...place, expected: target });
  f.reject("b", { type: "edgeMode", target, mode: ">" });
  f.reject("b", { type: "autoUpgrade", targets: [target], enabled: true });
  f.reject("b", { type: "erase", target });
  f.ready("="); assert.equal(f.runtime.executeOperation("a", { ...place, expected: target }), "handled");
  assert.equal(edge.ownerId, "a"); assert.equal(edge.level, 2);
});

test("skill and one-shot triggers cannot act on another player's tower", () => {
  const f = fixture(["w", "i", "b"]), w = f.place("a", "w", 1, 2), i = f.place("a", "i", 3, 2);
  f.reject("b", { type: "skill", skill: "w", targets: [ref(w)], point: null });
  f.reject("b", { type: "trigger", target: ref(i), behavior: "i" });
  f.reject("b", effect("b", w));
  assert.equal(f.runtime.executeOperation("a", { type: "trigger", target: ref(i), behavior: "i" }), "handled");
});

test("unlimited column upgrades and targeted attachments reject foreign recipients as a whole", () => {
  const f = fixture(["A", "b"]), a = f.place("a", "A", 1, 2), b = f.place("b", "A", 4, 2);
  f.runtime.world.options.unlimitedFirepower = true;
  f.ready("A"); f.reject("a", upgrade(a));
  f.reject("a", effect("b", a));
  assert.equal(a.level, 1); assert.equal(b.level, 1);
});

test("automatic column upgrades respect owners and newly filled cells inherit the marked tower's owner", () => {
  const f = fixture(["A"]), a = f.place("a", "A", 1, 2), b = f.place("b", "A", 4, 2);
  assert.equal(f.runtime.executeOperation("a", { type: "autoUpgrade", targets: [ref(a)], enabled: true }), "handled");
  f.runtime.world.options.unlimitedFirepower = true; f.runtime.session.controls.autoUpgradeEnabled = true; f.ready("A");
  const chars = f.runtime.world.chars;
  f.runtime.autoUpgrade();
  assert.equal(a.level, 1); assert.equal(b.level, 1); assert.equal(f.runtime.world.chars, chars);
  assert.equal(f.runtime.world.loadout.byId.get("A").readyAt, 0);
  assert.equal(f.runtime.executeOperation("b", erase(b)), "handled");
  f.runtime.autoUpgrade();
  assert.equal(a.level, 2); assert.equal(f.runtime.world.towers.length, 7);
  assert.ok(f.runtime.world.towers.every(tower => tower.ownerId === "a"));
});

test("mirrors inherit source ownership and foreign anchors cannot create or destroy its network", () => {
  const f = fixture(), source = f.place("a", "A", 3, 2), other = f.place("b", "m", 3, 3);
  assert.equal(f.runtime.world.towers.length, 2);
  assert.equal(f.runtime.executeOperation("b", erase(other)), "handled");
  const anchor = f.place("a", "m", 3, 3), mirror = f.runtime.world.towers.find(t => t.column === 4 && t.lane === 3);
  assert.equal(mirror.ownerId, "a"); assert.equal(mirror.mirrorGroupId, source.mirrorGroupId);
  const foreign = f.place("b", "m", 3, 5);
  assert.equal(f.runtime.world.towers.filter(t => t.lane === 3 && t.column === 6).length, 0);
  assert.equal(f.runtime.executeOperation("b", move([foreign], 2, 5)), "moved");
  assert.equal(source.inPlay, true); assert.equal(mirror.inPlay, true);
  assert.equal(f.runtime.executeOperation("b", erase(foreign)), "handled");
  f.reject("b", erase(anchor)); f.ready("A"); assert.equal(f.runtime.executeOperation("a", upgrade(source)), "deployed");
  assert.deepEqual([source.level, mirror.level], [2, 2]);
  assert.equal(f.runtime.executeOperation("a", erase(anchor)), "handled");
  assert.equal(source.inPlay, false); assert.equal(mirror.inPlay, false);
});

test("s, copied s, and routed s generation inherit the acting tower rather than the last player command", () => {
  const f = fixture(), source = f.place("a", "s", 1, 2);
  f.place("b", "B", 6, 3);
  executeTowerVolley(f.runtime.combat, { type: "volley", tower: source, hitCount: 1 });
  assert.equal(f.runtime.world.towers.find(t => t.type === "a" && t.lane === 1).ownerId, "a");
  const copy = f.place("b", "@", 3, 2); f.place("a", "s", 3, 3); f.runtime.board.syncCopies();
  assert.equal(copy.copiedType, "s"); executeTowerVolley(f.runtime.combat, { type: "volley", tower: copy, hitCount: 1, copyRevision: copy.copyRevision });
  assert.equal(f.runtime.world.towers.find(t => t.type === "a" && t.lane === 3).ownerId, "b");
  const outlet = f.place("b", "B", 5, 1);
  executePipelineAction({ damage: 0, hitCount: 1, damageType: "physical", action: { type: "s", level: 1,
    stats: source.finalStats, event: { kind: "attack" }, baseDamage: 0 } }, outlet,
    { combat: f.runtime.combat, getDefinition: load("src/registry/cardDefinitions.ts").getCardDefinition });
  assert.equal(f.runtime.world.towers.find(t => t.type === "a" && t.lane === 5).ownerId, "b");
});

test("push includes the protective layer and blocks automatic or pipeline-driven foreign movement", () => {
  const f = fixture(), source = f.place("a", "#", 3, 1), inner = f.place("a", "A", 3, 2), shell = f.place("b", "()", 3, 2);
  source.skills.push = { sp: 30, spBuffer: 0, activeUntil: 0 };
  f.reject("a", { type: "push", target: ref(source), cell: { lane: 3, column: 2 } });
  const before = f.hash(); assert.equal(f.runtime.push.push(source, 3, 2, true), false); assert.equal(f.hash(), before);
  assert.equal(inner.column, 2); assert.equal(shell.column, 2);
  assert.equal(f.runtime.executeOperation("b", erase(shell)), "handled");
  assert.equal(f.runtime.executeOperation("a", { type: "push", target: ref(source), cell: { lane: 3, column: 2 } }), "handled");
  assert.equal(inner.column, 3);
});

test("topology preflight includes indirectly remapped foreign towers for connection, move, erase and extraction", () => {
  const f = fixture(["A", "&", "y"]), source = f.place("a", "&", 3, 1), target = f.place("b", "A", 3, 7);
  f.reject("a", { type: "topology", target: ref(source), cell: { lane: 3, column: 7 } });
  assert.equal(f.runtime.executeOperation("a", { type: "topology", target: ref(source), cell: { lane: 3, column: 6 } }), "handled");
  const borrowed = f.place("b", "A", 3, 6), cell = { ...towerCell(borrowed) };
  f.reject("a", erase(source)); f.reject("a", move([source], 2, 1)); f.reject("a", effect("y", source));
  assert.deepEqual(towerCell(borrowed), cell); assert.equal(target.inPlay, true);
});

test("pending one-shot cards and their mirrored sources cannot be upgraded by another neutral-target user", () => {
  const f = fixture(["A", "b", "m"]), neutral = f.runtime.deployment.spawnGeneratedTower("A", 3, 3, 1);
  assert.equal(neutral.ownerId, undefined);
  assert.equal(f.runtime.executeOperation("a", effect("b", neutral)), "handled");
  const pending = f.runtime.world.towers.find(t => t.transient); assert.equal(pending.ownerId, "a");
  f.ready("b"); f.reject("b", effect("b", neutral));
  f.runtime.session.advance(BATTLE_STEP_MS, f.runtime.sessionRuntime);
  assert.equal(neutral.facingDirection, -1);
});

test("save/wire restore and full semantic replay retain ownership including NUL and historical sources", () => {
  const config = options(["A", "B", "i", "="]), runtime = createIndependentBattle(config);
  const authority = new BattleAuthority("ownership", runtime.session, { inputTime: () => 0, available: () => !runtime.world.gameOver,
    execute: command => runtime.executeCommand(command) });
  const send = (actor, intent) => authority.submitTrusted(actor, intent);
  send("a", { type: "control", control: { type: "debugChars" } });
  send("a", { type: "control", control: { type: "autoUpgradeEnabled", enabled: false } });
  send("a", { type: "operation", operation: { type: "deploy", card: "i", cell: { lane: 1, column: 1 }, expected: null } });
  send("b", { type: "operation", operation: { type: "deploy", card: "B", cell: { lane: 3, column: 3 }, expected: null } });
  const i = runtime.world.towers.find(t => t.type === "i"), b = runtime.world.towers.find(t => t.type === "B");
  assert.equal(send("b", { type: "operation", operation: { type: "trigger", target: ref(i), behavior: "i" } }), "forbidden");
  assert.equal(send("a", { type: "operation", operation: { type: "trigger", target: ref(i), behavior: "i" } }), "handled");
  for (let n = 0; n < 3650; n++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
  assert.ok(runtime.nullification.snapshot()?.towers.some(t => t.ownerId === "b"));
  const graph = captureBattleSnapshot(runtime.snapshot("A")), wave = runtime.world.wave;
  validateBattleSave(graph, wave);
  const wire = decodeBattleWireGraph(JSON.parse(JSON.stringify(encodeBattleWireGraph(graph))));
  const restored = createIndependentBattle(config, { checkpoint: wire });
  assert.equal(battleChecksum(restored.snapshot("A")), battleChecksum(runtime.snapshot("A")));
  for (const delta of [1000 / 30, 1000 / 144]) {
    const replay = runtime.session.exportReplay(), played = createIndependentBattle(config, { playback: replay });
    for (let n = 0; n < 20000 && !played.session.playbackComplete; n++) played.session.advance(delta, played.sessionRuntime);
    assert.equal(battleChecksum(played.snapshot("A")), battleChecksum(runtime.snapshot("A")));
  }
  for (let n = 0; n < 620; n++) {
    runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime); restored.session.advance(BATTLE_STEP_MS, restored.sessionRuntime);
  }
  assert.equal(battleChecksum(restored.snapshot("A")), battleChecksum(runtime.snapshot("A")));
  assert.equal(restored.world.towers.find(t => t.entityId === b.entityId)?.ownerId, "b");
  const corrupt = structuredClone(graph), tower = corrupt.nodes.find(node => node.kind === "tower"); tower.data.ownerId = "stranger";
  assert.throws(() => validateBattleSave(corrupt, wave), /Unknown battle entity owner/);
});

test("pending attacks retain removed-source ownership and malformed cross-owner mirror graphs are refused", () => {
  const f = fixture(["A", "m", "F"]), source = f.place("a", "F", 1, 1);
  assert.equal(f.runtime.executeOperation("a", { type: "trigger", target: ref(source), behavior: "F" }), "handled");
  assert.equal(source.inPlay, false);
  const a = f.place("a", "A", 3, 2); f.place("a", "m", 3, 3);
  const graph = captureBattleSnapshot(f.runtime.snapshot("A"));
  validateBattleSave(graph, 0);
  const removed = graph.nodes.find(node => node.kind === "tower" && node.data.id === source.id);
  assert.equal(removed.data.ownerId, "a");
  const restored = createIndependentBattle(f.runtime.session.exportReplay(), { checkpoint: graph });
  assert.equal(restored.session.actions.snapshot().find(entry => entry.action.type === "shock").action.tower.ownerId, "a");
  const corrupt = structuredClone(graph);
  corrupt.nodes.find(node => node.kind === "tower" && node.data.id === a.id).data.ownerId = "b";
  assert.throws(() => validateBattleSave(corrupt, 0), /Mirror network crosses/);
});

test("automatic push cannot move an owned ampersand when chained topology would remap a foreign tower", () => {
  const f = fixture(), pusher = f.place("a", "#", 3, 1), amp = f.place("a", "&", 3, 2);
  assert.equal(f.runtime.executeOperation("a", { type: "topology", target: ref(amp), cell: { lane: 3, column: 7 } }), "handled");
  const foreign = f.place("b", "A", 3, 7);
  // In logical space the ampersand is now at column 7; move the pusher next to it.
  assert.equal(f.runtime.executeOperation("a", move([pusher], 3, 6)), "moved");
  const before = f.hash();
  assert.equal(f.runtime.push.push(pusher, amp.lane, amp.column, true), false);
  assert.equal(f.hash(), before); assert.deepEqual(towerCell(foreign), { lane: 3, column: 2 });
});
