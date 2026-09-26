import { BOSS_HITBOX_HEIGHT, BOSS_HITBOX_WIDTH, CELL_HEIGHT, CELL_WIDTH } from "../config";
import type { CubeBoss } from "../types";
import type { BossState } from "./bossState";

export interface UnitPosition {
  x: number;
  y: number;
}

export interface BossHitbox extends UnitPosition {
  hitboxWidth?: number;
  hitboxHeight?: number;
}

export interface RectBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function bossBounds(boss: BossHitbox): RectBounds {
  const width = boss.hitboxWidth ?? BOSS_HITBOX_WIDTH;
  const height = boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT;
  return {
    left: boss.x - width / 2,
    right: boss.x + width / 2,
    top: boss.y - height / 2,
    bottom: boss.y + height / 2
  };
}

export function bossParts(boss: CubeBoss | null): CubeBoss[];
export function bossParts(boss: BossState | null): BossState[];
export function bossParts(boss: BossState | null) {
  return boss ? [boss, ...secondaryBossParts(boss)] : [];
}

export function secondaryBossParts(boss: CubeBoss): CubeBoss[];
export function secondaryBossParts(boss: BossState): BossState[];
export function secondaryBossParts(boss: BossState) {
  const parts = localSecondaryBossParts(boss);
  return boss.independentBosses?.length
    ? [...parts, ...boss.independentBosses.flatMap(other => [other, ...localSecondaryBossParts(other)])] : parts;
}

function localSecondaryBossParts(boss: BossState) {
  return boss.delLaneSweep?.parts ?? boss.octahedronCopies ?? [];
}

export function bossHealthOwner(root: BossState, part: BossState) {
  if (root === part || localSecondaryBossParts(root).includes(part)) return root;
  return root.independentBosses?.find(other => other === part || localSecondaryBossParts(other).includes(part));
}

export function findLocalBossPart<T extends BossState>(boss: T, predicate: (part: T) => boolean): T | undefined {
  if (predicate(boss)) return boss;
  return (localSecondaryBossParts(boss) as T[]).find(predicate);
}

export function forEachLocalBossPart<T extends BossState>(boss: T, visit: (part: T) => void) {
  visit(boss);
  for (const part of localSecondaryBossParts(boss) as T[]) visit(part);
}

export function bossHealthRoots<T extends BossState>(boss: T | null): T[] {
  return boss ? [boss, ...(boss.independentBosses ?? []) as T[]] : [];
}

export function forEachBossAreaHit<T extends BossState>(boss: T | null,
  contains: (part: T) => boolean, hit: (part: T) => void) {
  for (const root of bossHealthRoots(boss)) {
    const part = findLocalBossPart(root, contains);
    if (part) hit(part);
  }
}

export function findBossPart<T extends BossState>(boss: T | null, predicate: (part: T) => boolean): T | undefined {
  if (!boss) {
    return undefined;
  }

  if (predicate(boss)) {
    return boss;
  }

  for (const part of secondaryBossParts(boss) as T[]) {
    if (predicate(part)) {
      return part;
    }
  }

  return undefined;
}

export function forEachBossPart<T extends BossState>(boss: T | null, visit: (part: T) => void) {
  if (!boss) {
    return;
  }

  visit(boss);
  for (const part of secondaryBossParts(boss) as T[]) {
    visit(part);
  }
}

export function towerBounds(tower: UnitPosition): RectBounds {
  return {
    left: tower.x - CELL_WIDTH / 2,
    right: tower.x + CELL_WIDTH / 2,
    top: tower.y - CELL_HEIGHT / 2,
    bottom: tower.y + CELL_HEIGHT / 2
  };
}

export function pointInBounds(bounds: RectBounds, x: number, y: number) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

export function pointInTowerBounds(tower: UnitPosition, x: number, y: number) {
  return (
    x >= tower.x - CELL_WIDTH / 2 &&
    x <= tower.x + CELL_WIDTH / 2 &&
    y >= tower.y - CELL_HEIGHT / 2 &&
    y <= tower.y + CELL_HEIGHT / 2
  );
}

export function pointInBossBounds(boss: BossHitbox, x: number, y: number) {
  const width = boss.hitboxWidth ?? BOSS_HITBOX_WIDTH;
  const height = boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT;
  return (
    x >= boss.x - width / 2 &&
    x <= boss.x + width / 2 &&
    y >= boss.y - height / 2 &&
    y <= boss.y + height / 2
  );
}

