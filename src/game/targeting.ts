import Phaser from "phaser";
import {
  BOARD_X,
  BOSS_HITBOX_HEIGHT,
  BOSS_HITBOX_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  COLUMNS,
  LANES
} from "../config";
import type { CardDefinition, CubeBoss, Enemy, Tower } from "../types";
import { enemyIsBossCompanion } from "../registry/enemies";
import { enemyIsBurrowed, enemyIsHighFlying } from "./enemyBehaviors";
import { enemyIsSolarBomb } from "./solarBomb";
import { getCardAttackArea, type AttackAreaConfig } from "./cardAttackConfigs";
import { hasStatusEffectName } from "./statusEffects";
import { towerFacingDirection, towerIsFlying } from "./towers";
import { towerFinalStats } from "./unitStats";

interface AttackTargetQuery {
  area: AttackAreaConfig;
  direction: number;
  range: AttackRangeBounds;
  towerY: number;
}

interface AttackRangeBounds {
  left: number;
  right: number;
}

export interface RectBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const GRID_CELL_KEYS: string[][] = [];
for (let lane = 0; lane < LANES; lane += 1) {
  const row: string[] = [];
  for (let column = 0; column < COLUMNS; column += 1) {
    row.push(`${lane}:${column}`);
  }
  GRID_CELL_KEYS.push(row);
}

export function gridCellKey(lane: number, column: number) {
  return GRID_CELL_KEYS[lane]?.[column] ?? `${lane}:${column}`;
}

export function bossBounds(boss: CubeBoss): RectBounds {
  const width = boss.hitboxWidth ?? BOSS_HITBOX_WIDTH;
  const height = boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT;
  return {
    left: boss.x - width / 2,
    right: boss.x + width / 2,
    top: boss.y - height / 2,
    bottom: boss.y + height / 2
  };
}

export function bossRect(boss: CubeBoss) {
  const bounds = bossBounds(boss);
  return new Phaser.Geom.Rectangle(
    bounds.left,
    bounds.top,
    bounds.right - bounds.left,
    bounds.bottom - bounds.top
  );
}

export function bossParts(boss: CubeBoss | null) {
  return boss ? [boss, ...(boss.octahedronCopies ?? [])] : [];
}

export function findBossPart(boss: CubeBoss | null, predicate: (part: CubeBoss) => boolean) {
  if (!boss) {
    return undefined;
  }

  if (predicate(boss)) {
    return boss;
  }

  for (const part of boss.octahedronCopies ?? []) {
    if (predicate(part)) {
      return part;
    }
  }

  return undefined;
}

export function forEachBossPart(boss: CubeBoss | null, visit: (part: CubeBoss) => void) {
  if (!boss) {
    return;
  }

  visit(boss);
  for (const part of boss.octahedronCopies ?? []) {
    visit(part);
  }
}

export function towerBounds(tower: Tower): RectBounds {
  return {
    left: tower.x - CELL_WIDTH / 2,
    right: tower.x + CELL_WIDTH / 2,
    top: tower.y - CELL_HEIGHT / 2,
    bottom: tower.y + CELL_HEIGHT / 2
  };
}

export function towerRect(tower: Tower) {
  const bounds = towerBounds(tower);
  return new Phaser.Geom.Rectangle(bounds.left, bounds.top, CELL_WIDTH, CELL_HEIGHT);
}

export function pointInBounds(bounds: RectBounds, x: number, y: number) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

export function pointInTowerBounds(tower: Tower, x: number, y: number) {
  return (
    x >= tower.x - CELL_WIDTH / 2 &&
    x <= tower.x + CELL_WIDTH / 2 &&
    y >= tower.y - CELL_HEIGHT / 2 &&
    y <= tower.y + CELL_HEIGHT / 2
  );
}

export function pointInBossBounds(boss: CubeBoss, x: number, y: number) {
  const width = boss.hitboxWidth ?? BOSS_HITBOX_WIDTH;
  const height = boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT;
  return (
    x >= boss.x - width / 2 &&
    x <= boss.x + width / 2 &&
    y >= boss.y - height / 2 &&
    y <= boss.y + height / 2
  );
}

