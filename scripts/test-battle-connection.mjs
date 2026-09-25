import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { BattleConnection } = load("src/game/battleConnection.ts");
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { BattleSyncHost } = load("src/game/battleSyncHost.ts");
const { BATTLE_RULES_VERSION } = load("src/game/battleSimulation.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");

function clock() {
  let now = 0, id = 0;
  const jobs = new Map();
  return { get now() { return now; }, get size() { return jobs.size; },
    set: (delay, callback) => { jobs.set(++id, { at: now + delay, callback }); return id; },
    clear: id => { jobs.delete(id); },
    advance: delta => {
      const end = now + delta;
      for (let steps = 0; ; steps++) {
        assert.ok(steps < 100, "Unbounded timer work");
        const next = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        now = next[1].at; jobs.delete(next[0]); next[1].callback();
      }
      now = end;
    } };
}
function fixture({ open = true, snapshots = true } = {}) {
  const time = clock(), links = [], results = [], statuses = [];
  const hostRuntime = createIndependentBattle({ version: BATTLE_RULES_VERSION, levelId: "1-1", difficultyVersion: 2,
    difficulty: 3, unlimitedFirepower: false, seed: 113, debug: true, selectedCards: ["A"], policy: LEGACY_BATTLE_POLICY });
  const hash = runtime => battleChecksum(runtime.snapshot("A"));
  const authority = new BattleAuthority("connection_test", hostRuntime.session, { inputTime: () => time.now,
    available: () => true, execute: command => hostRuntime.executeCommand(command) });
  const host = new BattleSyncHost(hostRuntime.session, authority, {
    checkpoint: () => hostRuntime.session.checkpointReplay(captureBattleSnapshot(hostRuntime.snapshot("A")), ["A"]),
    checksum: () => hash(hostRuntime), inputTime: () => time.now });
  let replica, dropReceipt = false, throwSend = false, restorations = 0;
  const connection = new BattleConnection({
    restore: ({ replay }) => { restorations++; replica = createIndependentBattle(replay, { replica: true, checkpoint: replay.checkpoint }); },
    follow: (tick, commands) => replica.session.followFrame(tick, commands, replica.sessionRuntime),
    checksum: () => hash(replica), receipt: receipt => results.push(receipt)
  }, events => {
    const link = { events, closed: 0, sent: [], received: [], peer: undefined,
      send(text) {
        if (throwSend) { throwSend = false; throw new Error("send failed"); }
        this.sent.push(text); host.receiveText(this.peer, text);
      },
      close() { this.closed++; host.disconnect(this.peer); events.closed(); }
    };
    links.push(link);
    if (open) events.open();
    link.peer = host.connect("local", message => {
      if (message.type === "snapshot" && !snapshots || message.type === "receipt" && dropReceipt) return;
      const text = JSON.stringify(message); link.received.push(text); events.message(text);
    });
    return link;
  }, { scheduler: time, retryMs: 1000, reconnectMs: 100, timeoutMs: 3000 });
  connection.subscribe(status => statuses.push(status));
  const intent = value => ({ type: "control", control: { type: "reserve", value } });
  return { time, connection, links, results, statuses, intent, hostRuntime, host,
    get replica() { return replica; }, get restorations() { return restorations; },
    loseReceipt(value) { dropReceipt = value; }, failSend() { throwSend = true; },
    same: () => assert.equal(hash(hostRuntime), hash(replica)) };
}

test("synchronous open and snapshot are queued until the transport exists; repeated start is inert", () => {
  const f = fixture(); f.connection.start(); f.connection.start();
  assert.deepEqual(f.statuses, ["idle", "connecting", "synchronizing", "ready"]);
  assert.equal(f.links.length, 1); assert.equal(f.time.size, 0); f.same();
  const completed = [];
  assert.equal(f.connection.request(f.intent(123), receipt => completed.push(receipt.result)), true);
  assert.deepEqual(completed, ["handled"]); assert.equal(f.connection.busy, false); f.same();
  f.connection.close(); assert.equal(f.links[0].closed, 1); assert.equal(f.time.size, 0);
});

test("lost receipts retry the original operation automatically without advancing simulation or charging twice", () => {
  const f = fixture(); f.connection.start(); f.loseReceipt(true);
  const completed = [], before = f.hostRuntime.world.effectiveChars();
  const deploy = { type: "operation", operation: { type: "deploy", card: "A", cell: { lane: 3, column: 2 }, expected: null } };
  assert.equal(f.connection.request(deploy, receipt => completed.push(receipt.result)), true);
  assert.equal(f.connection.busy, true); assert.equal(f.connection.request(f.intent(20)), false);
  const paid = f.hostRuntime.world.effectiveChars(); assert.ok(paid < before);
  f.time.advance(1000); assert.equal(f.links[0].sent.length, 2); assert.deepEqual(completed, []);
  f.loseReceipt(false); f.time.advance(1000);
  assert.deepEqual(completed, ["deployed"]); assert.equal(f.hostRuntime.world.towers.length, 1);
  assert.equal(f.hostRuntime.world.effectiveChars(), paid); assert.equal(f.hostRuntime.session.clock.tick, 0);
  assert.equal(f.time.size, 0); f.same(); f.connection.close();
});

