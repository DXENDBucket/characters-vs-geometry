import * as battleMath from "./battleMath";
import { enemyMaximumHp } from "./enemyContainerRules";
import type { DamageType } from "../types";
import type { EnemyState as Enemy } from "./enemyState";
import { enemyIsSolarBomb } from "./enemyIdentity";

export { SOLAR_BOMB_KIND, isSolarBombKind, enemyIsSolarBomb } from "./enemyIdentity";
export const SOLAR_BOMB_COLLISION_DAMAGE = 900;
export const SOLAR_BOMB_SHIELD_BREAK_AOE_DAMAGE = 2_900;
export const SOLAR_BOMB_SHIELD_BREAK_AOE_RADIUS_CELLS = 2.6;
export const SOLAR_BOMB_RADIUS = 32;
export const SOLAR_BOMB_BOUNCE_COOLDOWN = 150;
export const SOLAR_BOMB_DEPLETED_BOSS_ACCELERATION = 4;
export const SOLAR_BOMB_ROTATION_SPEED = Math.PI * 0.9;

export function solarBombIsDepleted(enemy: Enemy) {
  return enemyIsSolarBomb(enemy) && (enemy.solarBombDepleted === true || enemy.hp <= 1);
}

export function solarBombDamageMultiplier(enemy: Enemy, damageType: DamageType) {
  if (!enemyIsSolarBomb(enemy) || solarBombIsDepleted(enemy)) {
    return 1;
  }

  if (enemy.hp > enemyMaximumHp(enemy) * 0.5 && damageType === "magic") {
    return 0.05;
  }

  if (enemy.hp < enemyMaximumHp(enemy) * 0.5 && damageType === "physical") {
    return 0.05;
  }

  return 1;
}

export function depleteSolarBomb(enemy: Enemy) {
  enemy.hp = 1;
  enemy.solarBombDepleted = true;
}

export function bounceSolarBombFromPoint(enemy: Enemy, sourceX: number, sourceY: number) {
  if (!enemyIsSolarBomb(enemy)) {
    return;
  }

  const currentVx = enemy.solarBombVelocityX ?? enemy.movementDirection ?? -1;
  const currentVy = enemy.solarBombVelocityY ?? 0;
  const speed = Math.max(vectorLength(currentVx, currentVy), enemy.baseStats.speed || 1);
  let dx = enemy.x - sourceX;
  let dy = enemy.y - sourceY;
  let normalLength = vectorLength(dx, dy);
  if (normalLength <= 0.001) {
    dx = -currentVx || 1;
    dy = -currentVy;
    normalLength = vectorLength(dx, dy) || 1;
  }

  const nx = dx / normalLength;
  const ny = dy / normalLength;
  enemy.solarBombVelocityX = nx * speed;
  enemy.solarBombVelocityY = ny * speed;
  enemy.x += nx * 8;
  enemy.y += ny * 8;
}

export function vectorLength(x: number, y: number) {
  return battleMath.sqrt(x * x + y * y);
}
