import type { BattleSaveState } from "./battleSaveState";
import { captureBattleSnapshot } from "./captureBattleSnapshot";

export function battleChecksum(state: BattleSaveState) {
  // Normalize presentation state without mutating a checkpoint supplied by the caller.
  const graph = captureBattleSnapshot({
    ...state,
    simulation: state.simulation ? { ...state.simulation, clock: { ...state.simulation.clock, remainder: 0 } } : undefined,
    gameSpeed: 1
  });
  for (const node of graph.nodes) {
    if (node.kind === "boss") for (const key of ["rotationX", "rotationY", "rotationZ", "velocityX", "velocityY", "velocityZ",
      "targetVelocityX", "targetVelocityY", "targetVelocityZ", "nextTurnIn"]) delete node.data[key];
  }
  let hash = 2166136261;
  const text = JSON.stringify(graph);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