export function bossPartDistanceSqToPoint(boss: CubeBoss, x: number, y: number) {
  const halfWidth = (boss.hitboxWidth ?? BOSS_HITBOX_WIDTH) / 2;
  const halfHeight = (boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT) / 2;
  const closestX = Phaser.Math.Clamp(x, boss.x - halfWidth, boss.x + halfWidth);
  const closestY = Phaser.Math.Clamp(y, boss.y - halfHeight, boss.y + halfHeight);
  return distanceSq(x, y, closestX, closestY);
}

export function clampXToBossPart(boss: CubeBoss, x: number) {
  const halfWidth = (boss.hitboxWidth ?? BOSS_HITBOX_WIDTH) / 2;
  return Phaser.Math.Clamp(x, boss.x - halfWidth, boss.x + halfWidth);
}

export function clampYToBossPart(boss: CubeBoss, y: number) {
  const halfHeight = (boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT) / 2;
  return Phaser.Math.Clamp(y, boss.y - halfHeight, boss.y + halfHeight);
}

export function bossPartIntersectsRect(boss: CubeBoss, left: number, right: number, top: number, bottom: number) {
  const halfWidth = (boss.hitboxWidth ?? BOSS_HITBOX_WIDTH) / 2;
  const halfHeight = (boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT) / 2;
  return (
    boss.x - halfWidth <= right &&
    boss.x + halfWidth >= left &&
    boss.y - halfHeight <= bottom &&
    boss.y + halfHeight >= top
  );
}

export function rectBoundsIntersect(a: RectBounds, b: RectBounds) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function towerIntersectsBoss(tower: Tower, boss: CubeBoss) {
  const bossWidth = boss.hitboxWidth ?? BOSS_HITBOX_WIDTH;
  const bossHeight = boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT;
  return (
    tower.x - CELL_WIDTH / 2 <= boss.x + bossWidth / 2 &&
    tower.x + CELL_WIDTH / 2 >= boss.x - bossWidth / 2 &&
    tower.y - CELL_HEIGHT / 2 <= boss.y + bossHeight / 2 &&
    tower.y + CELL_HEIGHT / 2 >= boss.y - bossHeight / 2
  );
}

export function isPointInBossHitbox(boss: CubeBoss | null, x: number, y: number) {
  return Boolean(bossPartAtPoint(boss, x, y));
}

export function bossPartAtPoint(boss: CubeBoss | null, x: number, y: number) {
  if (!boss) {
    return undefined;
  }

  if (pointInBossBounds(boss, x, y)) {
    return boss;
  }

  for (const part of boss.octahedronCopies ?? []) {
    if (pointInBossBounds(part, x, y)) {
      return part;
    }
  }

  return undefined;
}

export function isBossInRadius(boss: CubeBoss | null, x: number, y: number, radius: number) {
  return Boolean(bossPartInRadius(boss, x, y, radius));
}

export function bossPartInRadius(boss: CubeBoss | null, x: number, y: number, radius: number) {
  if (!boss) {
    return undefined;
  }

  const radiusSq = radius * radius;
  if (bossPartDistanceSqToPoint(boss, x, y) <= radiusSq) {
    return boss;
  }

  for (const part of boss.octahedronCopies ?? []) {
    if (bossPartDistanceSqToPoint(part, x, y) <= radiusSq) {
      return part;
    }
  }

  return undefined;
}

export function isBossInRect(boss: CubeBoss | null, x: number, y: number, width: number, height: number) {
  return Boolean(bossPartInRect(boss, x, y, width, height));
}

export function bossPartInRect(boss: CubeBoss | null, x: number, y: number, width: number, height: number) {
  if (!boss) {
    return undefined;
  }

  const right = x + width;
  const bottom = y + height;
  if (bossPartIntersectsRect(boss, x, right, y, bottom)) {
    return boss;
  }

  for (const part of boss.octahedronCopies ?? []) {
    if (bossPartIntersectsRect(part, x, right, y, bottom)) {
      return part;
    }
  }

  return undefined;
}

