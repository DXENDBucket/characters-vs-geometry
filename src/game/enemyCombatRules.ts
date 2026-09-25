import { ATTACK_INTERVAL, CELL_WIDTH, ENEMY_SPEED, ENEMY_SPEED_VARIANCE } from "../config";
import { CHEVRON_LEADER } from "../data/chevronLeader";
import {
  enemyFamily, enemyIsBlockedDetonator, enemyIsBossCompanion, enemyIsLaser, enemyIsLeader,
  enemyIsMace, enemyIsMortar, enemyIsRanged, enemyIsSiegeRam, enemyRank, getEnemyDefinition
} from "../registry/enemies";
import type { EnemyKind } from "../types";
import type { EnemyState } from "./enemyState";
import { attackIntervalMs, attackSpeedForIntervalMs } from "./attackSpeed";
import { enemyIsSolarBomb, isSolarBombKind } from "./enemyIdentity";
import { hasStatusEffectName } from "./rules/statusEffectRules";

export function enemyIsBurrowed(enemy: Pick<EnemyState, "burrowed">) {
  return enemy.burrowed === true;
}

export function enemyIsHighFlying(enemy: Pick<EnemyState, "parenthesisCarrier" | "highFlightUntil" | "statusEffects">): boolean {
  if (enemy.parenthesisCarrier) return enemyIsHighFlying(enemy.parenthesisCarrier);
  return enemy.highFlightUntil !== undefined || hasStatusEffectName(enemy, "highFlying");
}

export function shouldEnemyShoot(enemy: EnemyState, time: number) {
  return (enemyIsRanged(enemy.kind) || enemyIsMortar(enemy.kind) || enemyIsLaser(enemy.kind)) && time >= enemy.attackAt;
}

export function canEnemyMelee(enemy: EnemyState) {
  const kind = enemy.kind;
  if (enemyIsRanged(kind) || enemyIsMortar(kind) || enemyIsLaser(kind) || enemyIsBlockedDetonator(kind) ||
      enemyIsSiegeRam(kind) || enemyIsMace(kind) || enemyIsSolarBomb(enemy) || enemyIsBossCompanion(kind)) return false;
  const family = enemyFamily(kind);
  return family !== "heart" && family !== "slopeTriangle" && family !== "chevronLeader";
}

export function enemyIgnoresLeaderRestrictedMechanics(enemy: EnemyState) {
  return enemyIsLeader(enemy.kind) || enemyIsSolarBomb(enemy);
}

export function enemyVolleyShotCount(enemy: EnemyState) {
  return enemyIsRanged(enemy.kind) || enemyIsMortar(enemy.kind) || enemyIsLaser(enemy.kind) ? enemyRank(enemy.kind) : 1;
}

export function randomizedEnemySpeed(kind: EnemyKind, random: () => number) {
  const definition = getEnemyDefinition(kind);
  const baseSpeed = ENEMY_SPEED * (definition.speedMultiplier ?? 1);
  if (enemyIsLeader(kind) || isSolarBombKind(kind)) return baseSpeed;
  return baseSpeed * (1 - ENEMY_SPEED_VARIANCE + random() * 2 * ENEMY_SPEED_VARIANCE);
}

export function siegeRamSpeed(enemy: EnemyState) {
  if (!enemyIsSiegeRam(enemy.kind)) return enemy.baseStats.speed;
  const accelerationDistance = 7 * CELL_WIDTH;
  const traveled = Math.max(0, enemy.spawnX - enemy.x);
  const progress = Math.max(0, Math.min(1, traveled / accelerationDistance));
  return enemy.baseStats.speed * Math.sqrt(1 + 15 * progress);
}

export function enemyAttackSpeed(kind: EnemyKind) {
  if (enemyIsLaser(kind)) {
    return attackSpeedFromInterval(4_000);
  }

  if (enemyIsMortar(kind)) {
    return attackSpeedFromInterval(15_000);
  }

  if (enemyIsRanged(kind)) {
    return attackSpeedFromInterval(2_000);
  }

  const family = enemyFamily(kind);
  if (family === "chevronLeader") return attackSpeedFromInterval(CHEVRON_LEADER.chargeMs);
  if (family === "heart") {
    return attackSpeedFromInterval(5_000);
  }

  if (family === "chargingHexagon") {
    return attackSpeedFromInterval(2_000 / enemyRank(kind));
  }

  if (family === "archangelHeptagon") {
    return attackSpeedFromInterval(2_000);
  }

  if (family === "triangle" || family === "tilde") {
    return attackSpeedFromInterval(ATTACK_INTERVAL / enemyRank(kind));
  }

  return attackSpeedFromInterval(ATTACK_INTERVAL);
}

export function enemyAttackInterval(kind: EnemyKind) {
  return attackIntervalMs(enemyAttackSpeed(kind));
}

function attackSpeedFromInterval(intervalMs: number) {
  return attackSpeedForIntervalMs(intervalMs) ?? 0;
}
