import * as battleMath from "./battleMath";
import { towerCellMembers } from "./towerOccupancy";
import { towerAtCell, towerCell } from "./towerTopology";
import { towerBehaviorType } from "./towerIdentity";
import {
  BOARD_X,
  BOARD_Y,
  BOSS_HITBOX_HEIGHT,
  BOSS_HITBOX_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  COLUMNS,
  LANES
} from "../config";
import type { CardDefinition } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { EnemyState as Enemy } from "./enemyState";
import type { BossState as CubeBoss } from "./bossState";
import { getEnemyRegistration } from "../registry/enemies";
import { enemyAttackDamage } from "./combatStats";
import { enemyIsBurrowed, enemyIsHighFlying } from "./enemyCombatRules";
import { getCardAttackArea, type AttackAreaConfig } from "./cardAttackConfigs";
import { towerFacingDirection } from "./towerRules";
import { towerFinalStats } from "./unitStatRules";
import { bossBounds, towerBounds, findBossPart } from "./unitGeometry";

export {
  bossBounds,
  bossParts,
  secondaryBossParts,
  findBossPart,
  forEachBossPart,
  towerBounds,
  pointInBounds,
  pointInTowerBounds,
  pointInBossBounds,
  bossPartDistanceSqToPoint,
  clampXToBossPart,
  clampYToBossPart,
  bossPartIntersectsRect,
  rectBoundsIntersect,
  towerIntersectsBoss,
  isPointInBossHitbox,
  bossPartAtPoint,
  isBossInRadius,
  bossPartInRadius,
  isBossInRect,
  bossPartInRect,
  type RectBounds
} from "./unitGeometry";

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

export { gridCellKey } from "./boardCells";
export { getBlockingTower, getBlockingTowerFromOccupied, getSweptBlockingTowerFromOccupied,
  latestPlacedTower, latestPlacedTowers } from "./enemyBlockingRules";
import { getBlockingTower, getBlockingTowerFromOccupied } from "./enemyBlockingRules";

export function getHealTargets<T extends Tower>(
  tower: Tower,
  definition: CardDefinition,
  occupied: Map<string, T>,
  count = 1,
  output?: T[]
) {
  const targets = output ?? [];
  targets.length = 0;
  if (count <= 0) {
    return targets;
  }

  visitHealTargetCells(tower, definition, (lane, column) => {
    for (const target of towerCellMembers(towerAtCell(occupied, tower, lane, column))) {
      if (target.hp < towerFinalStats(target).maxHp) insertHealTarget(targets, target, count);
    }
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
    if (towerCellMembers(towerAtCell(occupied, tower, lane, column)).some(target => target.hp < towerFinalStats(target).maxHp)) {
      found = true;
      return false;
    }
  });
  return found;
}

export function getHealTarget<T extends Tower>(tower: Tower, definition: CardDefinition, occupied: Map<string, T>) {
  return getHealTargets(tower, definition, occupied, 1)[0];
}

function visitHealTargetCells(tower: Tower, definition: CardDefinition, visit: (lane: number, column: number) => false | void) {
  const origin = towerCell(tower);
  const minLane = Math.max(0, origin.lane - 1);
  const maxLane = Math.min(LANES - 1, origin.lane + 1);
  const rangeCells = Math.max(0, Math.trunc(definition.rangeCells ?? 2));
  const direction = towerFacingDirection(tower);

  for (let lane = minLane; lane <= maxLane; lane += 1) {
    if (towerBehaviorType(tower) === "H" || towerBehaviorType(tower) === "p") {
      for (let column = origin.column - 1; column <= origin.column + 1; column += 1) {
        if (column >= 0 && column < COLUMNS && visit(lane, column) === false) {
          return false;
        }
      }
      continue;
    }

    if (towerBehaviorType(tower) === "P") {
      for (let offset = 3; offset >= 1; offset -= 1) {
        const column = origin.column - offset * direction;
        if (column >= 0 && column < COLUMNS && visit(lane, column) === false) {
          return false;
        }
      }
    }

    for (let offset = 0; offset < rangeCells; offset += 1) {
      const column = origin.column + offset * direction;
      if (column >= 0 && column < COLUMNS && visit(lane, column) === false) {
        return false;
      }
    }
  }
  return true;
}

