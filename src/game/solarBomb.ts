import { palette } from "../config";
import { syncSolarBombShape } from "../render/unitShapes";
import type { DamageType, Enemy } from "../types";

export const SOLAR_BOMB_KIND = "solarBomb" as const;
export const SOLAR_BOMB_COLLISION_DAMAGE = 900;
export const SOLAR_BOMB_RADIUS = 32;
export const SOLAR_BOMB_BOUNCE_COOLDOWN = 150;
export const SOLAR_BOMB_ROTATION_SPEED = Math.PI * 0.9;

type RotatableShape = {
  rotation: number;
};

export function isSolarBombKind(kind: string) {
  return kind === SOLAR_BOMB_KIND;
}

export function enemyIsSolarBomb(enemy: Enemy) {
  return isSolarBombKind(enemy.kind);
}

export function solarBombIsDepleted(enemy: Enemy) {
  return enemyIsSolarBomb(enemy) && (enemy.solarBombDepleted === true || enemy.hp <= 1);
}

export function solarBombDamageMultiplier(enemy: Enemy, damageType: DamageType) {
  if (!enemyIsSolarBomb(enemy) || solarBombIsDepleted(enemy)) {
    return 1;
  }

  if (enemy.hp > enemy.baseStats.maxHp * 0.5 && damageType === "magic") {
    return 0.05;
  }

  if (enemy.hp < enemy.baseStats.maxHp * 0.5 && damageType === "physical") {
    return 0.05;
  }

  return 1;
}

export function depleteSolarBomb(enemy: Enemy) {
  enemy.hp = 1;
  enemy.solarBombDepleted = true;
  syncSolarBombVisual(enemy);
}

export function bounceSolarBombFromPoint(enemy: Enemy, sourceX: number, sourceY: number) {
  if (!enemyIsSolarBomb(enemy)) {
    return;
  }

  const currentVx = enemy.solarBombVelocityX ?? enemy.movementDirection ?? -1;
  const currentVy = enemy.solarBombVelocityY ?? 0;
  const speed = Math.max(Math.hypot(currentVx, currentVy), enemy.baseStats.speed || 1);
  let dx = enemy.x - sourceX;
  let dy = enemy.y - sourceY;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.001) {
    dx = -currentVx || 1;
    dy = -currentVy;
  }

  const normalLength = Math.hypot(dx, dy) || 1;
  const nx = dx / normalLength;
  const ny = dy / normalLength;
  enemy.solarBombVelocityX = nx * speed;
  enemy.solarBombVelocityY = ny * speed;
  enemy.x += nx * 8;
  enemy.y += ny * 8;
}

export function rotateSolarBombVisual(enemy: Enemy, seconds: number) {
  if (!enemyIsSolarBomb(enemy)) {
    return;
  }

  (enemy.shape as unknown as RotatableShape).rotation += SOLAR_BOMB_ROTATION_SPEED * seconds;
}

export function syncSolarBombVisual(enemy: Enemy) {
  if (!enemyIsSolarBomb(enemy)) {
    return;
  }

  const color = solarBombIsDepleted(enemy)
    ? palette.gold
    : enemy.hp < enemy.baseStats.maxHp * 0.5
      ? palette.magic
      : palette.white;
  syncSolarBombShape(enemy.shape, color);
  enemy.shape.setScale(1);
}
