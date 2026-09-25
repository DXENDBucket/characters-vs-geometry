import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { BattleEconomy, validateBattleWallets } = load("src/game/battleEconomy.ts");
const { LEGACY_BATTLE_POLICY, validBattlePolicy, sameBattlePolicy } = load("src/game/battlePolicy.ts");
const { BATTLE_PERMISSIONS } = load("src/game/battleParticipants.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { validateBattleSave } = load("src/game/validateBattleSave.ts");
const { encodeBattleWireGraph, decodeBattleWireGraph } = load("src/game/battleWireGraph.ts");
const { towerOperationRef: ref, edgeOperationRef } = load("src/game/battleOperations.ts");
const { executeTowerVolley } = load("src/game/towerCombat.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { NATURAL_PRODUCE_AMOUNT } = load("src/config.ts");
const { softcapChars } = load("src/game/charSoftcap.ts");
const participants = [{ id: "b", permissions: BATTLE_PERMISSIONS }, { id: "a", permissions: BATTLE_PERMISSIONS },
  { id: "viewer", permissions: ["debug"] }];
const policy = { ...LEGACY_BATTLE_POLICY, towerAccess: "owner", walletMode: "individual" };
const options = (cards = ["A", "B", "X", "Y", "Z", "@", "1", "=", "b", "y"]) => ({
  version: BATTLE_RULES_VERSION, difficultyVersion: 2, levelId: "AE-EX-2", difficulty: 3, seed: 139,
  debug: true, unlimitedFirepower: false, selectedCards: cards, policy, participants });
const deploy = (card, lane, column, expected = null) => ({ type: "deploy", card, cell: { lane, column }, expected });
function fixture(cards) {
  const runtime = createIndependentBattle(options(cards));
  runtime.session.controls.autoUpgradeEnabled = false;
  const balance = actor => runtime.world.effectiveChars(actor);
  const ready = card => { runtime.world.loadout.byId.get(card).readyAt = 0; };
  const place = (actor, card, lane, column) => {
    ready(card); assert.equal(runtime.executeOperation(actor, deploy(card, lane, column)), "deployed");
    return runtime.world.towers.find(t => t.lane === lane && t.column === column && t.type === card);
  };
  const hash = () => battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0]));
  return { runtime, balance, ready, place, hash };
}

test("individual wallets require ownership, exclude spectators and split initial funds in canonical actor order", () => {
  assert.equal(validBattlePolicy(policy), true);
  assert.equal(validBattlePolicy({ ...LEGACY_BATTLE_POLICY, walletMode: "individual" }), false);
  for (const walletMode of [null, undefined, true, "each"]) assert.equal(validBattlePolicy({ ...policy, walletMode }), false);
  assert.equal(sameBattlePolicy(LEGACY_BATTLE_POLICY, { ...LEGACY_BATTLE_POLICY, walletMode: "shared" }), true);
  const f = fixture();
  assert.deepEqual(f.runtime.world.economy.snapshot(), [{ actorId: "a", chars: 1000 }, { actorId: "b", chars: 1000 }]);
  assert.equal(f.balance("viewer"), 0); assert.equal(f.balance(), 2000);
  assert.throws(() => { f.runtime.world.chars = 200; }, /actor/);
  assert.throws(() => f.runtime.world.spendChars(10), /actor/);
  assert.throws(() => createIndependentBattle({ ...options(), participants: [{ id: "viewer", permissions: [] }] }), /builder/);
});

test("shared economy preserves existing softcap spending and does not add optional snapshot data", () => {
  const runtime = createIndependentBattle({ ...options(), policy: LEGACY_BATTLE_POLICY });
  runtime.world.chars = 50000;
  const before = runtime.world.effectiveChars(); runtime.world.spendChars(75, "b");
  assert.ok(Math.abs(runtime.world.effectiveChars() - (before - 75)) < 1e-7);
  assert.equal(Object.hasOwn(runtime.snapshot("A"), "wallets"), false);
  assert.equal(runtime.world.economy.snapshot(), undefined);
});

test("manual deployment, upgrades and rejected requests charge only the authenticated builder", () => {
  const f = fixture(), a = f.place("a", "A", 2, 1);
  assert.equal(f.balance("a"), 1000 - getCardDefinition("A").cost); assert.equal(f.balance("b"), 1000);
  f.ready("A"); const before = f.hash();
  assert.equal(f.runtime.executeOperation("b", deploy("A", 2, 1, ref(a))), "forbidden"); assert.equal(f.hash(), before);
  assert.equal(f.runtime.executeOperation("a", deploy("A", 2, 1, ref(a))), "deployed");
  assert.equal(f.balance("a"), 1000 - getCardDefinition("A").cost * 2); assert.equal(f.balance("b"), 1000);
  f.runtime.world.spendChars(f.balance("a"), "a"); f.ready("B"); const empty = f.hash();
  assert.equal(f.runtime.executeOperation("a", deploy("B", 3, 1)), "noChars"); assert.equal(f.hash(), empty);
  f.place("b", "B", 3, 1); assert.equal(f.balance("b"), 1000 - getCardDefinition("B").cost);
});

