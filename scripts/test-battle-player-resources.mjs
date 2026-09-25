import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { LEGACY_BATTLE_POLICY, validBattlePolicy, sameBattlePolicy } = load("src/game/battlePolicy.ts");
const { BATTLE_PERMISSIONS } = load("src/game/battleParticipants.ts");
const { validateBattlePlayerResources } = load("src/game/battlePlayerResources.ts");
const { validateReplay } = load("src/game/battleCommands.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { validateBattleSave } = load("src/game/validateBattleSave.ts");
const { encodeBattleWireGraph, decodeBattleWireGraph } = load("src/game/battleWireGraph.ts");
const { towerOperationRef: ref, edgeOperationRef } = load("src/game/battleOperations.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { getTowerSkillState } = load("src/game/skillState.ts");
const { BattlePlayerView } = load("src/game/battlePlayerView.ts");
const participants = [{ id: "b", permissions: BATTLE_PERMISSIONS }, { id: "a", permissions: BATTLE_PERMISSIONS },
  { id: "viewer", permissions: ["debug", "settings", "loadout", "move"] }];
const policy = { ...LEGACY_BATTLE_POLICY, towerAccess: "owner", walletMode: "individual", resourceMode: "individual" };
const config = (cards = ["A", "B", "X", "c", "@", "y", "t", "b", "=", "1"]) => ({ version: BATTLE_RULES_VERSION,
  difficultyVersion: 2, levelId: "AE-EX-2", difficulty: 3, seed: 571, debug: true, unlimitedFirepower: false,
  selectedCards: cards, participants, policy });
const deploy = (card, lane, column, expected = null) => ({ type: "deploy", card, cell: { lane, column }, expected });
const effect = (card, tower) => ({ type: "effect", card, cell: { lane: tower.lane, column: tower.column }, target: ref(tower) });
const move = (tower, lane, column) => ({ type: "move", sources: [{ target: ref(tower), lane: tower.lane, column: tower.column }], destination: { lane, column } });
function fixture(options = config()) {
  const runtime = createIndependentBattle(options), player = id => runtime.players.get(id);
  for (const id of ["a", "b"]) {
    runtime.executeControl(id, { type: "autoUpgradeEnabled", enabled: false });
    runtime.world.gainChars(50000, id);
  }
  const ready = (id, card) => { player(id).loadout.byId.get(card).readyAt = 0; };
  const place = (id, card, lane, column) => {
    ready(id, card); assert.equal(runtime.executeOperation(id, deploy(card, lane, column)), "deployed");
    return runtime.world.towers.find(t => t.lane === lane && t.column === column && t.type === card);
  };
  const hash = () => battleChecksum(runtime.snapshot(options.selectedCards[0]));
  const advance = ticks => { for (let i = 0; i < ticks; i++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime); };
  return { runtime, player, ready, place, hash, advance, options };
}

test("player presentation reads the right wallet, cards, clocks and ownership without changing simulation context", () => {
  const f = fixture({ ...config(["A", "B"]), playerLoadouts: [{ actorId: "a", cards: ["A"] }, { actorId: "b", cards: ["B"] }] });
  const a = new BattlePlayerView(f.runtime, "a"), b = new BattlePlayerView(f.runtime, "b");
  f.runtime.world.gainChars(900, "a"); f.player("a").cardTime = 2000; f.player("b").cardTime = 900;
  f.player("a").auto.autoUpgradeEnabled = true;
  const before = f.hash();
  assert.deepEqual(a.loadout.ids, ["A"]); assert.deepEqual(b.loadout.ids, ["B"]);
  assert.equal(a.chars, f.runtime.world.effectiveChars("a")); assert.notEqual(a.chars, b.chars);
  assert.equal(a.rawChars, f.runtime.world.economy.balance("a"));
  assert.equal(a.cardTimeFor("A"), 2000); assert.equal(b.cardTimeFor("B"), 900);
  assert.equal(a.autoEnabledFor({ ownerId: "b" }), false); assert.equal(b.autoEnabledFor({ ownerId: "a" }), true);
  assert.equal(a.canControl({ ownerId: "b" }), false); assert.equal(a.canControl({}), true);
  assert.equal(a.can("build"), true); assert.equal(new BattlePlayerView(f.runtime, "viewer").can("build"), false);
  assert.throws(() => new BattlePlayerView(f.runtime, "unknown"));
  assert.equal(f.hash(), before);
  assert.equal(f.runtime.currentResources, f.runtime.players.shared);
});

test("player presentation resolves replacement resources after restore, not stale card/cooldown references", () => {
  const f = fixture(config(["A", "B"]));
  const view = new BattlePlayerView(f.runtime, "a"), old = view.resources;
  f.place("a", "A", 1, 1);
  f.player("a").extraction.restore(275); f.player("a").shifter.readyAt = 15000;
  const saved = f.runtime.snapshot("A");
  f.player("a").loadout.reselection.restore({ readyAt: 0, cards: [] });
  f.runtime.restore(saved);
  assert.notEqual(view.resources, old);
  assert.equal(view.loadout.byId.get("A").readyAt, getCardDefinition("A").cooldown);
  assert.equal(view.resources.shifter.readyAt, 15000);
  assert.equal(view.resources.extraction.value, 275);
});

test("resource policy is optional and independent loadouts are validated, captured and immutable from caller edits", () => {
  assert.equal(validBattlePolicy(policy), true);
  assert.equal(validBattlePolicy({ ...LEGACY_BATTLE_POLICY, resourceMode: "individual" }), false);
  for (const resourceMode of [null, undefined, true, "each"]) assert.equal(validBattlePolicy({ ...policy, resourceMode }), false);
  assert.equal(sameBattlePolicy(LEGACY_BATTLE_POLICY, { ...LEGACY_BATTLE_POLICY, resourceMode: "shared" }), true);
  const options = { ...config(["A", "B"]), playerLoadouts: [{ actorId: "a", cards: ["A"] }, { actorId: "b", cards: ["B"] }] };
  const f = fixture(options); options.playerLoadouts[0].cards[0] = "X";
  assert.deepEqual(f.player("a").loadout.ids, ["A"]); assert.deepEqual(f.player("b").loadout.ids, ["B"]);
  assert.deepEqual(f.runtime.session.initialPlayerLoadouts[0].cards, ["A"]);
  const copy = f.runtime.session.initialPlayerLoadouts; copy[0].cards[0] = "X";
  assert.deepEqual(f.runtime.session.initialPlayerLoadouts[0].cards, ["A"]);
  f.place("a", "A", 1, 1); f.place("b", "B", 2, 1);
  const before = f.hash(); assert.equal(f.runtime.executeOperation("a", deploy("B", 3, 1)), "forbidden"); assert.equal(f.hash(), before);
});

test("invalid initial loadouts reject missing actors, duplicates, imitator duplicates, locked cards and shared-mode overrides", () => {
  const base = config(), good = [{ actorId: "a", cards: ["A"] }, { actorId: "b", cards: ["B"] }];
  for (const playerLoadouts of [[], good.slice(0, 1), good.slice().reverse(),
    [{ actorId: "a", cards: ["A", "A"] }, good[1]], [{ actorId: "a", cards: ["?A", "?B"] }, good[1]],
    [good[0], { actorId: "viewer", cards: ["B"] }], [{ actorId: "a", cards: ["?"] }, good[1]]]) {
    assert.throws(() => createIndependentBattle({ ...base, playerLoadouts }));
  }
  assert.throws(() => createIndependentBattle({ ...base, policy: LEGACY_BATTLE_POLICY, playerLoadouts: good }));
  assert.throws(() => createIndependentBattle({ ...base, policy: { ...policy, allowedCards: ["A"] }, playerLoadouts: good }));
  assert.throws(() => createIndependentBattle({ ...base, policy: { ...policy, slotCount: 1 } }));
});

test("both players can deploy the same card and upgrade their own connector in the same tick", () => {
  const f = fixture(); f.place("a", "A", 1, 1);
  assert.equal(f.player("b").loadout.byId.get("A").readyAt, 0);
  assert.equal(f.runtime.executeOperation("b", deploy("A", 2, 1)), "deployed");
  assert.equal(f.runtime.executeOperation("a", deploy("A", 3, 1)), "cooldown");
  for (const [id, lane] of [["a", 1], ["b", 2]]) {
    assert.equal(f.runtime.executeOperation(id, { type: "edgeCard", card: "=", position: { axis: "horizontal", lane, column: 2 }, expected: null }), "handled");
  }
  assert.equal(f.runtime.world.loadout.byId.get("A").readyAt, 0, "legacy shared view must not become an implicit player's deck");
});

test("independent loadouts also work with a deliberately shared wallet", () => {
  const f = fixture({ ...config(["A"]), policy: { ...policy, walletMode: "shared" } });
  const before = f.runtime.world.effectiveChars();
  f.place("a", "A", 1, 1); assert.equal(f.runtime.executeOperation("b", deploy("A", 2, 1)), "deployed");
  assert.ok(Math.abs(f.runtime.world.effectiveChars() - (before - getCardDefinition("A").cost * 2)) < 1e-7);
  assert.equal(f.runtime.world.economy.individual, false);
});

test("original and imitator slots keep separate cooldowns while upgrading only their owner's matching towers", () => {
  const f = fixture(config(["A", "?A", "B"])), a = f.place("a", "A", 1, 1), peer = f.place("b", "A", 4, 1);
  assert.equal(f.player("a").loadout.byId.get("?A").readyAt, 0);
  assert.equal(f.runtime.executeOperation("a", deploy("?A", 2, 1)), "deployed");
  assert.equal(f.player("a").loadout.byId.get("?A").readyAt, getCardDefinition("?A").cooldown);
  for (const tower of f.runtime.world.towers.filter(t => t.ownerId === "a")) f.runtime.executeOperation("a",
    { type: "autoUpgrade", targets: [ref(tower)], enabled: true });
  f.ready("a", "A"); f.ready("a", "?A");
  f.runtime.executeControl("a", { type: "autoUpgradeEnabled", enabled: true });
  assert.equal(a.level, 2); assert.equal(peer.level, 1);
  assert.deepEqual(f.runtime.world.towers.filter(t => t.ownerId === "a").map(t => t.level), [2, 2]);
  assert.equal(f.player("b").loadout.byId.get("?A").readyAt, 0);
});

test("automatic upgrade settings, reserves, tower targets and edge cooldowns are isolated", () => {
  const f = fixture(), a = f.place("a", "A", 1, 1), b = f.place("b", "A", 2, 1);
  for (const tower of [a, b]) f.runtime.executeOperation(tower.ownerId, { type: "autoUpgrade", targets: [ref(tower)], enabled: true });
  f.ready("a", "A"); f.ready("b", "A");
  f.runtime.executeControl("a", { type: "reserve", value: 999999 });
  f.runtime.executeControl("a", { type: "autoUpgradeEnabled", enabled: true });
  f.runtime.executeControl("b", { type: "autoUpgradeEnabled", enabled: true });
  assert.equal(a.level, 1); assert.equal(b.level, 2);
  assert.equal(f.player("a").auto.reserveChars, 999999); assert.equal(f.player("b").auto.reserveChars, 0);
  f.runtime.executeControl("a", { type: "reserve", value: 0 }); assert.equal(a.level, 2);
  for (const [id, lane] of [["a", 3], ["b", 4]]) {
    f.runtime.executeOperation(id, { type: "edgeCard", card: "=", position: { axis: "horizontal", lane, column: 2 }, expected: null });
    const edge = f.runtime.world.edgeTowers.at(-1);
    f.runtime.executeOperation(id, { type: "autoUpgrade", targets: [edgeOperationRef(edge)], enabled: true });
    f.ready(id, "=");
  }
  f.runtime.autoUpgrade(); assert.deepEqual(f.runtime.world.edgeTowers.map(edge => edge.level), [2, 2]);
});

test("shifter cooldown is charged only to the mover and preserved through restore", () => {
  const f = fixture(), a = f.place("a", "A", 1, 1), b = f.place("b", "B", 4, 1);
  assert.equal(f.runtime.executeOperation("a", move(a, 1, 2)), "moved");
  assert.equal(f.runtime.executeOperation("a", move(a, 1, 3)), "cooldown");
  assert.equal(f.player("b").shifter.readyAt, 0);
  assert.equal(f.runtime.executeOperation("b", move(b, 4, 2)), "moved");
  const restored = createIndependentBattle(f.options, { checkpoint: captureBattleSnapshot(f.runtime.snapshot("A")) });
  assert.deepEqual(restored.players.snapshot(), f.runtime.players.snapshot());
  assert.equal(restored.executeOperation("b", move(restored.world.towers.find(t => t.ownerId === "b"), 4, 3)), "cooldown");
});

test("reselection changes only the caller's deck and remembers that player's removed-card cooldown", () => {
  const f = fixture(); f.place("a", "A", 1, 1); f.place("b", "B", 4, 1);
  const deadline = f.player("a").loadout.byId.get("A").readyAt, peer = f.runtime.players.snapshot()[1];
  f.player("a").loadout.reselection.restore({ readyAt: 0, cards: [] });
  assert.equal(f.runtime.executeControl("a", { type: "reselect", cards: ["B", "X"] }), "handled");
  assert.deepEqual(f.player("a").loadout.ids, ["B", "X"]); assert.deepEqual(f.runtime.players.snapshot()[1], peer);
  assert.equal(f.runtime.executeControl("a", { type: "reselect", cards: ["A"] }), "cooldown");
  f.player("a").loadout.reselection.restore({ ...f.player("a").loadout.reselection.snapshot(), readyAt: 0 });
  f.runtime.executeControl("a", { type: "reselect", cards: ["A", "X"] });
  assert.equal(f.player("a").loadout.byId.get("A").readyAt, deadline);
  const restored = createIndependentBattle(f.options, { checkpoint: captureBattleSnapshot(f.runtime.snapshot("A")) });
  assert.deepEqual(restored.players.get("a").loadout.ids, ["A", "X"]);
});

test("delayed extraction fills separate pools and consuming one leaves the other untouched", () => {
  const f = fixture(), a = f.place("a", "A", 1, 1), b = f.place("b", "B", 4, 1);
  a.level = 6; b.level = 2; f.runtime.board.refresh();
  assert.equal(f.runtime.executeOperation("a", effect("y", a)), "handled");
  assert.equal(f.runtime.executeOperation("b", effect("y", b)), "handled");
  f.advance(1);
  assert.equal(f.player("a").extraction.value, getCardDefinition("A").cost * 3);
  assert.equal(f.player("b").extraction.value, getCardDefinition("B").cost);
  const bPool = f.player("b").extraction.value, made = f.place("a", "A", 1, 1);
  assert.equal(made.level, 3); assert.equal(f.player("a").extraction.value, 0); assert.equal(f.player("b").extraction.value, bPool);
  assert.equal(f.runtime.players.shared.extraction.value, 0);
});

test("pending attachment refunds affect only its owner's cooldown despite interleaved player commands", () => {
  const f = fixture(), a = f.place("a", "A", 1, 1), b = f.place("b", "B", 4, 1), cost = getCardDefinition("t").cost;
  f.player("a").extraction.restore(cost * 3);
  assert.equal(f.runtime.executeOperation("a", effect("t", a)), "handled");
  assert.equal(f.runtime.executeOperation("b", effect("t", b)), "handled");
  const peerDeadline = f.player("b").loadout.byId.get("t").readyAt;
  f.advance(1);
  assert.equal(f.player("a").loadout.byId.get("t").readyAt, f.player("a").cardTime + getCardDefinition("t").cooldown / 3 - BATTLE_STEP_MS);
  assert.equal(f.player("b").loadout.byId.get("t").readyAt, peerDeadline);
  assert.ok(a.trueDamageUntil > b.trueDamageUntil);
});

test("clock acceleration follows each c owner without accelerating another player's cards", () => {
  const f = fixture(), c = f.place("a", "c", 1, 2);
  getTowerSkillState(c, "clock").activeUntil = 10000;
  f.advance(1);
  assert.equal(f.player("a").cardTime, BATTLE_STEP_MS * 2); assert.equal(f.player("b").cardTime, BATTLE_STEP_MS);
  const other = f.place("b", "c", 4, 1);
  getTowerSkillState(other, "clock").activeUntil = 10000;
  f.advance(1);
  assert.equal(f.player("a").cardTime, BATTLE_STEP_MS * 4); assert.equal(f.player("b").cardTime, BATTLE_STEP_MS * 3);
});

test("debug resets only its caller's card clocks and non-builders cannot mutate resource controls", () => {
  const f = fixture(); f.place("a", "A", 1, 1); f.place("b", "B", 4, 1);
  const beforeB = f.player("b").loadout.byId.get("B").readyAt;
  assert.equal(f.runtime.executeControl("a", { type: "debugChars" }), "handled");
  assert.equal(f.player("a").loadout.byId.get("A").readyAt, 0); assert.equal(f.player("b").loadout.byId.get("B").readyAt, beforeB);
  for (const control of [{ type: "reserve", value: 0 }, { type: "reselect", cards: ["A"] }, { type: "autoUpgradeEnabled", enabled: true }, { type: "debugChars" }]) {
    const before = f.hash(); assert.equal(f.runtime.executeControl("viewer", control), "forbidden"); assert.equal(f.hash(), before);
  }
});

test("malformed or missing per-player resource snapshots are rejected before host hydration", () => {
  const f = fixture(), saved = f.runtime.players.snapshot(), check = value => validateBattlePlayerResources(value, policy, participants);
  check(saved);
  for (const value of [undefined, [], saved.slice().reverse()]) assert.throws(() => check(value));
  for (const change of [entry => { entry.actorId = "viewer"; }, entry => { entry.cardTime = Infinity; },
    entry => { entry.cards[0].readyAt = -1; }, entry => { entry.cards.push(entry.cards[0]); }, entry => { entry.extraction = -1; },
    entry => { entry.reserveChars = 1.2; }, entry => { entry.shifter.cooldownDuration = 0; },
    entry => { entry.reselection.cards = [["A", 0], ["A", 0]]; }]) {
    const bad = structuredClone(saved); change(bad[0]); assert.throws(() => check(bad));
  }
  assert.throws(() => validateBattlePlayerResources(saved, LEGACY_BATTLE_POLICY, participants));
  const graph = captureBattleSnapshot(f.runtime.snapshot("A")); delete graph.nodes[graph.root.ref].data.playerResources;
  assert.throws(() => validateBattleSave(graph, 0), /player resources/);
});

test("different initial decks, independent production/auto-upgrades and NUL retain exact full replay and wire continuation", () => {
  const options = { ...config(["A", "B", "X", "="]), playerLoadouts: [
    { actorId: "a", cards: ["A", "X", "="] }, { actorId: "b", cards: ["B", "X", "="] }] };
  const runtime = createIndependentBattle(options), authority = new BattleAuthority("resources", runtime.session,
    { available: () => !runtime.world.gameOver, inputTime: () => 0, execute: command => runtime.executeCommand(command) });
  for (const actor of ["a", "b"]) authority.submitTrusted(actor, { type: "control", control: { type: "debugChars" } });
  for (const [actor, card, lane, column] of [["a", "X", 0, 0], ["b", "X", 6, 0], ["a", "A", 1, 1], ["b", "B", 5, 1]]) {
    assert.equal(authority.submitTrusted(actor, { type: "operation", operation: deploy(card, lane, column) }), "deployed");
  }
  for (const tower of runtime.world.towers) authority.submitTrusted(tower.ownerId, { type: "operation",
    operation: { type: "autoUpgrade", targets: [ref(tower)], enabled: true } });
  authority.submitTrusted("a", { type: "control", control: { type: "reserve", value: 500 } });
  for (let i = 0; i < 3650; i++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
  assert.ok(runtime.nullification.snapshot()?.towers.length);
  const graph = captureBattleSnapshot(runtime.snapshot("A")), hash = () => battleChecksum(runtime.snapshot("A"));
  validateBattleSave(graph, runtime.world.wave);
  const replay = runtime.session.exportReplay(); validateReplay(replay);
  for (const delta of [1000 / 30, 1000 / 144]) {
    const played = createIndependentBattle(options, { playback: replay });
    for (let i = 0; i < 20000 && !played.session.playbackComplete; i++) played.session.advance(delta, played.sessionRuntime);
    assert.equal(battleChecksum(played.snapshot("A")), hash());
  }
  const wire = decodeBattleWireGraph(JSON.parse(JSON.stringify(encodeBattleWireGraph(graph))));
  const restored = createIndependentBattle(options, { checkpoint: wire });
  for (let i = 0; i < 620; i++) {
    runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime); restored.session.advance(BATTLE_STEP_MS, restored.sessionRuntime);
  }
  assert.equal(battleChecksum(restored.snapshot("A")), hash());
});
