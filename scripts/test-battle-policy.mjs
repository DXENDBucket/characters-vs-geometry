import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { copyBattlePolicy, validBattlePolicy, battleCardAllowed, LEGACY_BATTLE_POLICY, sameBattlePolicy } = load("src/game/battlePolicy.ts");
const { BattleSession } = load("src/game/battleSession.ts");
const { BATTLE_RULES_VERSION } = load("src/game/battleSimulation.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { validateReplay } = load("src/game/battleCommands.ts");
const policy = () => ({ version: 1, slotCount: 2, allowedCards: ["B", "?", "A"], reselectEnabled: true, pauseOnLocalModal: false });
const options = () => ({ version: BATTLE_RULES_VERSION, levelId: "IF-1", difficulty: 3, difficultyVersion: 2,
  unlimitedFirepower: false, selectedCards: ["A", "B"], debug: false, seed: 42, policy: policy() });

test("policy schema is bounded and excludes synthetic/unknown card identities", () => {
  assert.equal(validBattlePolicy(policy()), true);
  for (const change of [p => p.version = 2, p => p.slotCount = 0, p => p.slotCount = 11, p => p.slotCount = 1.5,
    p => p.allowedCards = [], p => p.allowedCards = ["A", "A"], p => p.allowedCards = ["?A"],
    p => p.allowedCards = ["unknown"], p => p.allowedCards = new Array(1), p => p.allowedCards = Array(1000).fill("A"),
    p => p.reselectEnabled = 1, p => p.pauseOnLocalModal = undefined, p => p.money = 99]) {
    const bad = policy(); change(bad); assert.equal(validBattlePolicy(bad), false);
    assert.throws(() => copyBattlePolicy(bad));
    assert.throws(() => new BattleSession({ ...options(), policy: bad }));
  }
  for (const bad of [null, undefined, [], "policy"]) assert.equal(validBattlePolicy(bad), false);
});

test("canonical copied policies are immutable and do not retain caller-owned arrays", () => {
  const original = policy(), copied = copyBattlePolicy(original);
  original.allowedCards.push("X"); original.slotCount = 10;
  assert.deepEqual(copied.allowedCards, ["?", "A", "B"]); assert.equal(copied.slotCount, 2);
  assert.throws(() => copied.allowedCards.push("X")); assert.throws(() => copied.slotCount = 10);
  assert.equal(sameBattlePolicy(copied, policy()), true);
  assert.equal(sameBattlePolicy(copied, { ...policy(), slotCount: 3 }), false);
});

test("imitation needs both the imitator and eligible target in the captured access policy", () => {
  const p = copyBattlePolicy(policy());
  for (const id of ["A", "B", "?", "?A", "?B"]) assert.equal(battleCardAllowed(p, id), true, id);
  for (const id of ["X", "?X", "??A", "unknown"]) assert.equal(battleCardAllowed(p, id), false, id);
  assert.equal(battleCardAllowed({ ...p, allowedCards: ["A", "B"] }, "?A"), false);
  assert.equal(battleCardAllowed(LEGACY_BATTLE_POLICY, "?u"), false, "super cards cannot bypass imitation eligibility");
});

test("session policies are independent of options and exported mutable copies", () => {
  const config = options(), session = new BattleSession(config);
  config.policy.allowedCards.push("X");
  session.snapshot().policy.allowedCards.push("X"); session.exportReplay().policy.allowedCards.push("X");
  assert.equal(battleCardAllowed(session.policy, "X"), false);
  const replay = session.exportReplay(), playback = new BattleSession({ ...options(), policy: LEGACY_BATTLE_POLICY }, replay);
  assert.equal(playback.policy.slotCount, 2); assert.equal(playback.policy.pauseOnLocalModal, false);
  assert.deepEqual(playback.snapshot().policy, session.snapshot().policy);
});

test("checkpoint restore keeps policy, rejects malformed policies atomically and checks replay compatibility", () => {
  const original = new BattleSession(options()), snapshot = original.snapshot();
  const restored = new BattleSession({ ...options(), policy: LEGACY_BATTLE_POLICY });
  restored.restore(snapshot, 0);
  assert.equal(restored.policy.slotCount, 2); assert.equal(restored.exportReplay().policy.slotCount, 2);
  const before = restored.snapshot(), epoch = restored.commandEpoch;
  for (const p of [null, { ...policy(), allowedCards: [] }, { ...policy(), pauseOnLocalModal: 1 }]) {
    assert.throws(() => restored.restore({ ...snapshot, policy: p }, 0));
    assert.deepEqual(restored.snapshot(), before); assert.equal(restored.commandEpoch, epoch);
  }
  const playback = new BattleSession(options(), original.exportReplay());
  assert.throws(() => playback.restore({ ...snapshot, policy: { ...policy(), slotCount: 3 } }, 0), /policy differs/);
  assert.throws(() => playback.restore({ ...snapshot, policy: undefined }, 0), /policy differs/);
  const badReplay = original.exportReplay(); badReplay.policy.slotCount = 0;
  assert.throws(() => validateReplay(badReplay));
});

test("legacy saves adopt host policy once; legacy recordings retain their historical permissive policy", () => {
  const config = options(); delete config.policy;
  const old = new BattleSession(config), legacy = old.snapshot();
  assert.equal(legacy.policy, undefined);
  const fresh = new BattleSession(options()); fresh.restore(legacy, 0);
  assert.equal(fresh.policy.slotCount, 2); assert.equal(fresh.snapshot().policy.slotCount, 2);
  const playback = new BattleSession(options(), old.exportReplay());
  playback.restore(legacy, 0);
  assert.deepEqual(playback.policy, LEGACY_BATTLE_POLICY); assert.equal(playback.snapshot().policy, undefined);
});

test("checksums include effective captured policies, not the original card-list ordering", () => {
  const session = new BattleSession(options());
  const state = { simulation: { ...session.snapshot(), mirrorNextGroupId: 1 }, gameSpeed: 1 };
  const original = battleChecksum(state);
  for (const change of [p => p.slotCount++, p => p.allowedCards.push("X"), p => p.reselectEnabled = false,
    p => p.pauseOnLocalModal = true]) {
    const changed = structuredClone(state); change(changed.simulation.policy);
    assert.notEqual(battleChecksum(changed), original);
  }
  const config = options(); config.policy.allowedCards.reverse();
  const same = new BattleSession(config);
  assert.equal(battleChecksum({ ...state, simulation: { ...same.snapshot(), mirrorNextGroupId: 1 } }), original);
});
