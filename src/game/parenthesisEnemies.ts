import type { Enemy } from "../types";
import { collectParenthesisPassengers as collect, type EnemyPositions, type ParenthesisPresentation } from "./parenthesisRules";
import { releaseParenthesisPassengers as releasePassengers } from "./enemyReleaseRules";
import { enemyReleasePresentation } from "../render/enemyRelease";
import { syncParenthesisVisual } from "../render/parenthesisEnemy";
import { syncEnemyPositionVisual } from "../render/enemyStatus";
export { passengerMovementStatus, type EnemyPositions } from "./parenthesisRules";

const presentation: ParenthesisPresentation = {
  carrier: enemy => syncParenthesisVisual(enemy as Enemy),
  position: enemy => syncEnemyPositionVisual(enemy as Enemy)
};
export function collectParenthesisPassengers(carrier: Enemy, enemies: Enemy[], time: number, previous?: EnemyPositions) {
  collect(carrier, enemies, time, presentation, previous);
}
export function releaseParenthesisPassengers(carrier: Enemy, enemies: Enemy[], time: number) {
  releasePassengers(carrier, enemies, time, enemyReleasePresentation);
}
