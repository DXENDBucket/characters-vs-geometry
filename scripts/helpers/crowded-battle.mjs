// Synthetic mixed combat, using real deployment, spawning and simulation rules.
// Fixture preparation is deliberately outside all timed sections.
export function populateCrowdedBattle(runtime, count, { BOARD_X, CELL_WIDTH }) {
  runtime.world.chars = 100000;
  runtime.session.controls.autoUpgradeEnabled = false;
  const place = (card, lane, column) => {
    runtime.world.loadout.byId.get(card).readyAt = 0;
    const result = runtime.executeOperation("local", { type: "deploy", card, cell: { lane, column }, expected: null });
    if (result !== "deployed") throw Error(`Fixture deployment: ${card}: ${result}`);
  };
  for (let lane = 0; lane < 7; lane++) {
    place("E", lane, 1);
    place("x", lane, 5);
    place("B", lane, 7);
  }
  place("u", 3, 6); place("e", 2, 6);
  for (const lane of [0, 6]) {
    place("0", lane, 2); place("1", lane, 4);
    for (let column = 1; column < 4; column++) {
      runtime.world.loadout.byId.get("=").readyAt = 0;
      const result = runtime.executeOperation("local", { type: "edgeCard", card: "=",
        position: { axis: "horizontal", lane, column }, expected: null });
      if (result !== "handled") throw Error(`Fixture edge: ${result}`);
    }
  }
  const kinds = ["circle4", "triangle3", "diamond3", "shootingTriangle3", "equals3", "parentheses3",
    "angelPentagon3", "hexSpellBulwark3", "chevronLeader", "heart3", "tilde3", "archangelHeptagon3", "mortarTriangle3"];
  for (let i = 0; i < count; i++) runtime.spawnEnemy({ kind: kinds[i % kinds.length],
    lane: Math.floor(i / kinds.length) % 6, x: BOARD_X + CELL_WIDTH * (8 + (i % 40) / 20), time: runtime.world.battleTime,
    waveNumber: 1, waveWeight: 0, finalDamageReduction: 0 });
}

export const CROWDED_CARDS = ["E", "x", "B", "u", "e", "0", "1", "="];

export function crowdedCensus(runtime) {
  const world = runtime.world;
  return { towers: world.towers.length, enemies: world.enemies.length, edges: world.edgeTowers.length,
    projectiles: world.projectiles.length, enemyProjectiles: world.enemyProjectiles.length,
    mortars: world.mortarProjectiles.length, boss: world.boss?.kind ?? null,
    passengers: world.enemies.reduce((sum, enemy) => sum + (enemy.parenthesisCargo?.length ?? 0), 0),
    bankedShots: world.towers.reduce((sum, tower) => sum + (tower.projectileBank?.shots.length ?? 0), 0),
    tick: runtime.session.clock.tick, gameOver: world.gameOver };
}
