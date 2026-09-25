// Synthetic initial board; all subsequent attacks, routing and damage use live rules.
export const PRESSURE_CARDS = ["E", "0", "1", "=", "!", "+", "-", "*", "/", "O"];

export function populatePipelinePressure(runtime, { config, BATTLE_STEP_MS, upgradeTowerLevel, applyTowerUpgradeStats, getCardDefinition }, mortars = 0) {
  runtime.world.chars = 10000000;
  runtime.session.controls.autoUpgradeEnabled = false;
  const place = (card, lane, column, level = 1) => {
    runtime.world.loadout.byId.get(card).readyAt = 0;
    const result = runtime.executeOperation("local", { type: "deploy", card, cell: { lane, column }, expected: null });
    if (result !== "deployed") throw Error(`Pressure deployment ${card}: ${result}`);
    const tower = runtime.world.towers.find(t => t.lane === lane && t.column === column);
    if (level > 1) applyTowerUpgradeStats(tower, getCardDefinition(card), upgradeTowerLevel(tower, level - 1), runtime.world.battleTime);
    return tower;
  };
  const closedEdges = [];
  for (let lane = 0; lane < config.LANES; lane++) {
    const source = place("E", lane, 0, 60);
    place("0", lane, 2); place("0", lane, 4);
    place("0", lane, 6);
    place(mortars ? ["+", "-", "*", "/", "*", "+", "-"][lane] : "1", lane, 8, mortars ? 1 : 10);
    runtime.world.loadout.byId.get("!").readyAt = 0;
    const attached = runtime.executeOperation("local", { type: "effect", card: "!", cell: { lane, column: 0 },
      target: { kind: "tower", id: source.entityId } });
    if (attached !== "handled") throw Error(`Pressure attachment: ${attached}`);
    // Let the attachment resolve before wiring it into a network that could route it elsewhere.
    for (let tick = 0; tick < 3; tick++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
    if (!source.continuousAttack) throw Error("Pressure source did not receive continuous fire");
    for (let column = 0; column < 8; column++) {
      runtime.world.loadout.byId.get("=").readyAt = 0;
      const result = runtime.executeOperation("local", { type: "edgeCard", card: "=",
        position: { axis: "horizontal", lane, column }, expected: null });
      if (result !== "handled") throw Error(`Pressure edge: ${result}`);
      const edge = runtime.world.edgeTowers.at(-1);
      // Banks can backflow freely; closing only the final link forces storage saturation.
      if (column === 7 && !mortars) {
        edge.mode = "!="; closedEdges.push(edge.entityId);
      }
    }
  }
  // Real upgraded defenders, not immortal units or patched damage functions.
  for (let lane = 0; lane < config.LANES; lane++) place("O", lane, mortars ? 9 : 10, 1400);
  runtime.circuit.sync();
  for (let i = 0; i < mortars; i++) runtime.spawnEnemy({ kind: i % 2 ? "pentagon3" : "mortarTriangle3",
    lane: i % config.LANES, x: config.BOARD_X + config.CELL_WIDTH * (11.2 + (i % 4) * .1),
    time: runtime.world.battleTime, waveNumber: 1, waveWeight: 0, finalDamageReduction: 0 });
  return { closedEdges };
}

export function pipelinePressureCensus(runtime) {
  const world = runtime.world;
  let stored = 0, fullBanks = 0;
  for (const tower of world.towers) {
    const count = (tower.projectileBank?.shots.length ?? 0) + (tower.projectileNode?.input.length ?? 0);
    stored += count;
    if (tower.type === "0" && count === 128) fullBanks++;
  }
  return { tick: runtime.session.clock.tick, towers: world.towers.length, enemies: world.enemies.length,
    stored, fullBanks, mortars: world.mortarProjectiles.length, projectiles: world.projectiles.length,
    actions: runtime.session.actions.snapshot().length, gameOver: world.gameOver };
}
