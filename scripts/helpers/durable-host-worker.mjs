import { createRequire } from "node:module";
import { once } from "node:events";
import { createTypeScriptLoader } from "./load-typescript.mjs";

const incoming = process.argv[2] === "restore" ? once(process, "message") : undefined;
const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { DurableBattleHost } = load("src/game/durableBattleHost.ts");
const { BATTLE_RULES_VERSION } = load("src/game/battleSimulation.ts");
const { BATTLE_PROTOCOL_VERSION } = load("src/game/battleAuthority.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { decodeSyncMessage } = load("src/game/battleSyncProtocol.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const { createBattleCheckpointStore } = createRequire(import.meta.url)("../../electron/battle-checkpoint.cjs");
const store = createBattleCheckpointStore(process.argv[3]);
const options = { version: BATTLE_RULES_VERSION, difficultyVersion: 2, levelId: "IF-1", difficulty: 3,
  unlimitedFirepower: false, seed: 871, debug: true, selectedCards: ["A", "B"], policy: LEGACY_BATTLE_POLICY };
let crash = false, request;
const ports = { inputTime: () => 0, save: async text => {
  await store.save(text);
  if (crash) {
    process.send({ event: "persisted-unacknowledged", request });
    await new Promise(() => {});
  }
} };
if (process.argv[2] === "crash") {
  const host = await DurableBattleHost.create("durable", options, ports), messages = [];
  const peer = await host.connect("local", message => messages.push(message));
  request = { version: BATTLE_PROTOCOL_VERSION, battleId: "durable", sequence: 0,
    intent: { type: "operation", operation: { type: "deploy", card: "B", cell: { lane: 3, column: 2 }, expected: null } } };
  crash = true;
  await host.receiveText(peer, JSON.stringify({ type: "request", stream: messages[0].stream, request }));
  throw Error("Uncommitted response escaped");
} else {
  [request] = await incoming;
  const host = await DurableBattleHost.restore(await store.read(), ports), messages = [];
  const peer = await host.connect("local", message => messages.push(message));
  await host.receiveText(peer, JSON.stringify({ type: "request", stream: messages[0].stream, request }));
  const saved = JSON.parse(host.checkpointText), world = decodeSaveGraph(decodeSyncMessage(saved.snapshot).replay.checkpoint, () => ({}));
  process.send({ towers: world.towers.length, chars: world.chars, sequence: saved.snapshot.cursor.sequence,
    stream: saved.stream, receipt: messages.at(-1).receipt });
  await host.close(); process.disconnect();
}