test("edge placement and attachments debit the same wallet as ordinary towers", () => {
  const f = fixture(), target = f.place("b", "B", 3, 2), before = f.balance("b");
  assert.equal(f.runtime.executeOperation("b", { type: "effect", card: "b", cell: { lane: 3, column: 2 }, target: ref(target) }), "handled");
  assert.equal(f.balance("b"), before - getCardDefinition("b").cost); assert.equal(f.balance("a"), 1000);
  const edge = { type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 2, column: 2 }, expected: null };
  assert.equal(f.runtime.executeOperation("a", edge), "handled");
  assert.equal(f.balance("a"), 1000 - getCardDefinition("=").cost);
});

test("natural production is conserved and debug currency does not credit peers or spectators", () => {
  const f = fixture();
  f.runtime.world.nextNaturalProduceAt = 0; f.runtime.step();
  assert.equal(f.balance("a"), 1000 + NATURAL_PRODUCE_AMOUNT / 2);
  assert.equal(f.balance("b"), f.balance("a"));
  const beforeB = f.balance("b");
  assert.equal(f.runtime.executeControl("a", { type: "debugChars" }), "handled");
  assert.ok(f.balance("a") > 1000); assert.equal(f.balance("b"), beforeB);
  const hash = f.hash(); assert.equal(f.runtime.executeControl("viewer", { type: "debugChars" }), "forbidden"); assert.equal(f.hash(), hash);
});

test("regular, copied, on-hit and attack production follow the source rather than the last command actor", () => {
  const f = fixture(), producer = f.place("a", "X", 1, 2);
  f.place("b", "B", 6, 2);
  const a = f.balance("a"), b = f.balance("b");
  executeTowerVolley(f.runtime.combat, { type: "volley", tower: producer, hitCount: 1 });
  assert.equal(f.balance("a"), a + 25); assert.equal(f.balance("b"), b);
  f.runtime.world.gainChars(2000, "b");
  const copy = f.place("b", "@", 1, 1); f.runtime.board.syncCopies();
  const copyBalance = f.balance("b");
  executeTowerVolley(f.runtime.combat, { type: "volley", tower: copy, hitCount: 1, copyRevision: copy.copyRevision });
  assert.equal(f.balance("b"), copyBalance + 25);
  const hit = f.place("a", "Y", 3, 2), hitBalance = f.balance("a");
  f.runtime.combat.damageTower(hit, 100, "true"); assert.equal(f.balance("a"), hitBalance + 12);
  const slash = f.place("a", "Z", 4, 2), slashBalance = f.balance("a");
  f.runtime.spawnEnemy({ kind: "circle", lane: 4, x: slash.x + 45, time: 0, waveNumber: 1, waveWeight: 10, finalDamageReduction: 0 });
  executeTowerVolley(f.runtime.combat, { type: "volley", tower: slash, hitCount: 1 });
  assert.equal(f.balance("a"), slashBalance + 15);
});

test("stored production belongs to the executing outlet even after its original source disappears", () => {
  const f = fixture(["X", "0", "1", "="]), source = f.place("a", "X", 2, 1), bank = f.place("b", "0", 2, 2);
  f.place("b", "1", 2, 3);
  for (const column of [1, 2]) {
    f.ready("=");
    assert.equal(f.runtime.executeOperation("a", { type: "edgeCard", card: "=",
      position: { axis: "horizontal", lane: 2, column }, expected: null }), "handled");
  }
  assert.equal(f.runtime.routeTowerAction(source, { kind: "production" }), true);
  assert.equal(bank.projectileBank.shots.length, 1);
  f.runtime.removeTower(source);
  const a = f.balance("a"), b = f.balance("b");
  const graph = captureBattleSnapshot(f.runtime.snapshot("X")); validateBattleSave(graph, 0);
  const wire = decodeBattleWireGraph(JSON.parse(JSON.stringify(encodeBattleWireGraph(graph))));
  const restored = createIndependentBattle(f.runtime.session.exportReplay(), { checkpoint: wire });
  for (let i = 0; i < 60; i++) {
    f.runtime.session.advance(BATTLE_STEP_MS, f.runtime.sessionRuntime);
    restored.session.advance(BATTLE_STEP_MS, restored.sessionRuntime);
  }
  assert.equal(f.balance("a"), a); assert.equal(f.balance("b"), b + 25);
  assert.equal(f.hash(), battleChecksum(restored.snapshot("X")));
});