export function getHealTargets(
  tower: Tower,
  definition: CardDefinition,
  occupied: Map<string, Tower>,
  count = 1
) {
  if (count <= 0) {
    return [];
  }

  const targets: Tower[] = [];
  visitHealTargetCells(tower, definition, (lane, column) => {
    const target = occupied.get(gridCellKey(lane, column));
    if (!target || target.hp >= towerFinalStats(target).maxHp) {
      return;
    }

    insertHealTarget(targets, target, count);
  });

  return targets;
}

export function hasHealTarget(
  tower: Tower,
  definition: CardDefinition,
  occupied: Map<string, Tower>,
  count = 1
) {
  if (count <= 0) {
    return false;
  }

  let found = false;
  visitHealTargetCells(tower, definition, (lane, column) => {
    const target = occupied.get(gridCellKey(lane, column));
    if (target && target.hp < towerFinalStats(target).maxHp) {
      found = true;
      return false;
    }
  });
  return found;
}

export function getHealTarget(tower: Tower, definition: CardDefinition, occupied: Map<string, Tower>) {
  return getHealTargets(tower, definition, occupied, 1)[0];
}

function visitHealTargetCells(tower: Tower, definition: CardDefinition, visit: (lane: number, column: number) => false | void) {
  const minLane = Math.max(0, tower.lane - 1);
  const maxLane = Math.min(LANES - 1, tower.lane + 1);
  const rangeCells = Math.max(0, Math.trunc(definition.rangeCells ?? 2));
  const direction = towerFacingDirection(tower);

  for (let lane = minLane; lane <= maxLane; lane += 1) {
    if (tower.type === "H" || tower.type === "p") {
      for (let column = tower.column - 1; column <= tower.column + 1; column += 1) {
        if (column >= 0 && column < COLUMNS && visit(lane, column) === false) {
          return false;
        }
      }
      continue;
    }

    if (tower.type === "P") {
      for (let offset = 3; offset >= 1; offset -= 1) {
        const column = tower.column - offset * direction;
        if (column >= 0 && column < COLUMNS && visit(lane, column) === false) {
          return false;
        }
      }
    }

    for (let offset = 0; offset < rangeCells; offset += 1) {
      const column = tower.column + offset * direction;
      if (column >= 0 && column < COLUMNS && visit(lane, column) === false) {
        return false;
      }
    }
  }
  return true;
}

function insertHealTarget(targets: Tower[], target: Tower, count: number) {
  const insertIndex = targets.findIndex((existing) => compareHealTargets(target, existing) < 0);
  if (insertIndex >= 0) {
    targets.splice(insertIndex, 0, target);
  } else if (targets.length < count) {
    targets.push(target);
  }

  if (targets.length > count) {
    targets.pop();
  }
}

function compareHealTargets(a: Tower, b: Tower) {
  const hpRatioDelta = a.hp / towerFinalStats(a).maxHp - b.hp / towerFinalStats(b).maxHp;
  return hpRatioDelta || a.placedOrder - b.placedOrder;
}

function xIsInTargetColumns(x: number, column: number, direction: number) {
  return xIsInColumn(x, column) || xIsInColumn(x, column + direction);
}

function xIsInColumn(x: number, column: number) {
  return column >= 0 && column < COLUMNS && x >= BOARD_X + column * CELL_WIDTH && x < BOARD_X + (column + 1) * CELL_WIDTH;
}

function insertEnemyByX(targets: Enemy[], enemy: Enemy) {
  let index = 0;
  while (index < targets.length && targets[index].x <= enemy.x) {
    index += 1;
  }
  targets.splice(index, 0, enemy);
}

function insertShiftTarget(targets: Enemy[], enemy: Enemy, towerLane: number) {
  let index = 0;
  while (index < targets.length && compareShiftTargets(targets[index], enemy, towerLane) <= 0) {
    index += 1;
  }
  targets.splice(index, 0, enemy);
}

function compareShiftTargets(a: Enemy, b: Enemy, towerLane: number) {
  return a.x - b.x || Math.abs(a.lane - towerLane) - Math.abs(b.lane - towerLane);
}

