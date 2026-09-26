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
const { BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");

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
function fixture({ open = true, snapshots = true, frameSliceTicks, snapshotCatchUpTicks, snapshotSkipCooldownMs } = {}) {
  const hooks = {};
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
    restore: ({ replay }) => { restorations++; replica = createIndependentBattle(replay, { replica: true, checkpoint: replay.checkpoint }); hooks.restore?.(); },
    follow: (tick, commands) => { replica.session.followFrame(tick, commands, replica.sessionRuntime); hooks.follow?.(); },
    checksum: () => { hooks.checksum?.(); return hash(replica); }, receipt: receipt => results.push(receipt)
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
  }, { scheduler: time, retryMs: 1000, reconnectMs: 100, timeoutMs: 3000, frameSliceTicks,
    snapshotCatchUpTicks, snapshotSkipCooldownMs });
  connection.subscribe(status => statuses.push(status));
  const intent = value => ({ type: "control", control: { type: "reserve", value } });
  return { time, connection, links, results, statuses, intent, hostRuntime, host, hooks,
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

test("a retired snapshot callback cannot fail a replacement connection", () => {
  const f = fixture();
  f.hooks.restore = () => { delete f.hooks.restore; f.connection.reconnect(); throw Error("retired snapshot view"); };
  f.connection.start(); f.time.advance(1);
  assert.equal(f.connection.status, "ready"); assert.equal(f.restorations, 2);
  assert.equal(f.links[1].sent.length, 0); f.same();
  f.connection.close(); assert.equal(f.time.size, 0);
});

test("a retired immediate frame cannot request resync on a replacement link", () => {
  const f = fixture(); f.connection.start();
  f.hooks.follow = () => { delete f.hooks.follow; f.connection.reconnect(); throw Error("retired immediate view"); };
  let completed = 0;
  f.connection.request(f.intent(42), () => completed++); f.time.advance(1);
  assert.equal(f.connection.ready, true); assert.equal(completed, 1);
  assert.deepEqual(f.links[1].sent.map(text => JSON.parse(text).type), ["request"]);
  f.same(); f.connection.close(); assert.equal(f.time.size, 0);
});

test("a send that replaces its link before throwing cannot retire the new link", () => {
  const f = fixture(); f.connection.start();
  f.links[0].send = () => { f.connection.reconnect(); throw Error("old sender failed"); };
  let completed = 0;
  f.connection.request(f.intent(84), () => completed++);
  assert.equal(f.connection.ready, true); assert.equal(completed, 1);
  assert.equal(f.links.length, 2); assert.equal(f.links[1].closed, 0);
  assert.equal(f.hostRuntime.session.nextCommandSequence, 1);
  f.same(); f.connection.close(); assert.equal(f.time.size, 0);
});

test("closing during snapshot restoration skips all further old-view callbacks", () => {
  const f = fixture();
  f.hooks.restore = () => f.connection.close();
  f.hooks.checksum = () => assert.fail("Checksum called after scene disposal");
  f.connection.start();
  assert.equal(f.connection.status, "closed"); assert.equal(f.time.size, 0);
});

test("checksum reentry fences snapshots, immediate frames, duplicates and sliced final validation", () => {
  for (const mode of ["snapshot", "immediate", "duplicate", "sliced"]) for (const throws of [false, true]) {
    const f = fixture({ frameSliceTicks: mode === "sliced" ? 2 : undefined });
    const replace = () => {
      delete f.hooks.checksum; f.connection.reconnect();
      if (throws) throw Error("old checksum view");
    };
    if (mode === "snapshot") f.hooks.checksum = replace;
    f.connection.start();
    if (mode !== "snapshot") {
      if (mode !== "duplicate") f.hooks.checksum = replace;
      f.hostRuntime.session.advance(BATTLE_STEP_MS * 6, f.hostRuntime.sessionRuntime); f.host.publish();
      if (mode === "duplicate") {
        f.hooks.checksum = replace; f.links[0].events.message(f.links[0].received.at(-1));
      }
    }
    f.time.advance(10);
    assert.equal(f.connection.ready, true, `${mode}/${throws}`);
    assert.equal(f.links.length, 2); assert.equal(f.links[1].sent.length, 0);
    f.same(); f.connection.close(); assert.equal(f.time.size, 0);
  }
});

test("sliced frames preserve commands at boundaries and withhold later messages until final checksum", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  const set = value => f.hostRuntime.session.submit({ type: "control", actorId: "local",
    control: { type: "reserve", value } }, command => f.hostRuntime.executeCommand(command));
  set(10); f.hostRuntime.session.advance(BATTLE_STEP_MS * 2, f.hostRuntime.sessionRuntime);
  set(20); set(21); f.hostRuntime.session.advance(BATTLE_STEP_MS * 4, f.hostRuntime.sessionRuntime); set(60);
  f.host.publish();
  assert.equal(f.replica.session.clock.tick, 2); assert.equal(f.replica.session.controls.reserveChars, 21);
  assert.equal(f.connection.ready, true); assert.equal(f.connection.busy, false); assert.equal(f.connection.catchingUp, true);
  // A later same-tick command must wait behind the first frame's checksum.
  set(61); f.host.publish();
  f.time.advance(1); assert.equal(f.replica.session.clock.tick, 4);
  f.time.advance(1); assert.equal(f.replica.session.clock.tick, 6);
  assert.equal(f.replica.session.controls.reserveChars, 60); assert.equal(f.connection.catchingUp, true);
  f.time.advance(1); assert.equal(f.replica.session.controls.reserveChars, 61);
  assert.equal(f.connection.ready, true); assert.equal(f.connection.busy, false); assert.equal(f.time.size, 0);
  f.connection.reconnect(); set(90);
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish(); f.time.advance(3);
  assert.equal(f.replica.session.controls.reserveChars, 90);
  f.same(); f.connection.close();
});

