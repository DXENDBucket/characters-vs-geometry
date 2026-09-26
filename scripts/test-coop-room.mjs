import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { CoopRoom } = load("src/multiplayer/coopRoom.ts");
const { copyBattlePolicy, sameBattlePolicy, battlePolicyForActor } = load("src/game/battlePolicy.ts");
const { BattleSyncClient } = load("src/game/battleSyncClient.ts");
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { cardUnlockRequirement } = load("src/data/cardUnlocks.ts");
const profile = (name, allowedCards, completed = []) => ({ name, completed,
  policy: copyBattlePolicy({ version: 1, allowedCards, slotCount: 6, reselectEnabled: true, pauseOnLocalModal: false }) });
function fixture() {
  const room = new CoopRoom("TEST", profile("Host", ["A", "X", "i"], ["1-1", "2-9"]));
  room.join(profile("Guest", ["B", "X"]));
  room.select("host", ["A", "X"]); room.select("guest", ["B", "X"]);
  return room;
}
function start(room) { room.ready("host", true); room.ready("guest", true); room.start("host", 123, false); }
function replica(room, actor, id = actor) {
  let runtime;
  const hash = () => battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0]));
  const client = new BattleSyncClient({ restore: ({ replay }) => { runtime = createIndependentBattle(replay, { replica: true, checkpoint: replay.checkpoint }); },
    follow: (tick, commands) => runtime.session.followFrame(tick, commands, runtime.sessionRuntime), checksum: hash });
  room.connect(actor, id); client.connect(message => room.receive(actor, id, JSON.stringify(message)));
  const pump = () => { for (const text of room.poll(actor, id)) assert.notEqual(client.receiveText(text), "invalid"); };
  pump(); return { client, pump, hash, get runtime() { return runtime; } };
}
test("host chooses only completed stages; guest cannot configure/start and selections remain local", () => {
  const room = fixture();
  assert.deepEqual(room.state().levels, ["1-1", "2-9"]);
  assert.throws(() => room.configure("guest", "1-1", 3));
  assert.throws(() => room.configure("host", "1-2", 3));
  assert.throws(() => room.select("guest", ["A"]));
  assert.throws(() => room.start("host", 1, false));
  room.ready("host", true); room.ready("guest", true);
  assert.throws(() => room.start("guest", 1, false));
  room.configure("host", "2-9", 3); assert.ok(room.state().players.every(p => !p.ready));
  room.close();
});
test("independent wallets, own towers, local unlocks and two replicas agree", () => {
  const room = fixture(); start(room);
  const host = replica(room, "host"), guest = replica(room, "guest");
  const hash = () => battleChecksum(room.runtime.snapshot(room.runtime.world.loadout.ids[0]));
  const pump = () => { host.pump(); guest.pump(); assert.equal(host.hash(), hash()); assert.equal(guest.hash(), hash()); };
  pump();
  const before = room.runtime.world.economy.balance("guest");
  let receipt;
  host.client.request({ type: "operation", operation: { type: "deploy", card: "A", cell: { lane: 3, column: 2 }, expected: null } }, r => receipt = r);
  pump(); assert.equal(receipt.result, "deployed");
  assert.equal(room.runtime.world.economy.balance("guest"), before);
  const tower = room.runtime.world.towers[0]; assert.equal(tower.ownerId, "host");
  guest.client.request({ type: "operation", operation: { type: "erase", target: { kind: "tower", id: tower.entityId } } }, r => receipt = r);
  pump(); assert.equal(receipt.result, "forbidden"); assert.equal(room.runtime.world.towers.length, 1);
  assert.equal(room.runtime.executeControl("guest", { type: "pause", paused: true }), "forbidden");
  assert.equal(room.runtime.executeControl("guest", { type: "reselect", cards: ["A"] }), "forbidden");
  assert.equal(battlePolicyForActor(room.runtime.session.policy, "guest").allowedCards.includes("A"), false);
  assert.equal(sameBattlePolicy(room.runtime.session.policy, host.runtime.session.policy), true);
  room.disconnect("guest", "stale-connection"); assert.equal(room.links.has("guest"), true);
  room.close(); host.client.dispose(); guest.client.dispose();
});
test("cooperative battle can reach terminal state and synchronize it to both players", () => {
  const room = fixture(); start(room); const host = replica(room, "host"), guest = replica(room, "guest");
  for (let i = 0; i < 12000 && !room.runtime.world.gameOver; i++) {
    room.runtime.session.advance(BATTLE_STEP_MS, room.runtime.sessionRuntime);
    if (i % 6 === 0 || room.runtime.world.gameOver) { room.sync.publish(room.runtime.world.gameOver); host.pump(); guest.pump(); }
  }
  assert.equal(room.runtime.world.gameOver, true);
  assert.equal(host.runtime.world.gameOver, true); assert.equal(guest.runtime.world.gameOver, true);
  assert.equal(host.hash(), guest.hash());
  room.close(); host.client.dispose(); guest.client.dispose();
});
test("local i unlock is now 2-9", () => assert.equal(cardUnlockRequirement("i"), "2-9"));