export function getShiftTargets(tower: Tower, enemies: Enemy[]) {
  const direction = towerFacingDirection(tower);
  const targets: Enemy[] = [];
  for (const enemy of enemies) {
    if (!enemyIsShiftTarget(tower, direction, enemy)) {
      continue;
    }

    insertShiftTarget(targets, enemy, tower.lane);
  }
  return targets;
}

export function hasShiftTarget(tower: Tower, enemies: Enemy[]) {
  const direction = towerFacingDirection(tower);
  for (const enemy of enemies) {
    if (enemyIsShiftTarget(tower, direction, enemy)) {
      return true;
    }
  }
  return false;
}

export function getLaneRepelTargets(tower: Tower, enemies: Enemy[]) {
  const direction = towerFacingDirection(tower);
  const targets: Enemy[] = [];
  for (const enemy of enemies) {
    if (!enemyIsLaneRepelTarget(tower, direction, enemy)) {
      continue;
    }

    insertEnemyByX(targets, enemy);
  }
  return targets;
}

export function hasLaneRepelTarget(tower: Tower, enemies: Enemy[]) {
  const direction = towerFacingDirection(tower);
  for (const enemy of enemies) {
    if (enemyIsLaneRepelTarget(tower, direction, enemy)) {
      return true;
    }
  }
  return false;
}

function enemyIsShiftTarget(tower: Tower, direction: number, enemy: Enemy) {
  return (
    !enemyIsHighFlying(enemy) &&
    Math.abs(enemy.lane - tower.lane) === 1 &&
    xIsInTargetColumns(enemy.x, tower.column, direction)
  );
}

function enemyIsLaneRepelTarget(tower: Tower, direction: number, enemy: Enemy) {
  return (
    !enemyIsHighFlying(enemy) &&
    enemy.lane === tower.lane &&
    xIsInTargetColumns(enemy.x, tower.column, direction)
  );
}

export function getBlockingTower(towers: Tower[], enemy: Enemy) {
  if (!enemyCanBeBlocked(enemy)) {
    return undefined;
  }

  const enemyFlying = hasStatusEffectName(enemy, "flying");
  let blockingTower: Tower | undefined;
  for (const tower of towers) {
    if (!towerCanBlockEnemy(tower, enemy, enemyFlying)) {
      continue;
    }

    if (!blockingTower || tower.x > blockingTower.x) {
      blockingTower = tower;
    }
  }
  return blockingTower;
}

export function getBlockingTowerFromOccupied(occupied: Map<string, Tower>, enemy: Enemy) {
  if (!enemyCanBeBlocked(enemy)) {
    return undefined;
  }

  const enemyFlying = hasStatusEffectName(enemy, "flying");
  const centerColumn = Math.round((enemy.x - BOARD_X - CELL_WIDTH / 2) / CELL_WIDTH);
  let blockingTower: Tower | undefined;
  for (let column = centerColumn + 1; column >= centerColumn - 1; column -= 1) {
    if (column < 0 || column >= COLUMNS) {
      continue;
    }

    const tower = occupied.get(gridCellKey(enemy.lane, column));
    if (!tower || !towerCanBlockEnemy(tower, enemy, enemyFlying)) {
      continue;
    }

    if (!blockingTower || tower.x > blockingTower.x) {
      blockingTower = tower;
    }
  }
  return blockingTower;
}

function enemyCanBeBlocked(enemy: Enemy) {
  return !(enemyIsBossCompanion(enemy.kind) || enemyIsBurrowed(enemy) || enemyIsHighFlying(enemy) || enemyIsSolarBomb(enemy));
}

function towerCanBlockEnemy(tower: Tower, enemy: Enemy, enemyFlying: boolean) {
  return (
    !tower.transient &&
    tower.lane === enemy.lane &&
    Math.abs(enemy.x - tower.x) < 38 &&
    !(enemyFlying ? !towerIsFlying(tower) : towerIsFlying(tower))
  );
}

