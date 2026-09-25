import type { Enemy, Tower } from "../types";
import type { EnemyAdvanceRuntime } from "./combatRuntime";
import { enemySimulationRuntime, enemySimulationPresentation } from "../render/enemySimulation";
import { advanceHighFlyingEnemy as advanceFlight, advanceSlopeTriangle as advanceSlope } from "./slopeRules";

export function advanceHighFlyingEnemy(enemy: Enemy, time: number) {
  return advanceFlight(enemy, time, enemySimulationPresentation(enemy.body.scene));
}

export function advanceSlopeTriangle(runtime: EnemyAdvanceRuntime, enemy: Enemy, blocker: Tower | undefined, time: number) {
  return advanceSlope(enemySimulationRuntime(runtime), enemy, blocker, time);
}
