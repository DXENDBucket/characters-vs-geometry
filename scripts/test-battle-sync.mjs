import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { BattleSession } = load("src/game/battleSession.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { BattleSyncHost } = load("src/game/battleSyncHost.ts");
const { BattleSyncClient } = load("src/game/battleSyncClient.ts");
const { validateSyncMessage, parseBoundedSyncText } = load("src/game/battleSyncProtocol.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const options = () => ({ version: BATTLE_RULES_VERSION, levelId: "1-1", difficulty: 3, difficultyVersion: 2,
  unlimitedFirepower: false, selectedCards: ["A"], debug: false, seed: 42, policy: LEGACY_BATTLE_POLICY });
const intent = value => ({ type: "control", control: { type: "reserve", value } });

// This fixture tests protocol/session contracts only. The browser suite uses the actual combat simulation.
function fixture() {
  const session = new BattleSession(options());
  const state = { levelElapsed: 0, battleTime: 0, cardTime: 0, nextNaturalProduceAt: 5000, chars: 300,
    baseIntegrity: 6, wave: 0, waveTracker: null, enemiesDefeated: 0, towerOrder: 0, gameSpeed: 1,
    selectedCardId: "A", cardDeadlines: [{ id: "A", readyAt: 0 }], autoUpgradeEnabled: true, autoUpgradeReserveChars: 0,
    towers: [], enemies: [], boss: null, projectiles: [], enemyProjectiles: [], mortarProjectiles: [], actions: [],
    storage: [], shifter: { readyAt: 0, cooldownStartedAt: 0, cooldownDuration: 15000 }, reselection: { readyAt: 240000, cards: [] },
    extraction: 0, spellMortarFlights: [], sealedCells: [], entityIds: { version: 1, nextId: 1 },
    lifecycle: { version: 1, flawlessEligible: true, result: null } };
  const current = () => ({ ...state, simulation: { ...session.snapshot(), mirrorNextGroupId: 1 } });
  let inputTime = 0;
  const authority = new BattleAuthority("sync_test", session, { available: () => true, inputTime: () => inputTime,
    execute: command => { session.controls.reserveChars = command.control.value; return "handled"; } });
  const host = new BattleSyncHost(session, authority, {
    checkpoint: () => session.checkpointReplay(captureBattleSnapshot(current()), ["A"]),
    checksum: () => battleChecksum(current()), inputTime: () => inputTime
  });
  const step = () => { state.battleTime += BATTLE_STEP_MS; state.levelElapsed += BATTLE_STEP_MS; state.cardTime += BATTLE_STEP_MS; };
  const advance = ticks => { for (let i = 0; i < ticks; i++) session.advance(BATTLE_STEP_MS, { step, executeCommand() {}, canAdvance: () => true }); };
  const outbound = [], inbound = [], received = [];
  let copy, copiedState;
  const client = new BattleSyncClient({ restore: snapshot => {
    copiedState = decodeSaveGraph(snapshot.replay.checkpoint, () => ({}));
    copy = new BattleSession(snapshot.replay, undefined, true); copy.restore(copiedState.simulation, copiedState.battleTime);
    copy.startRecordingFromCheckpoint(snapshot.replay.checkpoint, snapshot.replay.selectedCards);
  }, follow: (tick, entries) => copy.followFrame(tick, entries, {
    step: () => { copiedState.battleTime += BATTLE_STEP_MS; copiedState.levelElapsed += BATTLE_STEP_MS; copiedState.cardTime += BATTLE_STEP_MS; },
    executeCommand: c => { copy.controls.reserveChars = c.control.value; }, canAdvance: () => true
  }), checksum: () => battleChecksum({ ...copiedState, simulation: { ...copy.snapshot(), mirrorNextGroupId: 1 } }),
  receipt: receipt => received.push(receipt) });
  client.connect(message => inbound.push(JSON.stringify(message)));
  let peer = host.connect("local", message => outbound.push(JSON.stringify(message)));
  const pump = () => {
    for (let count = 0; (outbound.length || inbound.length) && count < 100; count++) {
      while (outbound.length) assert.notEqual(client.receiveText(outbound.shift()), "invalid");
      while (inbound.length) host.receiveText(peer, inbound.shift());
    }
    assert.equal(outbound.length + inbound.length, 0);
  };
  return { session, authority, host, client, outbound, inbound, received, advance, pump,
    snapshot: () => JSON.parse(outbound[0]), copy: () => copy,
    now: value => { inputTime = value; }, peer: () => peer,
    reconnect: (send = message => inbound.push(JSON.stringify(message))) => { host.disconnect(peer); client.disconnect(); client.connect(send);
      peer = host.connect("local", message => outbound.push(JSON.stringify(message))); } };
}

test("snapshot join, ordered frames and duplicate frames converge using the real session command path", () => {
  const f = fixture(); assert.doesNotThrow(() => validateSyncMessage(f.snapshot())); f.pump();
  assert.equal(f.client.ready, true); assert.equal(f.client.request(intent(50)), true); f.pump();
  assert.equal(f.received[0].result, "handled"); assert.equal(f.copy().controls.reserveChars, 50);
  f.advance(10); f.host.publish(); const frame = f.outbound[0]; f.pump();
  assert.equal(f.copy().clock.tick, 10); assert.equal(f.client.receiveText(frame), "ignored");
  assert.equal(f.copy().nextCommandSequence, 1);
});

