import { createRuntime, captureBattleSnapshot, battleChecksum, load } from "./helpers/battle-runtime.mjs";
import { legacyBattleChecksum } from "./helpers/legacy-battle-checksum.mjs";
const { encodeBattleWireGraph, decodeBattleWireGraph } = load("src/game/battleWireGraph.ts");
const runtime = createRuntime(); runtime.initialize();
for (let i = 0; i < 800; i++) runtime.spawnEnemy({ kind: "circle", lane: i % 7, time: 0,
  waveNumber: 1, waveWeight: 10, finalDamageReduction: 0 });
const state = runtime.snapshot("A"), graph = captureBattleSnapshot(state), wire = encodeBattleWireGraph(graph);
const samples = {};
for (const [name, run] of Object.entries({ capture: () => captureBattleSnapshot(state),
  legacyChecksum: () => legacyBattleChecksum(captureBattleSnapshot, state), checksum: () => battleChecksum(state),
  wireEncode: () => encodeBattleWireGraph(graph), wireDecode: () => decodeBattleWireGraph(wire) })) {
  for (let i = 0; i < 3; i++) run();
  const times = [];
  for (let i = 0; i < 15; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  samples[name] = { medianMs: times[7], maxMs: times[14] };
}
console.log(JSON.stringify({ diagnostic: "Node static 800-circle state; not browser frame time or complete sync cost",
  entities: wire.entities.length, objects: wire.objects.length, bytes: Buffer.byteLength(JSON.stringify(wire)), samples }, null, 2));
