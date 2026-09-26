import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { load, createRuntime, step, cloneCheckpoint, battleChecksum, captureBattleSnapshot } from "./helpers/battle-runtime.mjs";
const { ReplayLibrary, parseReplayFile, exportReplayFile, replayStartTick } = load("src/replays.ts");
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const make = (id = "test", savedAt = 1) => {
  const runtime = createRuntime("1-9", ["A", "B"]); runtime.initialize();
  return { runtime, entry: { format: "charset-replay", version: 1, id, savedAt, outcome: "unfinished", actorId: "local", replay: runtime.session.exportReplay() } };
};

test("replay library keeps three newest battles, updates one battle in place, and survives reopening", async () => {
  const factory = new IDBFactory(), library = new ReplayLibrary(factory);
  await Promise.all([1, 2, 3, 4].map(n => library.save(make(String(n), n).entry)));
  assert.deepEqual((await library.recent()).map(entry => entry.id), ["4", "3", "2"]);
  const updated = make("4", 4).entry; updated.outcome = "victory";
  await library.save(updated);
  const reopened = await new ReplayLibrary(factory).recent();
  assert.equal(reopened.length, 3); assert.equal(reopened[0].outcome, "victory");
  assert.equal(await library.save(make("old", 0).entry), true);
  assert.equal((await library.recent()).length, 3);
});

test("unavailable persistent storage preserves the latest three replays in memory", async () => {
  const library = new ReplayLibrary(null);
  for (let n = 1; n <= 4; n++) assert.equal(await library.save(make(String(n), n).entry), false);
  assert.deepEqual((await library.recent()).map(entry => entry.id), ["4", "3", "2"]);
});

test("replay files reject incompatible versions, invalid levels/cards and invalid checkpoints", () => {
  const { entry } = make();
  assert.deepEqual(parseReplayFile(exportReplayFile(entry)), entry);
  for (const mutate of [e => e.replay.version++, e => e.replay.levelId = "missing", e => e.replay.selectedCards = ["missing"],
    e => e.replay.selectedCards = ["A", "A"], e => e.replay.checkpoint = {}, e => e.actorId = "<script>", e => e.format = "save"]) {
    const bad = structuredClone(entry); mutate(bad);
    assert.throws(() => parseReplayFile(JSON.stringify(bad)));
  }
  assert.throws(() => parseReplayFile('{"unfinished":'));
});

test("exported ordinary and checkpoint replays reproduce the same battle without changing the original", () => {
  for (const resumed of [false, true]) {
    let { runtime, entry } = make();
    const deploy = (card, column) => runtime.session.submit({ type: "operation", actorId: "local",
      operation: { type: "deploy", card, cell: { lane: 3, column }, expected: null } }, command => runtime.executeCommand(command));
    deploy("A", 2); step(runtime, 30);
    if (resumed) {
      runtime = cloneCheckpoint(runtime);
      runtime.session.startRecordingFromCheckpoint(captureBattleSnapshot(runtime.snapshot("A")), ["A", "B"]);
    }
    deploy("B", 4); step(runtime, 180);
    entry.replay = runtime.session.exportReplay();
    const imported = parseReplayFile(exportReplayFile(entry));
    assert.equal(replayStartTick(imported.replay), resumed ? 30 : 0);
    const playback = createIndependentBattle(imported.replay, { playback: imported.replay });
    step(playback, imported.replay.endTick - replayStartTick(imported.replay));
    assert.equal(playback.session.playbackComplete, true);
    assert.equal(battleChecksum(playback.snapshot("A")), battleChecksum(runtime.snapshot("A")));
  }
});
