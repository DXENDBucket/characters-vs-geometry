import { COLUMNS, LANES } from "../config";
import { towerFormType } from "./towerIdentity";
import type { Tower } from "../types";
import { inFriendlyRange, towerCell } from "./towerTopology";

const ZEAL_ATTACK_SPEED_MULTIPLIER = 1.35;
const ZEAL_RADIUS_CELLS = 2;
const BOARD_CELL_COUNT = COLUMNS * LANES;
const UNYIELDING_PERCENT_PER_LEVEL = 15;
const unyieldingCells = new Float64Array(BOARD_CELL_COUNT);

export function isInCentered3x3Aura(source: Tower, target: Tower) {
  return inFriendlyRange(source, target, 1);
}

export function syncUnyieldingAuras(towers: Tower[]) {
  unyieldingCells.fill(0);
  for (const tower of towers) {
    if (!tower.inPlay || tower.transient || towerFormType(tower) !== "g") continue;
    const strength = Math.max(1, tower.level + tower.levelBonus + tower.mirrorLevelBonus) * UNYIELDING_PERCENT_PER_LEVEL / 100;
    const origin = towerCell(tower);
    for (let dl = -1; dl <= 1; dl++) {
      for (let dc = -1; dc <= 1; dc++) {
        const lane = origin.lane + dl;
        const column = origin.column + dc;
        if (lane < 0 || lane >= LANES || column < 0 || column >= COLUMNS) continue;
        const index = cellIndex(column, lane);
        unyieldingCells[index] = Math.max(unyieldingCells[index], strength);
      }
    }
  }
  for (const tower of towers) {
    tower.unyieldingRatio = tower.inPlay && !tower.transient
      ? unyieldingCells[cellIndex(towerCell(tower).column, towerCell(tower).lane)] ?? 0
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

    return sources.zealCells[cellIndex(towerCell(target).column, towerCell(target).lane)] !== 0;
  }

  if (!towers) {
    return false;
  }

  for (const tower of towers) {
    if (isZealSource(tower) && inFriendlyRange(tower, target, 2, true)) {
      return true;
    }
  }
  return false;
}

function isZealSource(tower: Tower) {
  return towerFormType(tower) === "e" && !tower.transient && tower.inPlay;
}

function markZealCells(zealCells: Uint8Array, tower: Tower) {
  const origin = towerCell(tower);
  const minColumn = Math.max(0, origin.column - ZEAL_RADIUS_CELLS);
  const maxColumn = Math.min(COLUMNS - 1, origin.column + ZEAL_RADIUS_CELLS);
  const minLane = Math.max(0, origin.lane - ZEAL_RADIUS_CELLS);
  const maxLane = Math.min(LANES - 1, origin.lane + ZEAL_RADIUS_CELLS);

  for (let lane = minLane; lane <= maxLane; lane += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if (cellIsInZealAura(tower, column, lane)) {
        zealCells[cellIndex(column, lane)] = 1;
      }
    }
  }
}

function cellIsInZealAura(tower: Tower, column: number, lane: number) {
  const origin = towerCell(tower);
  const columnDelta = Math.abs(column - origin.column);
  const laneDelta = Math.abs(lane - origin.lane);
  const inFiveByFive = columnDelta <= ZEAL_RADIUS_CELLS && laneDelta <= ZEAL_RADIUS_CELLS;
  const isCorner = columnDelta === ZEAL_RADIUS_CELLS && laneDelta === ZEAL_RADIUS_CELLS;
  return inFiveByFive && !isCorner;
}

function cellIndex(column: number, lane: number) {
  return lane * COLUMNS + column;
}