test("automatic tower and edge upgrades cannot borrow money from a richer peer", () => {
  const f = fixture(), a = f.place("a", "A", 1, 1), b = f.place("b", "A", 2, 1);
  for (const tower of [a, b]) assert.equal(f.runtime.executeOperation(tower.ownerId, { type: "autoUpgrade", targets: [ref(tower)], enabled: true }), "handled");
  const edgeOp = (lane) => ({ type: "edgeCard", card: "=", position: { axis: "horizontal", lane, column: 3 }, expected: null });
  assert.equal(f.runtime.executeOperation("a", edgeOp(1)), "handled"); f.ready("=");
  assert.equal(f.runtime.executeOperation("b", edgeOp(2)), "handled");
  for (const edge of f.runtime.world.edgeTowers) assert.equal(f.runtime.executeOperation(edge.ownerId,
    { type: "autoUpgrade", targets: [edgeOperationRef(edge)], enabled: true }), "handled");
  f.runtime.world.spendChars(f.balance("a"), "a"); f.ready("A"); f.ready("=");
  const before = f.balance("b"); f.runtime.session.controls.autoUpgradeEnabled = true; f.runtime.autoUpgrade();
  assert.equal(a.level, 1); assert.equal(b.level, 2); assert.equal(f.balance("a"), 0);
  assert.equal(f.balance("b"), before - getCardDefinition("A").cost - getCardDefinition("=").cost);
  assert.deepEqual(f.runtime.world.edgeTowers.map(edge => edge.level), [1, 2]);
});

test("wallet validation rejects omitted, reordered, foreign, negative and non-finite accounts", () => {
  const f = fixture(), state = f.runtime.snapshot("A");
  const check = wallets => validateBattleWallets(state.chars, wallets, policy, participants);
  check(state.wallets);
  for (const wallets of [undefined, [], state.wallets.slice().reverse(), [{ actorId: "a", chars: 2000 }],
    [{ actorId: "a", chars: -1 }, { actorId: "b", chars: 2001 }],
    [{ actorId: "a", chars: Infinity }, { actorId: "b", chars: 0 }],
    [{ actorId: "a", chars: 1000 }, { actorId: "viewer", chars: 1000 }],
    [{ actorId: "a", chars: 1000, extra: 1 }, { actorId: "b", chars: 1000 }]]) assert.throws(() => check(wallets));
  assert.throws(() => validateBattleWallets(state.chars, state.wallets, LEGACY_BATTLE_POLICY, participants));
  const graph = captureBattleSnapshot(state), bad = structuredClone(graph);
  delete bad.nodes[bad.root.ref].data.wallets;
  assert.throws(() => validateBattleSave(bad, 0), /wallets/);
});

test("each wallet applies the existing softcap independently and snapshot copies cannot mutate balances", () => {
  const economy = new BattleEconomy(2000); economy.initialize(policy, participants);
  economy.gain(50000, "a"); const before = economy.available("a");
  assert.equal(before, softcapChars(51000)); economy.spend(275, "a");
  assert.ok(Math.abs(economy.available("a") - (before - 275)) < 1e-7);
  assert.equal(economy.available("b"), 1000);
  const snapshot = economy.snapshot(); snapshot[0].chars = 0; assert.ok(economy.available("a") > 0);
});

test("individual saves reject tower owners without a wallet, including spectators with debug permission", () => {
  const f = fixture(); f.place("a", "X", 1, 1);
  const graph = captureBattleSnapshot(f.runtime.snapshot("A"));
  graph.nodes.find(node => node.kind === "tower").data.ownerId = "viewer";
  assert.throws(() => validateBattleSave(graph, 0), /owner/);
});

test("individual economy survives NUL, ID-wire snapshots and full semantic replay at different frame rates", () => {
  const config = options(["A", "B", "X", "Y", "="]), runtime = createIndependentBattle(config);
  const authority = new BattleAuthority("economy", runtime.session, { inputTime: () => 0,
    available: () => !runtime.world.gameOver, execute: command => runtime.executeCommand(command) });
  const send = (actor, control) => authority.submitTrusted(actor, { type: "control", control });
  send("a", { type: "debugChars" }); send("b", { type: "debugChars" }); send("a", { type: "autoUpgradeEnabled", enabled: false });
  for (const [actor, card, lane] of [["a", "X", 1], ["b", "B", 3], ["a", "Y", 5]]) {
    assert.equal(authority.submitTrusted(actor, { type: "operation", operation: deploy(card, lane, 1) }), "deployed");
  }
  for (let i = 0; i < 3650; i++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
  assert.ok(runtime.nullification.snapshot()?.towers.length);
  const hash = () => battleChecksum(runtime.snapshot("A")), graph = captureBattleSnapshot(runtime.snapshot("A"));
  validateBattleSave(graph, runtime.world.wave);
  const wire = decodeBattleWireGraph(JSON.parse(JSON.stringify(encodeBattleWireGraph(graph))));
  const restored = createIndependentBattle(config, { checkpoint: wire });
  assert.equal(battleChecksum(restored.snapshot("A")), hash());
  for (const delta of [1000 / 30, 1000 / 144]) {
    const played = createIndependentBattle(config, { playback: runtime.session.exportReplay() });
    for (let i = 0; i < 20000 && !played.session.playbackComplete; i++) played.session.advance(delta, played.sessionRuntime);
    assert.equal(battleChecksum(played.snapshot("A")), hash());
  }
  for (let i = 0; i < 620; i++) {
    runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime); restored.session.advance(BATTLE_STEP_MS, restored.sessionRuntime);
  }
  assert.equal(battleChecksum(restored.snapshot("A")), hash());
});
