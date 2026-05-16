import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import type { Tower } from "../types";

const SLOW_AURA_MULTIPLIER = 1 / 6;
const SLOW_AURA_RADIUS_CELLS = 2;

export function movementSpeedMultiplier(towers: Tower[], x: number, y: number) {
  return towers.some((tower) => tower.type === "T" && isPointInSlowAura(tower, x, y))
    ? SLOW_AURA_MULTIPLIER
    : 1;
}

export function isPointInSlowAura(tower: Tower, x: number, y: number) {
  const column = Math.floor((x - BOARD_X) / CELL_WIDTH);
  const lane = Math.floor((y - BOARD_Y) / CELL_HEIGHT);
  if (column < 0 || column >= COLUMNS || lane < 0 || lane >= LANES) {
    return false;
  }

  const columnDelta = Math.abs(column - tower.column);
  const laneDelta = Math.abs(lane - tower.lane);
  const inFiveByFive = columnDelta <= SLOW_AURA_RADIUS_CELLS && laneDelta <= SLOW_AURA_RADIUS_CELLS;
  const isCorner = columnDelta === SLOW_AURA_RADIUS_CELLS && laneDelta === SLOW_AURA_RADIUS_CELLS;
  return inFiveByFive && !isCorner;
}
