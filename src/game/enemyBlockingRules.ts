import { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT, COLUMNS, LANES } from "../config";
import type { TowerState as Tower } from "./towerState";
import type { EnemyState as Enemy } from "./enemyState";
import { towerAreaTargets, towerDamageReceiver } from "./towerOccupancy";
import { parenthesisHalfSpan } from "./enemyContainerRules";
import { enemyIsBossCompanion } from "../registry/enemies";
import { enemyIsBurrowed, enemyIsHighFlying } from "./enemyCombatRules";
import { enemyIsSolarBomb } from "./enemyIdentity";
import { hasStatusEffectName } from "./rules/statusEffectRules";
import { towerIsFlying } from "./towerRules";
import { segmentBoxHitTime } from "./oscillatingMovement";
import { gridCellKey } from "./boardCells";

const TOWER_BLOCK_RADIUS = 38;

export function getBlockingTower<T extends Tower>(towers: T[], enemy: Enemy) {
  if (!enemyCanBeBlocked(enemy)) {
    return undefined;
  }

  const enemyFlying = hasStatusEffectName(enemy, "flying");
  let blockingTower: T | undefined;
  for (const candidate of towerAreaTargets(towers)) {
    const tower = blockingLayer(candidate, enemyFlying);
    if (!towerCanBlockEnemy(tower, enemy, enemyFlying)) {
      continue;
    }

    if (!blockingTower || tower.x > blockingTower.x) {
      blockingTower = tower;
    }
  }
  return blockingTower;
}

export function getBlockingTowerFromOccupied<T extends Tower>(occupied: Map<string, T>, enemy: Enemy) {
  if (enemy.oscillationCenterY !== undefined) return sweptOscillatingBlocker(occupied, enemy, enemy.x, enemy.y)?.tower;
  if (!enemyCanBeBlocked(enemy)) {
    return undefined;
  }

  const enemyFlying = hasStatusEffectName(enemy, "flying");
  const centerColumn = Math.round((enemy.x - BOARD_X - CELL_WIDTH / 2) / CELL_WIDTH);
  const columnRadius = 1 + Math.ceil(parenthesisHalfSpan(enemy) / CELL_WIDTH);
  let blockingTower: T | undefined;
  for (let column = centerColumn + columnRadius; column >= centerColumn - columnRadius; column -= 1) {
    if (column < 0 || column >= COLUMNS) {
      continue;
    }

    const tower = blockingLayer(occupied.get(gridCellKey(enemy.lane, column)), enemyFlying);
    if (!tower || !towerCanBlockEnemy(tower, enemy, enemyFlying)) {
      continue;
    }

    if (!blockingTower || tower.x > blockingTower.x) {
      blockingTower = tower;
    }
  }
  return blockingTower;
}

export function getSweptBlockingTowerFromOccupied<T extends Tower>(occupied: Map<string, T>, enemy: Enemy, nextX: number, nextY = enemy.y) {
  if (enemy.oscillationCenterY !== undefined) return sweptOscillatingBlocker(occupied, enemy, nextX, nextY);
  if (!enemyCanBeBlocked(enemy) || nextX === enemy.x) return undefined;
  const direction = nextX < enemy.x ? -1 : 1;
  const left = Math.min(enemy.x, nextX);
  const right = Math.max(enemy.x, nextX);
  const blockRadius = TOWER_BLOCK_RADIUS + parenthesisHalfSpan(enemy);
  const firstColumn = Math.max(0, Math.ceil((left - blockRadius - BOARD_X - CELL_WIDTH / 2) / CELL_WIDTH));
  const lastColumn = Math.min(COLUMNS - 1, Math.floor((right + blockRadius - BOARD_X - CELL_WIDTH / 2) / CELL_WIDTH));
  const enemyFlying = hasStatusEffectName(enemy, "flying");
  // Scan in travel order, bounded by the board width rather than the enemy's speed.
  for (let column = direction < 0 ? lastColumn : firstColumn;
    direction < 0 ? column >= firstColumn : column <= lastColumn; column += direction) {
    const tower = blockingLayer(occupied.get(gridCellKey(enemy.lane, column)), enemyFlying);
    if (!tower || !towerCanBlockEnemy(tower, enemy, enemyFlying, false)) continue;
    const entryX = tower.x - direction * blockRadius;
    const x = direction < 0 ? Math.min(enemy.x, entryX) : Math.max(enemy.x, entryX);
    if (x >= left && x <= right) return { tower, x, y: enemy.y, fraction: (x - enemy.x) / (nextX - enemy.x) };
  }
  return undefined;
}

