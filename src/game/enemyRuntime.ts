import { spawnSplitEnemies as spawnEnemySplits } from "./enemySplitRules";
import { releaseBurrowCargo as releaseCargo } from "./enemyReleaseRules";
import { enemyReleasePresentation } from "../render/enemyRelease";
import { enemySimulationRuntime } from "../render/enemySimulation";
import { advanceEnemies as advanceEnemySimulation, executeEnemyAttack as executeAttack } from "./enemySimulation";
import { addEnemyToField } from "./enemyRoster";
import { battleRandom } from "./battleSimulation";
import type { EnemyAttackAction } from "./battleActions";
import type { Enemy, WaveTracker } from "../types";
import type { EnemyAdvanceRuntime, EnemySpawnRuntime } from "./combatRuntime";
import { syncEnemyVisualScale } from "./enemyBehaviors";
import { createEnemy } from "./enemyFactory";
import { initializeEnemyHealthLinks } from "./enemyHealth";
import { spawnBattleWave, type EnemySpawnOptions, type WaveSpawnRequest } from "./waveSpawner";

export function spawnEnemyAt(runtime: EnemySpawnRuntime, options: EnemySpawnOptions) {
  const enemy = createEnemy(runtime.scene, { ...options, environmentHpMultiplier: runtime.enemyHpMultiplier?.() });
  addEnemyToField(runtime.enemies, enemy);
  initializeEnemyHealthLinks(enemy, runtime.enemies);
  for (const member of enemy.healthPool?.members ?? []) syncEnemyVisualScale(member);
  return options.waveWeight;
}

export function spawnWaveEnemies(runtime: EnemySpawnRuntime, options: WaveSpawnRequest): WaveTracker {
  return spawnBattleWave(options, battleRandom(runtime.scene), spawn => spawnEnemyAt(runtime, spawn));
}

export function spawnSplitEnemies(runtime: EnemySpawnRuntime, enemy: Enemy, time: number, reduction: number) {
  spawnEnemySplits(options => { spawnEnemyAt(runtime, options); }, enemy, time, reduction);
}


export function advanceEnemies(runtime: EnemyAdvanceRuntime, time: number, seconds: number) {
  advanceEnemySimulation(enemySimulationRuntime(runtime), time, seconds);
}

export function executeEnemyAttack(runtime: EnemyAdvanceRuntime, action: EnemyAttackAction) {
  executeAttack(enemySimulationRuntime(runtime), action);
}

export function releaseBurrowCargo(runtime: EnemySpawnRuntime, carrier: Enemy,
  options: { reverseDirection?: boolean } = {}) {
  releaseCargo({ enemies: runtime.enemies, presentation: enemyReleasePresentation }, carrier, options);
}
