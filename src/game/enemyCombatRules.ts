import { ATTACK_INTERVAL } from "../config";
import { CHEVRON_LEADER } from "../data/chevronLeader";
import { enemyFamily, enemyIsLaser, enemyIsMortar, enemyIsRanged, enemyRank } from "../registry/enemies";
import type { EnemyKind } from "../types";
import { attackIntervalMs, attackSpeedForIntervalMs } from "./attackSpeed";

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