function insertHealTarget<T extends Tower>(targets: T[], target: T, count: number) {
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

function insertEnemyByX<E extends Enemy>(targets: E[], enemy: E) {
  let index = 0;
  while (index < targets.length && targets[index].x <= enemy.x) {
    index += 1;
  }
  targets.splice(index, 0, enemy);
}

function insertShiftTarget<E extends Enemy>(targets: E[], enemy: E, towerLane: number) {
  let index = 0;
  while (index < targets.length && compareShiftTargets(targets[index], enemy, towerLane) <= 0) {
    index += 1;
  }
  targets.splice(index, 0, enemy);
}

function compareShiftTargets(a: Enemy, b: Enemy, towerLane: number) {
  return a.x - b.x || Math.abs(a.lane - towerLane) - Math.abs(b.lane - towerLane);
}

export function getShiftTargets<E extends Enemy>(tower: Tower, enemies: E[], output?: E[]) {
  const direction = towerFacingDirection(tower);
  const targets = output ?? [];
  targets.length = 0;
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

export function getLaneRepelTargets<E extends Enemy>(tower: Tower, enemies: E[], output?: E[]) {
  const direction = towerFacingDirection(tower);
  const targets = output ?? [];
  targets.length = 0;
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

export function getBlockedEnemies<E extends Enemy>(
  tower: Tower,
  towers: Tower[],
  enemies: E[],
  occupied?: Map<string, Tower>,
  output?: E[]
) {
  const targets = output ?? [];
  targets.length = 0;
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

export function getAttackTarget<E extends Enemy>(tower: Tower, definition: CardDefinition, enemies: E[]) {
  const query = attackTargetQuery(tower, definition);
  let target: E | undefined;
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

export function getRangedHighestAttackTarget<E extends Enemy>(tower: Tower, definition: CardDefinition, enemies: E[], time: number) {
  const query = attackTargetQuery(tower, definition);
  let target: E | undefined;
  let targetRanged = false;
  let targetAttack = Number.NEGATIVE_INFINITY;
  let targetPriority = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (!enemy.inPlay || !enemyIsInAttackArea(tower, query, enemy)) {
      continue;
    }

    const mode = getEnemyRegistration(enemy.kind).attackMode;
    const ranged = mode === "ranged" || mode === "laser" || mode === "mortar" || mode === "companion" ||
      (mode === "chargedRanged" && !enemy.chevronAssault);
    const attack = enemyAttackDamage(enemy, time);
    const priority = attackTargetPriority(query, enemy);
    if (!target || (ranged && !targetRanged) || (ranged === targetRanged &&
      (attack > targetAttack || (attack === targetAttack && priority < targetPriority)))) {
      target = enemy;
      targetRanged = ranged;
      targetAttack = attack;
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
  const area = getCardAttackArea(towerBehaviorType(tower));
  const direction = towerFacingDirection(tower);
  return {
    area,
    direction,
    range: attackRangeBoundsForArea(tower, definition, area, direction),
    towerY: tower.y
  };
}

function attackRangeBounds(tower: Tower, definition: CardDefinition) {
  const area = getCardAttackArea(towerBehaviorType(tower));
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
  const area = getCardAttackArea(towerBehaviorType(tower));
  const direction = towerFacingDirection(tower);
  if (area.kind === "fan") {
    const horizontal = area.direction === "forward";
    const axisDirection = horizontal ? direction : area.direction === "down" ? 1 : -1;
    const origin = horizontal ? tower.x : tower.y;
    const near = axisDirection > 0 ? (horizontal ? left : top) : (horizontal ? right : bottom);
    const distance = (near - origin) * axisDirection;
    if (distance <= 0) return false;
    const spread = area.halfWidth + fanSpreadSlope(area) * distance;
    const cross = horizontal ? tower.y : tower.x;
    return cross >= (horizontal ? top : left) - spread && cross <= (horizontal ? bottom : right) + spread;
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
  if (area.kind !== "fan" && (enemy.oscillationCenterY !== undefined
    ? Math.abs(enemy.y - tower.y) > CELL_HEIGHT / 2 : enemy.lane !== tower.lane)) {
    return false;
  }

  if (enemyIsBurrowed(enemy) || enemyIsHighFlying(enemy)) {
    return false;
  }

  if (area.kind === "fan") {
    const horizontal = area.direction === "forward";
    const axisDirection = horizontal ? query.direction : area.direction === "down" ? 1 : -1;
    const distance = (horizontal ? enemy.x - tower.x : enemy.y - tower.y) * axisDirection;
    if (distance <= 0) return false;
    const spread = area.halfWidth + fanSpreadSlope(area) * distance;
    return Math.abs(horizontal ? enemy.y - tower.y : enemy.x - tower.x) <= spread;
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

function fanSpreadSlope(area: Extract<AttackAreaConfig, { kind: "fan" }>) {
  return area.spreadSlope ?? battleMath.tan(area.spreadDegrees * (Math.PI / 180));
}

function attackTargetPriority(query: AttackTargetQuery, enemy: Enemy) {
  if (query.area.kind === "fan" && query.area.direction !== "forward") {
    return Math.abs(enemy.y - query.towerY);
  }

  return query.direction > 0 ? enemy.x : -enemy.x;
}
