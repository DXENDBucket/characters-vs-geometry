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
import { enemyIsBurrowed } from "./enemyBehaviors";
import { getCardAttackArea, type AttackAreaConfig } from "./cardAttackConfigs";
import { towerFacingDirection } from "./towers";

export function gridCellKey(lane: number, column: number) {
  return `${lane}:${column}`;
}

export function bossRect(boss: CubeBoss) {
  return new Phaser.Geom.Rectangle(
    boss.x - BOSS_HITBOX_WIDTH / 2,
    boss.y - BOSS_HITBOX_HEIGHT / 2,
    BOSS_HITBOX_WIDTH,
    BOSS_HITBOX_HEIGHT
  );
}

export function towerRect(tower: Tower) {
  return new Phaser.Geom.Rectangle(
    tower.x - CELL_WIDTH / 2,
    tower.y - CELL_HEIGHT / 2,
    CELL_WIDTH,
    CELL_HEIGHT
  );
}

export function isPointInBossHitbox(boss: CubeBoss | null, x: number, y: number) {
  return Boolean(boss && bossRect(boss).contains(x, y));
}

export function isBossInRadius(boss: CubeBoss | null, x: number, y: number, radius: number) {
  if (!boss) {
    return false;
  }

  const rect = bossRect(boss);
  const closestX = Phaser.Math.Clamp(x, rect.left, rect.right);
  const closestY = Phaser.Math.Clamp(y, rect.top, rect.bottom);
  return Math.hypot(x - closestX, y - closestY) <= radius;
}

export function isBossInRect(boss: CubeBoss | null, x: number, y: number, width: number, height: number) {
  if (!boss) {
    return false;
  }

  return Phaser.Geom.Intersects.RectangleToRectangle(bossRect(boss), new Phaser.Geom.Rectangle(x, y, width, height));
}

export function getHealTarget(tower: Tower, definition: CardDefinition, occupied: Map<string, Tower>) {
  const targetColumns = healTargetColumns(tower, definition);
  const targetLanes = [tower.lane - 1, tower.lane, tower.lane + 1].filter((lane) => lane >= 0 && lane < LANES);

  return targetLanes
    .flatMap((lane) => targetColumns.map((column) => occupied.get(gridCellKey(lane, column))))
    .filter((target): target is Tower => Boolean(target && target.hp < target.maxHp))
    .sort((a, b) => {
      const hpRatioDelta = a.hp / a.maxHp - b.hp / b.maxHp;
      return hpRatioDelta || a.placedOrder - b.placedOrder;
    })[0];
}

function healTargetColumns(tower: Tower, definition: CardDefinition) {
  if (tower.type === "H") {
    return [tower.column - 1, tower.column, tower.column + 1].filter((column) => column >= 0 && column < COLUMNS);
  }

  const rangeCells = definition.rangeCells ?? 2;
  const direction = towerFacingDirection(tower);
  return Array.from({ length: rangeCells }, (_value, index) => tower.column + index * direction).filter(
    (column) => column >= 0 && column < COLUMNS
  );
}

export function getShiftTargets(tower: Tower, enemies: Enemy[]) {
  const targetLanes = [tower.lane - 1, tower.lane + 1].filter((lane) => lane >= 0 && lane < LANES);
  const direction = towerFacingDirection(tower);
  const targetColumns = [tower.column, tower.column + direction].filter((column) => column >= 0 && column < COLUMNS);
  const ranges = targetColumns.map((column) => ({
    left: BOARD_X + column * CELL_WIDTH,
    right: BOARD_X + (column + 1) * CELL_WIDTH
  }));

  return enemies
    .filter((enemy) => {
      return targetLanes.includes(enemy.lane) && ranges.some((range) => enemy.x >= range.left && enemy.x < range.right);
    })
    .sort((a, b) => a.x - b.x || Math.abs(a.lane - tower.lane) - Math.abs(b.lane - tower.lane));
}

export function getLaneRepelTargets(tower: Tower, enemies: Enemy[]) {
  const direction = towerFacingDirection(tower);
  const targetColumns = [tower.column, tower.column + direction].filter((column) => column >= 0 && column < COLUMNS);
  const ranges = targetColumns.map((column) => ({
    left: BOARD_X + column * CELL_WIDTH,
    right: BOARD_X + (column + 1) * CELL_WIDTH
  }));

  return enemies
    .filter((enemy) => {
      return enemy.lane === tower.lane && ranges.some((range) => enemy.x >= range.left && enemy.x < range.right);
    })
    .sort((a, b) => a.x - b.x);
}

export function getBlockingTower(towers: Tower[], enemy: Enemy) {
  if (enemyIsBossCompanion(enemy.kind) || enemyIsBurrowed(enemy) || enemy.statusEffects.some((effect) => effect.name === "flying")) {
    return undefined;
  }

  return towers
    .filter((tower) => !tower.transient && tower.lane === enemy.lane && Math.abs(enemy.x - tower.x) < 38)
    .sort((a, b) => b.x - a.x)[0];
}