test("automatic reconnect fences all messages and close events from an obsolete link", () => {
  const f = fixture(); f.connection.start(); const old = f.links[0];
  f.loseReceipt(true); let calls = 0; f.connection.request(f.intent(55), () => calls++);
  old.events.closed(); assert.equal(f.connection.status, "reconnecting"); assert.equal(f.connection.ready, false);
  assert.equal(f.connection.request(f.intent(60)), false);
  f.loseReceipt(false); f.time.advance(100);
  assert.equal(f.connection.ready, true); assert.equal(f.restorations, 2); assert.equal(calls, 1);
  old.events.message("invalid stale input"); old.events.closed(false); old.events.open();
  assert.equal(f.connection.ready, true); assert.equal(f.links.length, 2); assert.equal(calls, 1); f.same();
  f.connection.close(); f.time.advance(10000); assert.equal(f.links.length, 2); assert.equal(f.time.size, 0);
});

test("send failure keeps its pending request for reconnect and reports ready only after reconstruction", () => {
  const f = fixture(); f.connection.start(); f.failSend();
  assert.equal(f.connection.request(f.intent(72)), true); assert.equal(f.connection.status, "reconnecting");
  assert.equal(f.connection.busy, true); assert.equal(f.hostRuntime.session.controls.reserveChars, 0);
  f.time.advance(100); assert.equal(f.connection.status, "ready"); assert.equal(f.connection.busy, false);
  assert.equal(f.hostRuntime.session.controls.reserveChars, 72); f.same(); f.connection.close();
});

test("silent handshake and missing receipts time out, back off, and retain original request identity", () => {
  const f = fixture({ open: false, snapshots: false }); f.connection.start();
  f.time.advance(3000); assert.equal(f.connection.status, "reconnecting"); f.time.advance(100);
  assert.equal(f.links.length, 2); f.time.advance(3000); f.time.advance(199); assert.equal(f.links.length, 2);
  f.time.advance(1); assert.equal(f.links.length, 3); f.connection.close(); assert.equal(f.time.size, 0);
  const pending = fixture(); pending.connection.start(); pending.loseReceipt(true);
  pending.connection.request(pending.intent(100)); pending.time.advance(3000);
  assert.equal(pending.connection.status, "reconnecting"); pending.loseReceipt(false); pending.time.advance(100);
  assert.equal(pending.connection.busy, false); assert.equal(pending.hostRuntime.session.nextCommandSequence, 1);
  pending.same(); pending.connection.close();
});

test("divergence requests a snapshot and returns to ready; malformed input stops instead of reconnect-looping", () => {
  const f = fixture(); f.connection.start();
  f.replica.world.chars += 1;
  f.connection.request(f.intent(200)); f.same(); assert.equal(f.restorations, 2); assert.equal(f.connection.status, "ready");
  f.links.at(-1).events.message("{}"); assert.equal(f.connection.status, "failed");
  f.time.advance(10000); assert.equal(f.links.length, 1); assert.equal(f.time.size, 0);
  f.connection.reconnect(); assert.equal(f.connection.status, "ready"); f.connection.close();
});

test("terminal denial and disposal release timers and callbacks; closing from status listeners is safe", () => {
  const f = fixture(); f.connection.start(); f.links[0].events.closed(false);
  assert.equal(f.connection.status, "failed"); assert.equal(f.time.size, 0);
  f.connection.close(); f.connection.start(); f.connection.reconnect();
  assert.equal(f.connection.status, "closed"); assert.equal(f.links.length, 1);
  const g = fixture(); g.connection.subscribe(status => { if (status === "connecting") g.connection.close(); });
  g.connection.start(); assert.equal(g.links.length, 0); assert.equal(g.time.size, 0);
  const h = fixture(); h.connection.start(); h.loseReceipt(true);
  h.connection.request(h.intent(300), () => assert.fail("Disposed completion"));
  h.connection.close(); assert.equal(h.connection.busy, false); h.time.advance(10000);
  assert.equal(h.time.size, 0); assert.equal(h.links.length, 1);
});

test("startup flood and oversized messages close the acquired transport without retaining queued payloads", () => {
  const time = clock(); let closed = 0;
  const connection = new BattleConnection({ restore() { assert.fail("Must reject before restore"); }, follow() {}, checksum: () => "" }, events => {
    for (let i = 0; i < 100; i++) events.open();
    return { send() {}, close() { closed++; } };
  }, { scheduler: time });
  connection.start(); assert.equal(connection.status, "failed"); assert.equal(closed, 1); assert.equal(time.size, 0);
  connection.close(); assert.equal(closed, 1);
  const f = fixture(); f.connection.start();
  f.links[0].events.message(" ".repeat(16 * 1024 * 1024 + 1));
  assert.equal(f.connection.status, "failed"); assert.equal(f.links[0].closed, 1); assert.equal(f.time.size, 0);
  f.connection.close();
});