export function bossPartDistanceSqToPoint(boss: BossHitbox, x: number, y: number) {
  const halfWidth = (boss.hitboxWidth ?? BOSS_HITBOX_WIDTH) / 2;
  const halfHeight = (boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT) / 2;
  const closestX = clamp(x, boss.x - halfWidth, boss.x + halfWidth);
  const closestY = clamp(y, boss.y - halfHeight, boss.y + halfHeight);
  return distanceSq(x, y, closestX, closestY);
}

export function clampXToBossPart(boss: BossHitbox, x: number) {
  const halfWidth = (boss.hitboxWidth ?? BOSS_HITBOX_WIDTH) / 2;
  return clamp(x, boss.x - halfWidth, boss.x + halfWidth);
}

export function clampYToBossPart(boss: BossHitbox, y: number) {
  const halfHeight = (boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT) / 2;
  return clamp(y, boss.y - halfHeight, boss.y + halfHeight);
}

export function bossPartIntersectsRect(boss: BossHitbox, left: number, right: number, top: number, bottom: number) {
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

export function towerIntersectsBoss(tower: UnitPosition, boss: BossHitbox) {
  const bossWidth = boss.hitboxWidth ?? BOSS_HITBOX_WIDTH;
  const bossHeight = boss.hitboxHeight ?? BOSS_HITBOX_HEIGHT;
  return (
    tower.x - CELL_WIDTH / 2 <= boss.x + bossWidth / 2 &&
    tower.x + CELL_WIDTH / 2 >= boss.x - bossWidth / 2 &&
    tower.y - CELL_HEIGHT / 2 <= boss.y + bossHeight / 2 &&
    tower.y + CELL_HEIGHT / 2 >= boss.y - bossHeight / 2
  );
}

export function isPointInBossHitbox(boss: BossState | null, x: number, y: number) {
  return Boolean(bossPartAtPoint(boss, x, y));
}

export function bossPartAtPoint(boss: CubeBoss | null, x: number, y: number): CubeBoss | undefined;
export function bossPartAtPoint(boss: BossState | null, x: number, y: number): BossState | undefined;
export function bossPartAtPoint(boss: BossState | null, x: number, y: number) {
  if (!boss) {
    return undefined;
  }

  if (pointInBossBounds(boss, x, y)) {
    return boss;
  }

  for (const part of secondaryBossParts(boss)) {
    if (pointInBossBounds(part, x, y)) {
      return part;
    }
  }

  return undefined;
}

export function isBossInRadius(boss: BossState | null, x: number, y: number, radius: number) {
  return Boolean(bossPartInRadius(boss, x, y, radius));
}

export function bossPartInRadius(boss: CubeBoss | null, x: number, y: number, radius: number): CubeBoss | undefined;
export function bossPartInRadius(boss: BossState | null, x: number, y: number, radius: number): BossState | undefined;
export function bossPartInRadius(boss: BossState | null, x: number, y: number, radius: number) {
  if (!boss) {
    return undefined;
  }

  const radiusSq = radius * radius;
  if (bossPartDistanceSqToPoint(boss, x, y) <= radiusSq) {
    return boss;
  }

  for (const part of secondaryBossParts(boss)) {
    if (bossPartDistanceSqToPoint(part, x, y) <= radiusSq) {
      return part;
    }
  }

  return undefined;
}

export function isBossInRect(boss: BossState | null, x: number, y: number, width: number, height: number) {
  return Boolean(bossPartInRect(boss, x, y, width, height));
}

export function bossPartInRect(boss: CubeBoss | null, x: number, y: number, width: number, height: number): CubeBoss | undefined;
export function bossPartInRect(boss: BossState | null, x: number, y: number, width: number, height: number): BossState | undefined;
export function bossPartInRect(boss: BossState | null, x: number, y: number, width: number, height: number) {
  if (!boss) {
    return undefined;
  }

  const right = x + width;
  const bottom = y + height;
  if (bossPartIntersectsRect(boss, x, right, y, bottom)) {
    return boss;
  }

  for (const part of secondaryBossParts(boss)) {
    if (bossPartIntersectsRect(part, x, right, y, bottom)) {
      return part;
    }
  }

  return undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
