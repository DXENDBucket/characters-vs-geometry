import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { BattleAuthority, BATTLE_RECEIPT_WINDOW, MAX_BATTLE_REQUEST_BYTES, MAX_BATTLE_REQUESTS_PER_WINDOW,
  BATTLE_REQUEST_WINDOW_MS,
  validBattleRequest } = load("src/game/battleAuthority.ts");
const { BattleSession } = load("src/game/battleSession.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { LOCAL_BATTLE_ACTOR, validBattleParticipants } = load("src/game/battleParticipants.ts");
const { executeBattleControl, createBattleControlState } = load("src/game/battleControls.ts");
const options = () => ({ version: BATTLE_RULES_VERSION, levelId: "IF-1", difficulty: 3, difficultyVersion: 2,
  unlimitedFirepower: false, selectedCards: ["A", "B"], debug: false, seed: 42,
  participants: [LOCAL_BATTLE_ACTOR, { id: "builder", permissions: ["build", "settings"] }, { id: "observer", permissions: [] }] });
const idle = { step() {}, executeCommand() {}, canAdvance: () => true };
const intent = value => ({ type: "control", control: { type: "reserve", value } });
const request = (sequence = 0, value = 500) => ({ version: 1, battleId: "battle_one", sequence, intent: intent(value) });

function fixture(config = options()) {
  let inputTime = 0;
  const session = new BattleSession(config), state = createBattleControlState(), seen = [];
  const runtime = { state, ended: false, actor: id => session.actor(id), authorize: () => true, autoUpgradeChanged() {} };
  const authority = new BattleAuthority("battle_one", session, { available: () => !runtime.ended, inputTime: () => inputTime, execute: command => {
    seen.push(command);
    assert.equal(command.type, "control");
    return executeBattleControl(command.actorId, command.control, runtime);
  } });
  return { session, state, runtime, seen, authority, local: authority.connect("local"), builder: authority.connect("builder"),
    advanceInputTime: delta => { inputTime += delta; } };
}

test("participant schemas are bounded, immutable and default to the original single player", () => {
  const config = options(), f = fixture(config);
  config.participants[1].permissions.push("debug"); config.participants[1].id = "changed";
  assert.deepEqual(f.session.actor("builder"), { id: "builder", permissions: ["build", "settings"] });
  assert.throws(() => f.session.actor("builder").permissions.push("debug"));
  const defaults = options(); delete defaults.participants;
  assert.deepEqual(new BattleSession(defaults).actor("local"), LOCAL_BATTLE_ACTOR);
  assert.equal(new BattleSession(defaults).snapshot().participants, undefined);
  for (const invalid of [[], Array(17).fill(LOCAL_BATTLE_ACTOR), [LOCAL_BATTLE_ACTOR, LOCAL_BATTLE_ACTOR],
    [{ id: "x", permissions: ["build", "build"] }], [{ id: "x", permissions: ["admin"] }],
    [{ id: "x", permissions: new Array(2) }], new Array(1), [{ id: "bad id", permissions: [] }],
    [{ id: "x", permissions: [], money: 1000 }], [{ id: "x" }]]) {
    assert.equal(validBattleParticipants(invalid), false);
    assert.throws(() => new BattleSession({ ...defaults, participants: invalid }));
  }
});

test("wire schema accepts only bounded semantic intentions, not actor IDs or client-computed state", () => {
  assert.equal(validBattleRequest(request()), true);
  for (const change of [r => r.actorId = "local", r => r.tick = 100, r => r.version = 2, r => r.sequence = -1,
    r => r.sequence = Number.MAX_SAFE_INTEGER, r => r.sequence = .1, r => r.battleId = "!", r => r.intent.actorId = "local",
    r => r.intent.control.value = Infinity, r => r.intent.control.damage = 999, r => r.intent.type = "pointer",
    r => r.intent = { type: "control", control: { type: "reselect", cards: new Array(2) } }]) {
    const invalid = request(); change(invalid); assert.equal(validBattleRequest(invalid), false);
  }
  const f = fixture();
  for (const input of ["not json", " ".repeat(MAX_BATTLE_REQUEST_BYTES + 1), "\u4e2d".repeat(MAX_BATTLE_REQUEST_BYTES / 2),
    JSON.stringify({ ...request(), actorId: "local" })]) assert.equal(f.authority.receiveText(f.builder, input).reason, "invalid");
  assert.equal(f.session.exportReplay().commands.length, 0);
  assert.equal(f.authority.receiveText(f.builder, JSON.stringify(request())).result, "handled");
});

test("only host-issued channels establish identity and capabilities are enforced by the real control gate", () => {
  const f = fixture(), other = fixture();
  assert.equal(f.authority.connect("stranger"), undefined);
  assert.equal(f.authority.receive({}, request()).reason, "forbidden");
  assert.equal(f.authority.receive(other.local, request()).reason, "forbidden");
  assert.equal(f.authority.receive(f.builder, { ...request(), actorId: "local" }).reason, "invalid");
  const observer = f.authority.connect("observer");
  assert.equal(f.authority.receive(observer, request()).result, "forbidden");
  assert.equal(f.state.reserveChars, 0);
  assert.equal(f.authority.receive(f.builder, request()).result, "handled");
  assert.equal(f.state.reserveChars, 500);
  assert.equal(f.seen.at(-1).actorId, "builder");
  assert.deepEqual(f.session.exportReplay().commands.map(c => c.command.actorId), ["observer", "builder"]);
});

test("per-actor sequences are independent; host ticks and global recording order are authoritative", () => {
  const f = fixture();
  assert.equal(f.authority.receive(f.builder, request(1)).reason, "gap");
  assert.equal(f.authority.receive(f.local, { ...request(), battleId: "other" }).reason, "wrongBattle");
  assert.equal(f.seen.length, 0);
  const a = f.authority.receive(f.builder, request(0, 100));
  f.session.advance(BATTLE_STEP_MS, idle);
  const b = f.authority.receive(f.local, request(0, 200)), c = f.authority.receive(f.builder, request(1, 300));
  assert.deepEqual([a, b, c].map(r => [r.tick, r.commandSequence, r.nextSequence]), [[0, 0, 1], [1, 1, 1], [1, 2, 2]]);
  assert.equal(f.state.reserveChars, 300);
});

test("identical retries return the original receipt, not another execution, regardless of object key order", () => {
  const f = fixture(), original = request(), sent = structuredClone(original);
  const receipt = f.authority.receive(f.builder, original);
  original.intent.control.value = 10000;
  assert.equal(f.authority.receive(f.builder, original).reason, "conflict");
  assert.equal(f.state.reserveChars, 500);
  const reordered = { ...sent, intent: { control: { value: 500, type: "reserve" }, type: "control" } };
  assert.deepEqual(f.authority.receive(f.builder, reordered), receipt);
  const expected = structuredClone(receipt); receipt.result = "invalid";
  f.runtime.ended = true;
  assert.deepEqual(f.authority.receive(f.builder, sent), expected, "lost final acknowledgment still retrievable after battle ends");
  assert.equal(f.seen.length, 1); assert.equal(f.session.exportReplay().commands.length, 1);
});

test("rejections by game rules are consumed and cached; correcting the payload needs a new sequence", () => {
  const f = fixture(), observer = f.authority.connect("observer");
  const denied = f.authority.receive(observer, request());
  assert.equal(denied.result, "forbidden"); assert.equal(denied.nextSequence, 1);
  assert.deepEqual(f.authority.receive(observer, request()), denied);
  assert.equal(f.authority.receive(observer, request(0, 123)).reason, "conflict");
  assert.equal(f.seen.length, 1);
});

test("reconnect replaces the channel but preserves receipts and sequence, including cross-actor isolation", () => {
  const f = fixture(), before = f.authority.receive(f.builder, request());
  f.authority.disconnect(f.builder);
  assert.equal(f.authority.receive(f.builder, request()).reason, "forbidden");
  const connected = f.authority.connect("builder");
  assert.deepEqual(f.authority.describe(connected), { version: 1, rulesVersion: BATTLE_RULES_VERSION, battleId: "battle_one",
    tick: 0, nextSequence: 1, oldestReceipt: 0 });
  assert.equal(f.authority.describe(f.builder), undefined);
  assert.deepEqual(f.authority.receive(connected, request()), before);
  assert.equal(f.authority.receive(connected, request(1, 200)).result, "handled");
  const replacement = f.authority.connect("builder");
  assert.equal(f.authority.receive(connected, request(2)).reason, "forbidden");
  assert.equal(f.authority.receive(replacement, request(2)).result, "handled");
  assert.equal(f.authority.receive(f.local, request()).commandSequence, 3);
});

test("receipt memory and ingress rate are bounded, and a paused world cannot deadlock rate-limit recovery", () => {
  const f = fixture();
  for (let i = 0; i < MAX_BATTLE_REQUESTS_PER_WINDOW; i++) assert.equal(f.authority.receive(f.builder, request(i, i)).status, "executed");
  assert.equal(f.authority.receive(f.builder, request(0, 0)).reason, "expired");
  assert.equal(f.authority.describe(f.builder).oldestReceipt, MAX_BATTLE_REQUESTS_PER_WINDOW - BATTLE_RECEIPT_WINDOW);
  assert.equal(f.authority.receive(f.builder, request(MAX_BATTLE_REQUESTS_PER_WINDOW - BATTLE_RECEIPT_WINDOW, MAX_BATTLE_REQUESTS_PER_WINDOW - BATTLE_RECEIPT_WINDOW)).status, "executed");
  assert.equal(f.authority.receive(f.builder, request(MAX_BATTLE_REQUESTS_PER_WINDOW)).reason, "busy");
  assert.equal(f.authority.receive(f.local, request()).status, "executed");
  f.advanceInputTime(BATTLE_REQUEST_WINDOW_MS);
  assert.equal(f.authority.receive(f.builder, request(MAX_BATTLE_REQUESTS_PER_WINDOW)).status, "executed");
  assert.equal(f.session.clock.tick, 0);
  assert.equal(f.seen.length, MAX_BATTLE_REQUESTS_PER_WINDOW + 2);
  for (let i = 0; i < MAX_BATTLE_REQUESTS_PER_WINDOW * 2; i++) assert.equal(f.authority.submitTrusted("local", intent(i)), "handled");
});

test("closed, replaced, restored and playback hosts cannot apply stale channel input", () => {
  const f = fixture(); f.authority.close();
  assert.equal(f.authority.receive(f.local, request()).reason, "forbidden");
  assert.equal(f.authority.connect("local"), undefined);
  const restored = fixture(); restored.session.restore(restored.session.snapshot(), 0);
  assert.equal(restored.authority.receive(restored.local, request()).reason, "unavailable");
  const checkpoint = fixture(); checkpoint.session.startRecordingFromCheckpoint({ root: null, nodes: [] }, ["A"]);
  assert.equal(checkpoint.authority.receive(checkpoint.local, request()).reason, "unavailable");
  const session = new BattleSession(options(), fixture().session.exportReplay());
  const replay = new BattleAuthority("replay", session, { available: () => true, inputTime: () => 0, execute: () => assert.fail() });
  assert.equal(replay.connect("local"), undefined);
  assert.equal(replay.submitTrusted("local", intent(5)), "unavailable");
});

test("nested requests cannot reorder execution, and a throwing handler fails closed instead of retrying", () => {
  const session = new BattleSession(options()); let channel, nested, executions = 0;
  const authority = new BattleAuthority("battle_one", session, { available: () => true, inputTime: () => 0, execute() {
    executions++; nested = authority.receive(channel, request()); throw Error("broken handler");
  } });
  channel = authority.connect("local");
  assert.throws(() => authority.receive(channel, request()), /broken handler/);
  assert.equal(nested.reason, "busy");
  assert.equal(authority.receive(channel, request()).reason, "faulted");
  assert.equal(executions, 1); assert.equal(session.exportReplay().commands.length, 1);
});

test("participant policies survive replay and checkpoints, and invalid restore is atomic", () => {
  const f = fixture(); f.authority.receive(f.builder, request());
  const replay = f.session.exportReplay(), copy = fixture(options());
  const session = new BattleSession({ ...options(), participants: [LOCAL_BATTLE_ACTOR] }, replay);
  session.advance(0, { ...idle, executeCommand: command => {
    copy.runtime.actor = id => session.actor(id);
    assert.equal(executeBattleControl(command.actorId, command.control, copy.runtime), "handled");
  } });
  assert.equal(copy.state.reserveChars, 500);
  const snapshot = f.session.snapshot(), target = new BattleSession({ ...options(), participants: undefined });
  target.restore(snapshot, 0);
  snapshot.participants[1].permissions.push("debug");
  assert.equal(target.actor("builder").permissions.includes("debug"), false);
  assert.deepEqual(target.exportReplay().participants, f.session.exportReplay().participants);
  const before = target.snapshot();
  assert.throws(() => target.restore({ ...before, participants: [{ id: "bad", permissions: ["cheat"] }] }, 0));
  assert.deepEqual(target.snapshot(), before);
  assert.throws(() => session.restore({ ...before, participants: [LOCAL_BATTLE_ACTOR] }, 0), /participants differ/);
});
