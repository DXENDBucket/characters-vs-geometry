// Frozen pre-protocol-2 diagnostic only. Historical behavior fixtures retain their
// old hashes; all live synchronization and continuation checks use battleChecksum.
export function legacyBattleChecksum(capture, state, options = {}) {
  const graph = capture({ ...state,
    simulation: state.simulation ? { ...state.simulation, clock: { ...state.simulation.clock, remainder: 0 } } : undefined,
    gameSpeed: 1
  }, options);
  if (!options.includeLocalUi && graph.root && typeof graph.root === "object" && "ref" in graph.root) {
    delete graph.nodes[graph.root.ref].data.selectedCardId;
  }
  for (const node of graph.nodes) if (node.kind === "boss") {
    for (const key of ["rotationX", "rotationY", "rotationZ", "velocityX", "velocityY", "velocityZ",
      "targetVelocityX", "targetVelocityY", "targetVelocityZ", "nextTurnIn"]) delete node.data[key];
  }
  let hash = 2166136261;
  // The old JSON codec lost negative zero. Keep that behavior only in this diagnostic.
  const text = JSON.stringify(graph, (_key, value) => value && typeof value === "object" &&
    Object.keys(value).length === 1 && value.number === "-0" ? 0 : value);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