test("catch-up accepts one cloned intent and sends it after the frame checksum, before later queued frames", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
  const intent = f.intent(999), completed = [];
  assert.equal(f.connection.catchingUp, true); assert.equal(f.connection.ready, true); assert.equal(f.connection.busy, false);
  assert.equal(f.connection.request(intent, receipt => completed.push(receipt.result)), true);
  intent.control.value = 7;
  assert.equal(f.connection.request(f.intent(123)), false); assert.equal(f.connection.busy, true);
  assert.equal(f.links[0].sent.length, 0); assert.equal(f.hostRuntime.session.controls.reserveChars, 0);
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
  f.time.advance(2);
  assert.equal(f.replica.session.clock.tick, 6); assert.equal(f.links[0].sent.length, 0);
  f.time.advance(1);
  assert.equal(f.hostRuntime.session.controls.reserveChars, 999);
  assert.equal(f.replica.session.clock.tick, 8); assert.deepEqual(completed, []);
  assert.equal(f.links[0].sent.length, 1);
  f.time.advance(10);
  assert.deepEqual(completed, ["handled"]); assert.equal(f.connection.busy, false); f.same();
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish(); f.time.advance(3);
  assert.equal(f.links[0].sent.length, 1, "Frame completion must not resend an already transmitted request");
  f.same(); f.connection.close(); assert.equal(f.time.size, 0);
});

test("catch-up input with a lost receipt retries by timer, not on every subsequent frame", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start(); f.loseReceipt(true);
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
  let completed = 0;
  assert.equal(f.connection.request(f.intent(63), () => completed++), true);
  f.time.advance(3);
  for (let i = 0; i < 10; i++) {
    f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish(); f.time.advance(3);
  }
  assert.equal(f.links[0].sent.length, 1); assert.equal(f.connection.busy, true); assert.equal(completed, 0);
  f.loseReceipt(false); f.time.advance(1000);
  assert.equal(f.links[0].sent.length, 2); assert.equal(f.hostRuntime.session.nextCommandSequence, 1);
  assert.equal(completed, 1); assert.equal(f.connection.busy, false); f.same();
  f.connection.close(); assert.equal(f.time.size, 0);
});

test("catch-up input waits for reconstruction after divergence instead of sending against a failed checksum", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
  let completed = 0;
  assert.equal(f.connection.request(f.intent(88), () => completed++), true);
  f.replica.world.chars++;
  f.time.advance(2); assert.equal(f.links[0].sent.length, 0);
  f.time.advance(1);
  assert.deepEqual(f.links[0].sent.map(text => JSON.parse(text).type), ["resync", "request"]);
  assert.equal(f.restorations, 2); assert.equal(completed, 1);
  assert.equal(f.hostRuntime.session.nextCommandSequence, 1); f.same();
  f.connection.close(); assert.equal(f.time.size, 0);
});

