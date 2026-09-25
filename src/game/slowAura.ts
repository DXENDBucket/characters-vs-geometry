import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import type { TowerState as Tower } from "./towerState";
import { towerFormType } from "./towerIdentity";

const SLOW_AURA_MULTIPLIER = 1 / 6;
const SLOW_AURA_RADIUS_CELLS = 2;
const BOARD_CELL_COUNT = COLUMNS * LANES;

export interface SlowAuraSources {
  towers: Tower[];
  auraTowers: Tower[];
  slowCells: Uint8Array;
  hasAura: boolean;
}

interface SlowAuraCache {
  sources: SlowAuraSources;
  active: Tower[];
  ids: string[];
  lanes: number[];
  columns: number[];
}
const caches = new WeakMap<Tower[], SlowAuraCache>();

function slowAuraCache(towers: Tower[]) {
  let cache = caches.get(towers);
  if (!cache) {
    cache = { sources: { towers, auraTowers: [], slowCells: new Uint8Array(BOARD_CELL_COUNT), hasAura: false },
      active: [], ids: [], lanes: [], columns: [] };
    caches.set(towers, cache);
  }
  return cache;
}

export function slowAuraSources(towers: Tower[]): SlowAuraSources {
  const cache = slowAuraCache(towers), slowAuraSourcesBuffer = cache.sources;
  const activeAuras = activeSlowAuraTowers(towers, cache.active);
  if (slowAuraStateMatches(activeAuras, cache)) {
    return slowAuraSourcesBuffer;
  }

  slowAuraSourcesBuffer.towers = towers;
  slowAuraSourcesBuffer.auraTowers.length = 0;
  slowAuraSourcesBuffer.hasAura = activeAuras.length > 0;
  if (slowAuraSourcesBuffer.hasAura) {
    slowAuraSourcesBuffer.slowCells.fill(0);
  }

  for (const tower of activeAuras) {
    slowAuraSourcesBuffer.auraTowers.push(tower);
    markSlowAuraCells(slowAuraSourcesBuffer.slowCells, tower);
  }
  cacheSlowAuraState(activeAuras, cache);
  return slowAuraSourcesBuffer;
}

function activeSlowAuraTowers(towers: Tower[], activeSlowAuraTowersBuffer: Tower[]) {
  activeSlowAuraTowersBuffer.length = 0;
  for (const tower of towers) {
    if (towerFormType(tower) === "T" && tower.inPlay) {
      activeSlowAuraTowersBuffer.push(tower);
    }
  }
  return activeSlowAuraTowersBuffer;
}

function slowAuraStateMatches(towers: Tower[], cache: SlowAuraCache) {
  const { ids: cachedSlowAuraIds, lanes: cachedSlowAuraLanes, columns: cachedSlowAuraColumns } = cache;
  if (towers.length !== cachedSlowAuraIds.length) {
    return false;
  }

  for (let index = 0; index < towers.length; index += 1) {
    const tower = towers[index];
    if (
      tower.id !== cachedSlowAuraIds[index] ||
      tower.lane !== cachedSlowAuraLanes[index] ||
      tower.column !== cachedSlowAuraColumns[index]
    ) {
      return false;
    }
  }
  return true;
}

function cacheSlowAuraState(towers: Tower[], cache: SlowAuraCache) {
  const { ids: cachedSlowAuraIds, lanes: cachedSlowAuraLanes, columns: cachedSlowAuraColumns } = cache;
  cachedSlowAuraIds.length = towers.length;
  cachedSlowAuraLanes.length = towers.length;
  cachedSlowAuraColumns.length = towers.length;
  for (let index = 0; index < towers.length; index += 1) {
    const tower = towers[index];
    cachedSlowAuraIds[index] = tower.id;
    cachedSlowAuraLanes[index] = tower.lane;
    cachedSlowAuraColumns[index] = tower.column;
  }
}

export function movementSpeedMultiplier(towers: Tower[], x: number, y: number, sources?: SlowAuraSources) {
  if (sources && !sources.hasAura) {
    return 1;
  }

  const column = Math.floor((x - BOARD_X) / CELL_WIDTH);
  const lane = Math.floor((y - BOARD_Y) / CELL_HEIGHT);
  if (!cellIsInBoard(column, lane)) {
    return 1;
  }

  if (sources) {
    return sources.slowCells[cellIndex(column, lane)] ? SLOW_AURA_MULTIPLIER : 1;
  }

  for (const tower of towers) {
    if (towerFormType(tower) === "T" && tower.inPlay && isCellInSlowAura(tower, column, lane)) {
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

export function isCellInSlowAura(tower: Tower, column: number, lane: number) {
  const columnDelta = Math.abs(column - tower.column);
  const laneDelta = Math.abs(lane - tower.lane);
  const inFiveByFive = columnDelta <= SLOW_AURA_RADIUS_CELLS && laneDelta <= SLOW_AURA_RADIUS_CELLS;
  const isCorner = columnDelta === SLOW_AURA_RADIUS_CELLS && laneDelta === SLOW_AURA_RADIUS_CELLS;
  return inFiveByFive && !isCorner;
}