export function getBlockedEnemies(tower: Tower, towers: Tower[], enemies: Enemy[]) {
  return enemies
    .filter((enemy) => getBlockingTower(towers, enemy) === tower)
    .sort((a, b) => a.x - b.x);
}

export function getAttackTarget(tower: Tower, definition: CardDefinition, enemies: Enemy[]) {
  const area = getCardAttackArea(tower.type);
  return enemies
    .filter((enemy) => enemyIsInAttackArea(tower, definition, area, enemy))
    .sort((a, b) => attackTargetPriority(tower, area, a) - attackTargetPriority(tower, area, b))[0];
}

export function getLowestMaxHpAttackTarget(tower: Tower, definition: CardDefinition, enemies: Enemy[]) {
  const area = getCardAttackArea(tower.type);
  return enemies
    .filter((enemy) => enemyIsInAttackArea(tower, definition, area, enemy))
    .sort((a, b) => a.maxHp - b.maxHp || attackTargetPriority(tower, area, a) - attackTargetPriority(tower, area, b))[0];
}

export function attackRangeRight(tower: Tower, definition: CardDefinition) {
  return attackRangeBounds(tower, definition).right;
}

export function attackRangeLimitX(tower: Tower, definition: CardDefinition) {
  const bounds = attackRangeBounds(tower, definition);
  return towerFacingDirection(tower) < 0 ? bounds.left : bounds.right;
}

function attackRangeBounds(tower: Tower, definition: CardDefinition) {
  const area = getCardAttackArea(tower.type);
  const rangeCells =
    area.kind === "laneRectangle" || area.kind === "laneForward"
      ? area.rangeCells ?? definition.rangeCells ?? COLUMNS
      : definition.rangeCells ?? COLUMNS;
  const direction = towerFacingDirection(tower);
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
  return Boolean(getAttackTarget(tower, definition, enemies) || canAttackBoss(tower, definition, boss));
}

export function canAttackBoss(tower: Tower, definition: CardDefinition, boss: CubeBoss | null) {
  if (!boss) {
    return false;
  }

  const rect = bossRect(boss);
  const area = getCardAttackArea(tower.type);
  if (area.kind === "verticalFan") {
    const verticalDirection = area.direction === "down" ? 1 : -1;
    const bossIsInDirection = verticalDirection > 0 ? rect.top > tower.y : rect.bottom < tower.y;
    if (!bossIsInDirection) {
      return false;
    }

    const distance = verticalDirection > 0 ? rect.top - tower.y : tower.y - rect.bottom;
    const spread = area.halfWidth + Math.tan(Phaser.Math.DegToRad(area.spreadDegrees)) * distance;
    return tower.x >= rect.left - spread && tower.x <= rect.right + spread;
  }

  if (tower.y < rect.top || tower.y > rect.bottom) {
    return false;
  }

  if (area.kind === "laneRectangle") {
    const range = attackRangeBounds(tower, definition);
    return rect.right >= range.left && rect.left <= range.right;
  }

  const direction = towerFacingDirection(tower);
  const startOffset = area.startOffsetX ?? 12;
  const range = attackRangeBounds(tower, definition);
  return direction > 0
    ? rect.right > tower.x + startOffset && rect.left <= range.right
    : rect.left < tower.x - startOffset && rect.right >= range.left;
}

function enemyIsInAttackArea(
  tower: Tower,
  definition: CardDefinition,
  area: AttackAreaConfig,
  enemy: Enemy
) {
  if (enemyIsBurrowed(enemy)) {
    return false;
  }

  if (area.kind === "verticalFan") {
    const verticalDirection = area.direction === "down" ? 1 : -1;
    const dy = enemy.y - tower.y;
    if (dy * verticalDirection <= 0) {
      return false;
    }

    const spread = area.halfWidth + Math.tan(Phaser.Math.DegToRad(area.spreadDegrees)) * Math.abs(dy);
    return Math.abs(enemy.x - tower.x) <= spread;
  }

  if (enemy.lane !== tower.lane) {
    return false;
  }

  if (area.kind === "laneRectangle") {
    const range = attackRangeBounds(tower, definition);
    return enemy.x >= range.left && enemy.x <= range.right;
  }

  const direction = towerFacingDirection(tower);
  const startOffset = area.startOffsetX ?? 24;
  const range = attackRangeBounds(tower, definition);
  return direction > 0
    ? enemy.x > tower.x + startOffset && enemy.x <= range.right
    : enemy.x < tower.x - startOffset && enemy.x >= range.left;
}

function attackTargetPriority(tower: Tower, area: AttackAreaConfig, enemy: Enemy) {
  if (area.kind === "verticalFan") {
    return Math.abs(enemy.y - tower.y);
  }

  return towerFacingDirection(tower) > 0 ? enemy.x : -enemy.x;
}