test("catch-up input survives disconnect or send failure once, but is discarded by close", () => {
  for (const mode of ["disconnect", "sendFailure", "close"]) {
    const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
    f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
    const abandoned = f.replica; let completed = 0;
    assert.equal(f.connection.request(f.intent(72), () => completed++), true);
    if (mode === "close") {
      f.connection.close(); f.time.advance(1000);
      assert.equal(f.hostRuntime.session.nextCommandSequence, 0); assert.equal(completed, 0);
      assert.equal(f.links[0].sent.length, 0); assert.equal(f.time.size, 0); continue;
    }
    if (mode === "disconnect") f.links[0].events.closed();
    else { f.failSend(); f.time.advance(3); }
    f.time.advance(100);
    assert.equal(f.links.length, 2); assert.equal(f.links[0].sent.length, 0);
    assert.equal(f.links[1].sent.length, 1); assert.equal(completed, 1);
    assert.equal(f.hostRuntime.session.nextCommandSequence, 1);
    assert.notEqual(f.replica, abandoned); f.same();
    f.connection.close(); assert.equal(f.time.size, 0);
  }
});

test("catch-up deployment revalidates its cell on the host without charging or upgrading an intervening tower", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
  const operation = { type: "deploy", card: "A", cell: { lane: 3, column: 2 }, expected: null }, completed = [];
  assert.equal(f.connection.request({ type: "operation", operation }, receipt => completed.push(receipt.result)), true);
  f.hostRuntime.session.submit({ type: "operation", actorId: "local", operation }, command => f.hostRuntime.executeCommand(command));
  const paid = f.hostRuntime.world.effectiveChars();
  f.host.publish(); f.time.advance(10);
  assert.deepEqual(completed, ["stale"]);
  assert.equal(f.hostRuntime.world.towers.length, 1); assert.equal(f.hostRuntime.world.towers[0].level, 1);
  assert.equal(f.hostRuntime.world.effectiveChars(), paid); f.same();
  f.connection.close(); assert.equal(f.time.size, 0);
});

test("a scene callback may reconnect during a slice without stranding the new snapshot", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  const abandoned = f.replica, follow = abandoned.session.followFrame;
  abandoned.session.followFrame = function(...args) {
    follow.apply(this, args); f.connection.reconnect();
    throw Error("old scene retired");
  };
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
  f.time.advance(5); assert.equal(f.restorations, 2); assert.equal(f.connection.ready, true);
  assert.equal(abandoned.session.clock.tick, 2); f.same();
  assert.equal(f.time.size, 0); f.connection.close();
});

test("pause and resume at slice boundaries preserve command order and queued receipts", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  const setPause = paused => f.hostRuntime.session.submit({ type: "control", actorId: "local",
    control: { type: "pause", paused } }, command => f.hostRuntime.executeCommand(command));
  f.hostRuntime.session.advance(BATTLE_STEP_MS * 2, f.hostRuntime.sessionRuntime);
  setPause(true); setPause(false);
  f.hostRuntime.session.advance(BATTLE_STEP_MS * 4, f.hostRuntime.sessionRuntime); setPause(true);
  // Request handling publishes the unsent tick batch before its receipt.
  let completed = 0;
  assert.equal(f.connection.request(f.intent(75), () => completed++), true);
  assert.equal(f.replica.session.clock.tick, 2);
  assert.equal(f.replica.session.controls.paused, false);
  assert.equal(completed, 0);
  f.time.advance(2);
  assert.equal(f.replica.session.controls.paused, true); assert.equal(completed, 0);
  f.time.advance(1);
  assert.equal(completed, 1); assert.equal(f.connection.catchingUp, false); f.same();
  assert.equal(f.connection.request({ type: "control", control: { type: "pause", paused: false } }), true);
  f.hostRuntime.session.advance(BATTLE_STEP_MS * 6, f.hostRuntime.sessionRuntime); f.host.publish();
  f.time.advance(3);
  assert.equal(f.replica.session.clock.tick, 12); assert.equal(f.connection.ready, true);
  f.same(); f.connection.close(); assert.equal(f.time.size, 0);
});

