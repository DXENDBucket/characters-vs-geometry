import { COLUMNS, LANES } from "../config";
import type { Tower } from "../types";
import { isPointInSlowAura } from "./slowAura";

const ZEAL_ATTACK_SPEED_MULTIPLIER = 1.35;
const ZEAL_RADIUS_CELLS = 2;
const BOARD_CELL_COUNT = COLUMNS * LANES;

export interface TowerAuraSources {
  zealCells: Uint8Array;
  hasZeal: boolean;
}

const towerAuraSourcesBuffer: TowerAuraSources = {
  zealCells: new Uint8Array(BOARD_CELL_COUNT),
  hasZeal: false
};

export function towerAuraSources(towers: Tower[]): TowerAuraSources {
  towerAuraSourcesBuffer.hasZeal = false;
  for (const tower of towers) {
    if (isZealSource(tower)) {
      if (!towerAuraSourcesBuffer.hasZeal) {
        towerAuraSourcesBuffer.hasZeal = true;
        towerAuraSourcesBuffer.zealCells.fill(0);
      }
      markZealCells(towerAuraSourcesBuffer.zealCells, tower);
    }
  }
  return towerAuraSourcesBuffer;
}

export function towerZealAttackSpeedMultiplier(towers: Tower[] | undefined, target: Tower, sources?: TowerAuraSources) {
  return towerHasZeal(towers, target, sources) ? ZEAL_ATTACK_SPEED_MULTIPLIER : 1;
}

export function towerHasZeal(towers: Tower[] | undefined, target: Tower, sources?: TowerAuraSources) {
  if (sources) {
    if (!sources.hasZeal) {
      return false;
    }

    return sources.zealCells[cellIndex(target.column, target.lane)] !== 0;
  }

  if (!towers) {
    return false;
  }

  for (const tower of towers) {
    if (isZealSource(tower) && isPointInSlowAura(tower, target.x, target.y)) {
      return true;
    }
  }
  return false;
}

function isZealSource(tower: Tower) {
  return tower.type === "e" && !tower.transient && tower.inPlay;
}

function markZealCells(zealCells: Uint8Array, tower: Tower) {
  const minColumn = Math.max(0, tower.column - ZEAL_RADIUS_CELLS);
  const maxColumn = Math.min(COLUMNS - 1, tower.column + ZEAL_RADIUS_CELLS);
  const minLane = Math.max(0, tower.lane - ZEAL_RADIUS_CELLS);
  const maxLane = Math.min(LANES - 1, tower.lane + ZEAL_RADIUS_CELLS);

  for (let lane = minLane; lane <= maxLane; lane += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if (cellIsInZealAura(tower, column, lane)) {
        zealCells[cellIndex(column, lane)] = 1;
      }
    }
  }
}

function cellIsInZealAura(tower: Tower, column: number, lane: number) {
  const columnDelta = Math.abs(column - tower.column);
  const laneDelta = Math.abs(lane - tower.lane);
  const inFiveByFive = columnDelta <= ZEAL_RADIUS_CELLS && laneDelta <= ZEAL_RADIUS_CELLS;
  const isCorner = columnDelta === ZEAL_RADIUS_CELLS && laneDelta === ZEAL_RADIUS_CELLS;
  return inFiveByFive && !isCorner;
}

function cellIndex(column: number, lane: number) {
  return lane * COLUMNS + column;
}