export function latestPlacedTower(towers: readonly Tower[]) {
  let latest: Tower | undefined;
  for (const tower of towers) {
    if (!latest || tower.placedOrder > latest.placedOrder) {
      latest = tower;
    }
  }
  return latest;
}

export function latestPlacedTowers(towers: readonly Tower[], count: number) {
  if (count <= 0) {
    return [];
  }

  const latest: Tower[] = [];
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

export function getBlockedEnemies(
  tower: Tower,
  towers: Tower[],
  enemies: Enemy[],
  occupied?: Map<string, Tower>
) {
  const targets: Enemy[] = [];
  for (const enemy of enemies) {
    const blocker = occupied ? getBlockingTowerFromOccupied(occupied, enemy) : getBlockingTower(towers, enemy);
    if (blocker === tower) {
      insertEnemyByX(targets, enemy);
    }
  }
  return targets;
}

export function hasBlockedEnemy(
  tower: Tower,
  towers: Tower[],
  enemies: Enemy[],
  occupied?: Map<string, Tower>
) {
  for (const enemy of enemies) {
    const blocker = occupied ? getBlockingTowerFromOccupied(occupied, enemy) : getBlockingTower(towers, enemy);
    if (blocker === tower) {
      return true;
    }
  }
  return false;
}

export function getAttackTarget(tower: Tower, definition: CardDefinition, enemies: Enemy[]) {
  const query = attackTargetQuery(tower, definition);
  let target: Enemy | undefined;
  let targetPriority = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (!enemyIsInAttackArea(tower, query, enemy)) {
      continue;
    }

    const priority = attackTargetPriority(query, enemy);
    if (priority < targetPriority) {
      target = enemy;
      targetPriority = priority;
    }
  }
  return target;
}

export function getLowestMaxHpAttackTarget(tower: Tower, definition: CardDefinition, enemies: Enemy[]) {
  const query = attackTargetQuery(tower, definition);
  let target: Enemy | undefined;
  let targetMaxHp = Number.POSITIVE_INFINITY;
  let targetPriority = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (!enemyIsInAttackArea(tower, query, enemy)) {
      continue;
    }

    const maxHp = enemy.baseStats.maxHp;
    const priority = attackTargetPriority(query, enemy);
    if (maxHp < targetMaxHp || (maxHp === targetMaxHp && priority < targetPriority)) {
      target = enemy;
      targetMaxHp = maxHp;
      targetPriority = priority;
    }
  }
  return target;
}

export function attackRangeRight(tower: Tower, definition: CardDefinition) {
  return attackRangeBounds(tower, definition).right;
}

export function attackRangeLimitX(tower: Tower, definition: CardDefinition) {
  const bounds = attackRangeBounds(tower, definition);
  return towerFacingDirection(tower) < 0 ? bounds.left : bounds.right;
}

function attackTargetQuery(tower: Tower, definition: CardDefinition): AttackTargetQuery {
  const area = getCardAttackArea(tower.type);
  const direction = towerFacingDirection(tower);
  return {
    area,
    direction,
    range: attackRangeBoundsForArea(tower, definition, area, direction),
    towerY: tower.y
  };
}

function attackRangeBounds(tower: Tower, definition: CardDefinition) {
  const area = getCardAttackArea(tower.type);
  const direction = towerFacingDirection(tower);
  return attackRangeBoundsForArea(tower, definition, area, direction);
}

function attackRangeBoundsForArea(
  tower: Tower,
  definition: CardDefinition,
  area: AttackAreaConfig,
  direction: number
): AttackRangeBounds {
  const rangeCells =
    area.kind === "laneRectangle" || area.kind === "laneForward"
      ? area.rangeCells ?? definition.rangeCells ?? COLUMNS
      : definition.rangeCells ?? COLUMNS;
  if (direction < 0) {
    return {
      left: BOARD_X + Math.max(0, tower.column - rangeCells + 1) * CELL_WIDTH,
      right: BOARD_X + (tower.column + 1) * CELL_WIDTH
    };
  }

  return {
    left: BOARD_X + tower.column * CELL_WIDTH,
    right: BOARD_X + Math.min(COLUMNS, tower.column + rangeCells) * CELL_WIDTH
  };
}