test("a backlog of small frames jumps to a current snapshot instead of replaying the entire history", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  let followed = 0; f.hooks.follow = () => followed++;
  for (let frame = 0; frame < 24; frame++) {
    f.hostRuntime.session.advance(BATTLE_STEP_MS * 6, f.hostRuntime.sessionRuntime); f.host.publish();
  }
  assert.equal(f.restorations, 2);
  assert.ok(f.replica.session.clock.tick >= 126);
  f.time.advance(20); f.same();
  assert.ok(followed < 20, "Skipped history must not run simulation slices");
  assert.deepEqual(f.links[0].sent.map(text => JSON.parse(text).type), ["resync"]);
  assert.equal(f.links.length, 1); assert.equal(f.connection.ready, true);
  f.connection.close(); assert.equal(f.time.size, 0);
});

test("snapshot skipping preserves unsent and already executed pending input exactly once", () => {
  for (const sent of [false, true]) {
    const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
    let completed = 0;
    if (sent) f.loseReceipt(true);
    else { f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish(); }
    assert.equal(f.connection.request(f.intent(91), () => completed++), true);
    assert.equal(completed, 0); f.loseReceipt(false);
    for (let tick = 0; tick < 150; tick++) f.hostRuntime.session.advance(BATTLE_STEP_MS, f.hostRuntime.sessionRuntime);
    f.host.publish(); f.time.advance(10);
    assert.equal(f.restorations, 2); assert.equal(completed, 1);
    assert.equal(f.hostRuntime.session.nextCommandSequence, 1);
    assert.equal(f.replica.session.controls.reserveChars, 91);
    assert.equal(f.connection.busy, false); f.same();
    const requests = f.links[0].sent.map(text => JSON.parse(text)).filter(message => message.type === "request");
    assert.equal(requests.length, sent ? 2 : 1);
    assert.ok(requests.every(message => message.request.sequence === 0));
    f.connection.close(); assert.equal(f.time.size, 0);
  }
});

test("snapshot skipping has a cooldown and resumes normal frame following between skips", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  const burst = () => {
    for (let tick = 0; tick < 126; tick++) f.hostRuntime.session.advance(BATTLE_STEP_MS, f.hostRuntime.sessionRuntime);
    f.host.publish();
  };
  burst(); assert.equal(f.restorations, 2); f.same();
  burst(); assert.equal(f.restorations, 2); assert.equal(f.connection.catchingUp, true);
  f.time.advance(70); f.same();
  f.time.advance(4930);
  burst(); assert.equal(f.restorations, 3); f.same();
  f.connection.close(); assert.equal(f.time.size, 0);
});

test("a lagging frame cannot bypass validation or use a foreign stream to trigger a snapshot", () => {
  for (const kind of ["invalid", "foreign"]) {
    const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
    f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
    const frame = JSON.parse(f.links[0].received.at(-1));
    frame.to.tick = 150;
    if (kind === "invalid") frame.commands = [{ tick: 150 }];
    else frame.stream++;
    f.links[0].events.message(JSON.stringify(frame));
    f.time.advance(10);
    assert.equal(f.restorations, 1); assert.equal(f.links[0].sent.length, 0);
    assert.equal(f.connection.status, kind === "invalid" ? "failed" : "ready");
    if (kind === "foreign") f.same();
    f.connection.close(); assert.equal(f.time.size, 0);
  }
});

test("snapshot skipping blocks input until a valid replacement arrives and rejects corrupt snapshots", () => {
  for (const corrupt of [false, true]) {
    const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
    const events = f.links[0].events, receive = events.message;
    let snapshot;
    events.message = text => {
      if (JSON.parse(text).type === "snapshot") snapshot = text;
      else receive(text);
    };
    for (let tick = 0; tick < 126; tick++) f.hostRuntime.session.advance(BATTLE_STEP_MS, f.hostRuntime.sessionRuntime);
    f.host.publish();
    assert.ok(snapshot); assert.equal(f.connection.status, "synchronizing");
    assert.equal(f.connection.request(f.intent(5)), false);
    if (corrupt) { const message = JSON.parse(snapshot); message.checksum = "00000000"; snapshot = JSON.stringify(message); }
    receive(snapshot);
    assert.equal(f.connection.status, corrupt ? "failed" : "ready");
    assert.equal(f.restorations, corrupt ? 1 : 2);
    if (!corrupt) f.same();
    f.connection.close(); assert.equal(f.time.size, 0);
  }
  for (const snapshotCatchUpTicks of [-1, 1.5, NaN]) assert.throws(() => fixture({ snapshotCatchUpTicks }));
  for (const snapshotSkipCooldownMs of [0, 999, Infinity]) assert.throws(() => fixture({ snapshotSkipCooldownMs }));
});

