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

export function getHealTarget(tower: Tower, occupied: Map<string, Tower>) {
  const frontColumn = tower.column + 1;
  if (frontColumn >= COLUMNS) {
    return undefined;
  }

  return [tower.lane - 1, tower.lane, tower.lane + 1]
    .map((lane) => (lane >= 0 && lane < LANES ? occupied.get(gridCellKey(lane, frontColumn)) : undefined))
    .filter((target): target is Tower => Boolean(target && target.hp < target.maxHp))
    .sort((a, b) => {
      const hpRatioDelta = a.hp / a.maxHp - b.hp / b.maxHp;
      return hpRatioDelta || a.placedOrder - b.placedOrder;
    })[0];
}

export function getShiftTargets(tower: Tower, enemies: Enemy[]) {
  const targetLanes = [tower.lane - 1, tower.lane + 1].filter((lane) => lane >= 0 && lane < LANES);
  const targetColumns = [tower.column, tower.column + 1].filter((column) => column >= 0 && column < COLUMNS);
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

export function getAttackTarget(tower: Tower, definition: CardDefinition, enemies: Enemy[]) {
  if (tower.type === "M" || tower.type === "W") {
    return getVerticalFanTarget(tower, enemies);
  }

  if (tower.type === "I" || tower.type === "J" || tower.type === "K") {
    const rangeLeft = BOARD_X + tower.column * CELL_WIDTH;
    const rangeRight = attackRangeRight(tower, definition);
    return enemies
      .filter((enemy) => enemy.lane === tower.lane && enemy.x >= rangeLeft && enemy.x <= rangeRight)
      .sort((a, b) => a.x - b.x)[0];
  }

  return enemies
    .filter((enemy) => enemy.lane === tower.lane && enemy.x > tower.x + 24)
    .sort((a, b) => a.x - b.x)[0];
}

export function attackRangeRight(tower: Tower, definition: CardDefinition) {
  const rangeCells = definition.rangeCells ?? COLUMNS;
  return BOARD_X + Math.min(COLUMNS, tower.column + rangeCells) * CELL_WIDTH;
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
  if (tower.y < rect.top || tower.y > rect.bottom) {
    return false;
  }

  if (tower.type === "I" || tower.type === "J" || tower.type === "K") {
    const rangeLeft = BOARD_X + tower.column * CELL_WIDTH;
    const rangeRight = attackRangeRight(tower, definition);
    return rect.right >= rangeLeft && rect.left <= rangeRight;
  }

  if (tower.type === "M" || tower.type === "W") {
    const verticalDirection = tower.type === "M" ? 1 : -1;
    const bossIsInDirection = verticalDirection > 0 ? rect.top > tower.y : rect.bottom < tower.y;
    if (!bossIsInDirection) {
      return false;
    }

    const distance = verticalDirection > 0 ? rect.top - tower.y : tower.y - rect.bottom;
    const spread = CELL_WIDTH * 0.35 + Math.tan(Phaser.Math.DegToRad(10)) * distance;
    return tower.x >= rect.left - spread && tower.x <= rect.right + spread;
  }

  return rect.right > tower.x + 12;
}

export function getVerticalFanTarget(tower: Tower, enemies: Enemy[]) {
  const verticalDirection = tower.type === "M" ? 1 : -1;
  return enemies
    .filter((enemy) => {
      const dy = enemy.y - tower.y;
      if (dy * verticalDirection <= 0) {
        return false;
      }

      const spread = CELL_WIDTH * 0.35 + Math.tan(Phaser.Math.DegToRad(10)) * Math.abs(dy);
      return Math.abs(enemy.x - tower.x) <= spread;
    })
    .sort((a, b) => Math.abs(a.y - tower.y) - Math.abs(b.y - tower.y))[0];
}