export function hasAttackTarget(
  tower: Tower,
  definition: CardDefinition,
  enemies: Enemy[],
  boss: CubeBoss | null
) {
  return canAttackBoss(tower, definition, boss) || hasEnemyAttackTarget(tower, definition, enemies);
}

function hasEnemyAttackTarget(tower: Tower, definition: CardDefinition, enemies: Enemy[]) {
  const query = attackTargetQuery(tower, definition);
  for (const enemy of enemies) {
    if (enemyIsInAttackArea(tower, query, enemy)) {
      return true;
    }
  }
  return false;
}

export function canAttackBoss(tower: Tower, definition: CardDefinition, boss: CubeBoss | null) {
  if (!boss) {
    return false;
  }

  return Boolean(findBossPart(boss, (part) => canAttackBossPart(tower, definition, part)));
}

export function canAttackBossPart(tower: Tower, definition: CardDefinition, boss: CubeBoss) {
  const halfWidth = (boss.hitboxWidth ?? BOSS_HITBOX_WIDTH) / 2;
  const halfHeight = (boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT) / 2;
  const left = boss.x - halfWidth;
  const right = boss.x + halfWidth;
  const top = boss.y - halfHeight;
  const bottom = boss.y + halfHeight;
  const area = getCardAttackArea(tower.type);
  const direction = towerFacingDirection(tower);
  if (area.kind === "verticalFan") {
    const verticalDirection = area.direction === "down" ? 1 : -1;
    const bossIsInDirection = verticalDirection > 0 ? top > tower.y : bottom < tower.y;
    if (!bossIsInDirection) {
      return false;
    }

    const distance = verticalDirection > 0 ? top - tower.y : tower.y - bottom;
    const spread = area.halfWidth + verticalFanSpreadSlope(area) * distance;
    return tower.x >= left - spread && tower.x <= right + spread;
  }

  if (tower.y < top || tower.y > bottom) {
    return false;
  }

  if (area.kind === "laneRectangle") {
    const range = attackRangeBoundsForArea(tower, definition, area, direction);
    return right >= range.left && left <= range.right;
  }

  const startOffset = area.startOffsetX ?? 12;
  const range = attackRangeBoundsForArea(tower, definition, area, direction);
  return direction > 0
    ? right > tower.x + startOffset && left <= range.right
    : left < tower.x - startOffset && right >= range.left;
}

function enemyIsInAttackArea(
  tower: Tower,
  query: AttackTargetQuery,
  enemy: Enemy
) {
  const area = query.area;
  if (area.kind !== "verticalFan" && enemy.lane !== tower.lane) {
    return false;
  }

  if (enemyIsBurrowed(enemy) || enemyIsHighFlying(enemy)) {
    return false;
  }

  if (area.kind === "verticalFan") {
    const verticalDirection = area.direction === "down" ? 1 : -1;
    const dy = enemy.y - tower.y;
    if (dy * verticalDirection <= 0) {
      return false;
    }

    const spread = area.halfWidth + verticalFanSpreadSlope(area) * Math.abs(dy);
    return Math.abs(enemy.x - tower.x) <= spread;
  }

  if (area.kind === "laneRectangle") {
    const range = query.range;
    return enemy.x >= range.left && enemy.x <= range.right;
  }

  const direction = query.direction;
  const startOffset = area.startOffsetX ?? 24;
  const range = query.range;
  return direction > 0
    ? enemy.x > tower.x + startOffset && enemy.x <= range.right
    : enemy.x < tower.x - startOffset && enemy.x >= range.left;
}

function verticalFanSpreadSlope(area: Extract<AttackAreaConfig, { kind: "verticalFan" }>) {
  return area.spreadSlope ?? Math.tan(Phaser.Math.DegToRad(area.spreadDegrees));
}

function attackTargetPriority(query: AttackTargetQuery, enemy: Enemy) {
  if (query.area.kind === "verticalFan") {
    return Math.abs(enemy.y - query.towerY);
  }

  return query.direction > 0 ? enemy.x : -enemy.x;
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