test("lost receipts reconnect with the original request sequence and never execute a second time", () => {
  const f = fixture(); f.pump(); f.client.request(intent(75));
  f.host.receiveText(f.peer(), f.inbound.shift());
  f.outbound.splice(f.outbound.findIndex(text => JSON.parse(text).type === "receipt"), 1); f.pump();
  assert.equal(f.client.pendingRequest.sequence, 0);
  const oldPeer = f.peer(); f.reconnect();
  assert.equal(f.host.receiveText(oldPeer, JSON.stringify({ type: "resync", stream: 1 })), false);
  f.pump(); assert.equal(f.client.pendingRequest, undefined);
  assert.equal(f.session.nextCommandSequence, 1); assert.equal(f.copy().controls.reserveChars, 75);
});

test("gaps and state divergence request a new snapshot; stale streams cannot rewind it", () => {
  const f = fixture(), initial = f.outbound[0]; f.pump();
  f.advance(2); f.host.publish(); const early = f.outbound.shift();
  f.advance(2); f.host.publish(); assert.equal(f.client.receiveText(f.outbound.shift()), "resync");
  f.pump(); assert.equal(f.copy().clock.tick, 4);
  assert.equal(f.client.receiveText(initial), "ignored"); assert.equal(f.client.receiveText(early), "ignored");
  f.copy().controls.reserveChars = 999;
  f.now(1000); f.advance(2); f.host.publish(); f.pump();
  assert.equal(f.copy().controls.reserveChars, 0); assert.equal(f.client.ready, true);
});

test("resync requests are bounded and retryable, and oversized catch-up becomes a checkpoint", () => {
  const f = fixture(); f.pump(); f.client.resync(); f.pump();
  f.client.resync(); f.pump(); assert.equal(f.client.ready, false);
  f.now(1000); f.client.retry(); f.pump(); assert.equal(f.client.ready, true);
  f.advance(601); f.host.publish(); assert.equal(JSON.parse(f.outbound[0]).type, "snapshot"); f.pump();
  assert.equal(f.copy().clock.tick, 601);
});

test("frame schemas reject forged state, ordering, identities and oversized input before execution", () => {
  const f = fixture(); f.pump(); f.client.request(intent(30)); f.host.receiveText(f.peer(), f.inbound.shift());
  const original = JSON.parse(f.outbound[0]);
  for (const mutate of [m => m.version = 2, m => m.stream = 0, m => m.extra = 1, m => m.to.sequence++,
    m => m.to.tick = 601, m => m.checksum = "bad", m => m.commands[0].tick = -1,
    m => m.commands[0].sequence++, m => m.commands[0].command.actorId = "?",
    m => m.commands[0].command.control.damage = 999, m => m.commands[0].command.type = "pointer"]) {
    const message = structuredClone(original); mutate(message);
    assert.throws(() => validateSyncMessage(message));
    assert.equal(f.client.receiveText(JSON.stringify(message)), "invalid");
    assert.equal(f.copy().controls.reserveChars, 0);
  }
  assert.throws(() => parseBoundedSyncText(" ".repeat(100), 10));
  assert.throws(() => parseBoundedSyncText("\u4e2d".repeat(5), 10));
  assert.equal(f.host.receiveText(f.peer(), "{"), false);
  assert.equal(f.host.connect("unknown", () => {}), undefined);
  f.pump(); assert.equal(f.copy().controls.reserveChars, 30);
});

test("join snapshots require current schema, matching configuration and exact checksums", () => {
  const f = fixture(), original = f.snapshot();
  for (const mutate of [m => m.cursor.tick++, m => m.replay.levelId = "unknown", m => m.replay.difficultyVersion = 1,
    m => m.replay.selectedCards = ["unknown"], m => m.replay.selectedCards.push("A"), m => m.checksum = "00000000",
    m => m.replay.policy.slotCount = 9, m => m.replay.checkpoint.nodes[0].data.chars = 1000,
    m => delete m.replay.checkpoint.nodes[0].data.lifecycle]) {
    const message = structuredClone(original); mutate(message); assert.throws(() => validateSyncMessage(message));
    assert.equal(f.client.receiveText(JSON.stringify(message)), "invalid"); assert.equal(f.client.ready, false);
  }
  f.pump(); assert.equal(f.client.ready, true);
});

test("failed transports and replaced authority epochs do not keep receiving battle data", () => {
  const f = fixture(); f.pump(); let calls = 0;
  f.host.connect("local", () => { calls++; throw Error("closed transport"); });
  f.advance(1); f.host.publish(); assert.equal(calls, 1);
  const before = f.outbound.length;
  f.session.startRecordingFromCheckpoint(captureBattleSnapshot({}), ["A"]);
  f.advance(1); f.host.publish(); assert.equal(f.outbound.length, before);
  assert.equal(f.host.connect("local", () => {}), undefined);
});

test("a failing client send preserves its pending identity until transport reconnects", () => {
  const f = fixture(); f.pump(); f.reconnect(() => { throw Error("disconnected"); }); f.pump();
  assert.equal(f.client.request(intent(90)), true); assert.equal(f.client.ready, false);
  assert.equal(f.client.pendingRequest.sequence, 0); assert.equal(f.session.nextCommandSequence, 0);
  f.reconnect(); f.pump(); assert.equal(f.client.ready, true); assert.equal(f.client.pendingRequest, undefined);
  assert.equal(f.session.nextCommandSequence, 1); assert.equal(f.copy().controls.reserveChars, 90);
});
