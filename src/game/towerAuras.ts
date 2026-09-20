import { COLUMNS, LANES } from "../config";
import { towerBehaviorType } from "./towerIdentity";
import type { Tower } from "../types";
import { isPointInSlowAura } from "./slowAura";

const ZEAL_ATTACK_SPEED_MULTIPLIER = 1.35;
const ZEAL_RADIUS_CELLS = 2;
const BOARD_CELL_COUNT = COLUMNS * LANES;
const UNYIELDING_PERCENT_PER_LEVEL = 15;
const unyieldingCells = new Float64Array(BOARD_CELL_COUNT);

export function isInCentered3x3Aura(source: Tower, target: Tower) {
  const dc = Math.abs(source.column - target.column);
  const dl = Math.abs(source.lane - target.lane);
  return dc <= 1 && dl <= 1;
}

export function syncUnyieldingAuras(towers: Tower[]) {
  unyieldingCells.fill(0);
  for (const tower of towers) {
    if (!tower.inPlay || tower.transient || towerBehaviorType(tower) !== "g") continue;
    const strength = Math.max(1, tower.level + tower.levelBonus + tower.mirrorLevelBonus) * UNYIELDING_PERCENT_PER_LEVEL / 100;
    for (let dl = -1; dl <= 1; dl++) {
      for (let dc = -1; dc <= 1; dc++) {
        const lane = tower.lane + dl;
        const column = tower.column + dc;
        if (lane < 0 || lane >= LANES || column < 0 || column >= COLUMNS) continue;
        const index = cellIndex(column, lane);
        unyieldingCells[index] = Math.max(unyieldingCells[index], strength);
      }
    }
  }
  for (const tower of towers) {
    tower.unyieldingRatio = tower.inPlay && !tower.transient
      ? unyieldingCells[cellIndex(tower.column, tower.lane)] ?? 0
      : 0;
  }
}

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
  return towerBehaviorType(tower) === "e" && !tower.transient && tower.inPlay;
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