test("the maximum valid tick gap drains in bounded slices without skipping simulation", () => {
  const f = fixture({ frameSliceTicks: 2, snapshotCatchUpTicks: 0 }); f.connection.start();
  for (let tick = 0; tick < 600; tick++) f.hostRuntime.session.advance(BATTLE_STEP_MS, f.hostRuntime.sessionRuntime);
  assert.equal(f.hostRuntime.session.clock.tick, 600);
  f.host.publish();
  assert.equal(f.replica.session.clock.tick, 2);
  for (let slice = 1; slice < 300; slice++) {
    f.time.advance(1);
    assert.equal(f.replica.session.clock.tick, (slice + 1) * 2);
    assert.equal(f.connection.ready, true); assert.equal(f.connection.catchingUp, true);
  }
  f.time.advance(1);
  assert.equal(f.connection.ready, true); assert.equal(f.connection.catchingUp, false);
  assert.equal(f.restorations, 1); f.same();
  f.connection.close(); assert.equal(f.time.size, 0);
});

test("invalid later commands are rejected before the first slice mutates the replica", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish(); f.time.advance(3);
  const value = JSON.parse(f.links[0].received.at(-1));
  value.from = { ...value.to }; value.to.tick += 6; value.to.sequence++;
  value.commands = [{ tick: value.to.tick, sequence: value.from.sequence,
    command: { type: "control", actorId: "local", control: { type: "reserve", value: -1 } } }];
  const before = f.replica.session.clock.tick;
  f.links[0].events.message(JSON.stringify(value));
  assert.equal(f.connection.status, "failed"); assert.equal(f.replica.session.clock.tick, before);
  assert.equal(f.time.size, 0); f.connection.close();
});

test("disconnect mid-slice abandons partial state and never advances the replacement snapshot", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
  const abandoned = f.replica, oldLink = f.links[0];
  assert.equal(abandoned.session.clock.tick, 2);
  oldLink.events.closed(); f.time.advance(100);
  assert.notEqual(f.replica, abandoned); assert.equal(abandoned.session.clock.tick, 2);
  oldLink.events.message(oldLink.received.at(-1)); f.time.advance(100);
  assert.equal(f.replica.session.clock.tick, 6); f.same();
  assert.equal(f.time.size, 0); f.connection.close();
});

test("sliced divergence resyncs after the complete frame, not from a partial checksum", () => {
  const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
  f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
  f.replica.world.chars++;
  f.time.advance(2); assert.equal(f.restorations, 1);
  f.time.advance(1); assert.equal(f.restorations, 2); assert.equal(f.connection.ready, true);
  f.same(); assert.equal(f.time.size, 0); f.connection.close();
});

test("queued ingress is bounded while a sliced frame is in flight and close cancels work", () => {
  for (const mode of ["close", "count", "size"]) {
    const f = fixture({ frameSliceTicks: 2 }); f.connection.start();
    f.hostRuntime.session.advance(100, f.hostRuntime.sessionRuntime); f.host.publish();
    const tick = f.replica.session.clock.tick;
    if (mode === "close") f.connection.close();
    if (mode === "count") for (let i = 0; i < 65; i++) f.links[0].events.message(f.links[0].received.at(-1));
    if (mode === "size") for (let i = 0; i < 3; i++) f.links[0].events.message(" ".repeat(8 * 1024 * 1024));
    assert.equal(f.connection.status, mode === "close" ? "closed" : "failed");
    assert.equal(f.time.size, 0); f.time.advance(100);
    assert.equal(f.replica.session.clock.tick, tick); f.connection.close();
  }
  for (const frameSliceTicks of [0, -1, 1.5, 601, NaN]) assert.throws(() => fixture({ frameSliceTicks }));
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
