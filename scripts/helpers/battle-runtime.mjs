import { createTypeScriptLoader } from "./load-typescript.mjs";
export const load = createTypeScriptLoader();
const { BattleRuntime } = load("src/game/battleRuntime.ts");
const { BattleWorld } = load("src/game/battleWorld.ts");
const { createBattleContext } = load("src/game/battleSetup.ts");
const { restoreBattleData } = load("src/game/restoreBattleData.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { DIFFICULTY_VERSION } = load("src/config.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { encodeBattleWireGraph, decodeBattleWireGraph } = load("src/game/battleWireGraph.ts");
export const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
export const { battleChecksum } = load("src/game/battleChecksum.ts");

export function createRuntime(levelId = "1-9", cards = ["A", "B", "X"], seed = 178) {
  return runtimeFromOptions({
    version: BATTLE_RULES_VERSION, seed, levelId, difficulty: 3, difficultyVersion: DIFFICULTY_VERSION,
    unlimitedFirepower: false, selectedCards: cards, debug: false
  });
}
export function runtimeFromOptions(options, worldOptions, observers) {
  const context = createBattleContext(options), session = context.session;
  const world = worldOptions ? new BattleWorld(worldOptions, session.random, options.selectedCards.map(getCardDefinition)) : context.world;
  return new BattleRuntime(world, session, {}, observers);
}
export function step(runtime, ticks = 1) {
  for (let tick = 0; tick < ticks; tick++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
}
export function cloneCheckpoint(runtime, options = runtime.session.exportReplay(), wire = false) {
  let graph = captureBattleSnapshot(runtime.snapshot(options.selectedCards[0]));
  if (wire) graph = decodeBattleWireGraph(JSON.parse(JSON.stringify(encodeBattleWireGraph(graph))));
  const state = restoreBattleData(graph);
  const restored = runtimeFromOptions(options, runtime.world.options);
  restored.restore(state);
  return restored;
}
export function place(runtime, card, lane, column) {
  runtime.world.loadout.byId.get(card).readyAt = 0;
  const result = runtime.executeOperation("local", { type: "deploy", card, cell: { lane, column }, expected: null });
  if (result !== "deployed") throw Error("Deployment failed: " + result + " " + card);
  return runtime.world.towers.find(tower => tower.type === card && tower.lane === lane && tower.column === column);
}
