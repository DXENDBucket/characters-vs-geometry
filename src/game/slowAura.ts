import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import type { Tower } from "../types";

const SLOW_AURA_MULTIPLIER = 1 / 6;
const SLOW_AURA_RADIUS_CELLS = 2;
const BOARD_CELL_COUNT = COLUMNS * LANES;

export interface SlowAuraSources {
  towers: Tower[];
  auraTowers: Tower[];
  slowCells: Uint8Array;
}

const slowAuraSourcesBuffer: SlowAuraSources = {
  towers: [],
  auraTowers: [],
  slowCells: new Uint8Array(BOARD_CELL_COUNT)
};

export function slowAuraSources(towers: Tower[]): SlowAuraSources {
  // Reused per call; consume synchronously before requesting another slow-aura view.
  slowAuraSourcesBuffer.towers = towers;
  slowAuraSourcesBuffer.auraTowers.length = 0;
  slowAuraSourcesBuffer.slowCells.fill(0);
  for (const tower of towers) {
    if (tower.type === "T" && tower.inPlay) {
      slowAuraSourcesBuffer.auraTowers.push(tower);
      markSlowAuraCells(slowAuraSourcesBuffer.slowCells, tower);
    }
  }
  return slowAuraSourcesBuffer;
}

export function movementSpeedMultiplier(towers: Tower[], x: number, y: number, sources?: SlowAuraSources) {
  const column = Math.floor((x - BOARD_X) / CELL_WIDTH);
  const lane = Math.floor((y - BOARD_Y) / CELL_HEIGHT);
  if (!cellIsInBoard(column, lane)) {
    return 1;
  }

  if (sources) {
    return sources.slowCells[cellIndex(column, lane)] ? SLOW_AURA_MULTIPLIER : 1;
  }

  for (const tower of towers) {
    if (tower.type === "T" && tower.inPlay && isCellInSlowAura(tower, column, lane)) {
      return SLOW_AURA_MULTIPLIER;
    }
  }
  return 1;
}

export function isPointInSlowAura(tower: Tower, x: number, y: number) {
  const column = Math.floor((x - BOARD_X) / CELL_WIDTH);
  const lane = Math.floor((y - BOARD_Y) / CELL_HEIGHT);
  if (!cellIsInBoard(column, lane)) {
    return false;
  }

  return isCellInSlowAura(tower, column, lane);
}

function markSlowAuraCells(slowCells: Uint8Array, tower: Tower) {
  const minColumn = Math.max(0, tower.column - SLOW_AURA_RADIUS_CELLS);
  const maxColumn = Math.min(COLUMNS - 1, tower.column + SLOW_AURA_RADIUS_CELLS);
  const minLane = Math.max(0, tower.lane - SLOW_AURA_RADIUS_CELLS);
  const maxLane = Math.min(LANES - 1, tower.lane + SLOW_AURA_RADIUS_CELLS);

  for (let lane = minLane; lane <= maxLane; lane += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if (isCellInSlowAura(tower, column, lane)) {
        slowCells[cellIndex(column, lane)] = 1;
      }
    }
  }
}

function cellIsInBoard(column: number, lane: number) {
  return column >= 0 && column < COLUMNS && lane >= 0 && lane < LANES;
}

function cellIndex(column: number, lane: number) {
  return lane * COLUMNS + column;
}

function isCellInSlowAura(tower: Tower, column: number, lane: number) {
  const columnDelta = Math.abs(column - tower.column);
  const laneDelta = Math.abs(lane - tower.lane);
  const inFiveByFive = columnDelta <= SLOW_AURA_RADIUS_CELLS && laneDelta <= SLOW_AURA_RADIUS_CELLS;
  const isCorner = columnDelta === SLOW_AURA_RADIUS_CELLS && laneDelta === SLOW_AURA_RADIUS_CELLS;
  return inFiveByFive && !isCorner;
}