function enemyCanBeBlocked(enemy: Enemy) {
  return !enemy.parenthesisCarrier && !(enemyIsBossCompanion(enemy.kind) || enemyIsBurrowed(enemy) || enemyIsHighFlying(enemy) || enemyIsSolarBomb(enemy));
}

function sweptOscillatingBlocker<T extends Tower>(occupied: Map<string, T>, enemy: Enemy, nextX: number, nextY: number) {
  if (!enemyCanBeBlocked(enemy)) return undefined;
  const dx = nextX - enemy.x, dy = nextY - enemy.y;
  const firstColumn = Math.max(0, Math.ceil((Math.min(enemy.x, nextX) - TOWER_BLOCK_RADIUS - BOARD_X - CELL_WIDTH / 2) / CELL_WIDTH));
  const lastColumn = Math.min(COLUMNS - 1, Math.floor((Math.max(enemy.x, nextX) + TOWER_BLOCK_RADIUS - BOARD_X - CELL_WIDTH / 2) / CELL_WIDTH));
  const firstLane = Math.max(0, Math.ceil((Math.min(enemy.y, nextY) - BOARD_Y) / CELL_HEIGHT) - 1);
  const lastLane = Math.min(LANES - 1, Math.floor((Math.max(enemy.y, nextY) - BOARD_Y) / CELL_HEIGHT));
  const flying = hasStatusEffectName(enemy, "flying");
  let hit: T | undefined, fraction = Infinity;
  for (let lane = firstLane; lane <= lastLane; lane++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const tower = blockingLayer(occupied.get(gridCellKey(lane, column)), flying);
      if (!tower?.inPlay || tower.transient || towerIsFlying(tower) !== flying) continue;
      const time = segmentBoxHitTime(enemy.x - tower.x, enemy.y - tower.y, dx, dy, TOWER_BLOCK_RADIUS, CELL_HEIGHT / 2);
      if (time < fraction) { hit = tower; fraction = time; }
    }
  }
  return hit ? { tower: hit, x: enemy.x + dx * fraction, y: enemy.y + dy * fraction, fraction } : undefined;
}

function blockingLayer<T extends Tower>(tower: T, flying: boolean): T;
function blockingLayer<T extends Tower>(tower: T | undefined, flying: boolean): T | undefined;
function blockingLayer<T extends Tower>(tower: T | undefined, flying: boolean) {
  if (!tower || towerIsFlying(tower) === flying) return tower;
  return towerDamageReceiver(tower) as T;
}

function towerCanBlockEnemy(tower: Tower, enemy: Enemy, enemyFlying: boolean, checkPosition = true) {
  return (
    tower.inPlay &&
    !tower.transient &&
    (enemy.oscillationCenterY !== undefined ? Math.abs(tower.y - enemy.y) <= CELL_HEIGHT / 2 : tower.lane === enemy.lane) &&
    (!checkPosition || Math.abs(enemy.x - tower.x) <= TOWER_BLOCK_RADIUS + parenthesisHalfSpan(enemy)) &&
    !(enemyFlying ? !towerIsFlying(tower) : towerIsFlying(tower))
  );
}

export function latestPlacedTower<T extends Tower>(towers: readonly T[]) {
  let latest: T | undefined;
  for (const tower of towers) {
    if (!latest || tower.placedOrder > latest.placedOrder) {
      latest = tower;
    }
  }
  return latest;
}

export function latestPlacedTowers<T extends Tower>(towers: readonly T[], count: number) {
  if (count <= 0) {
    return [];
  }

  const latest: T[] = [];
  for (const tower of towers) {
    let insertAt = latest.length;
    while (insertAt > 0 && tower.placedOrder > latest[insertAt - 1].placedOrder) {
      insertAt -= 1;
    }

    if (insertAt >= count) {
      continue;
    }

    latest.splice(insertAt, 0, tower);
    if (latest.length > count) {
      latest.pop();
    }
  }
  return latest;
}
