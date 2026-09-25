import * as battleMath from "./battleMath";
import { BOARD_Y, CELL_HEIGHT, LANES } from "../config";
import type { EnemyState as Enemy } from "./enemyState";

export const OSCILLATION_PERIOD = 4;
export const OSCILLATION_AMPLITUDE = CELL_HEIGHT * 0.6;

export function relocateEnemyToLane(enemy: Enemy, lane: number, y: number) {
  enemy.lane = lane;
  enemy.y = y;
  if (enemy.oscillationCenterY !== undefined) {
    enemy.oscillationCenterY = y;
    enemy.oscillationLastY = y;
    enemy.oscillationPhase = 0;
  }
}

export function oscillationTarget(enemy: Enemy, seconds: number) {
  if (enemy.oscillationCenterY === undefined) return { y: enemy.y, phase: 0 };
  // Teleports move the path's center instead of snapping the unit back on its next tick.
  enemy.oscillationCenterY += enemy.y - (enemy.oscillationLastY ?? enemy.y);
  const phase = (enemy.oscillationPhase ?? 0) + seconds * Math.PI * 2 / OSCILLATION_PERIOD;
  return { y: enemy.oscillationCenterY + OSCILLATION_AMPLITUDE * battleMath.sin(phase), phase };
}

export function commitOscillation(enemy: Enemy, y: number, phase: number) {
  enemy.y = y;
  enemy.oscillationPhase = phase % (Math.PI * 2);
  enemy.oscillationLastY = y;
  enemy.lane = Math.max(0, Math.min(LANES - 1, Math.floor((y - BOARD_Y) / CELL_HEIGHT)));
}

export function segmentBoxHitTime(x: number, y: number, dx: number, dy: number, halfWidth: number, halfHeight: number) {
  let enter = 0, exit = 1;
  if (dx === 0) {
    if (Math.abs(x) > halfWidth) return Infinity;
  } else {
    const a = (-halfWidth - x) / dx, b = (halfWidth - x) / dx;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
  }
  if (dy === 0) {
    if (Math.abs(y) > halfHeight) return Infinity;
  } else {
    const a = (-halfHeight - y) / dy, b = (halfHeight - y) / dy;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
  }
  return enter <= exit ? enter : Infinity;
}
