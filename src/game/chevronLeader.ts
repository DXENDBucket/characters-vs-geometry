import { CHEVRON_LEADER } from "../data/chevronLeader";
import { enemyFamily, enemyIsMace } from "../registry/enemies";
import type { Enemy } from "../types";
import { applyEnemyBaseStats } from "./unitStats";

export function enemyUsesMaceMovement(enemy: Enemy) {
  return enemyIsMace(enemy.kind) || (enemyFamily(enemy.kind) === "chevronLeader" && !!enemy.chevronAssault);
}

export function updateChevronPhase(enemy: Enemy) {
  if (enemyFamily(enemy.kind) !== "chevronLeader" || enemy.chevronAssault || enemy.hp <= 0 || enemy.hp > enemy.maxHp / 2) return false;
  enemy.chevronAssault = true;
  enemy.ionChargeMs = 0;
  enemy.maceVelocity = 0;
  // Store the unmodified facing so reversal remains a status, not a permanent turn.
  enemy.maceFacingDirection = enemy.movementDirection ?? -1;
  applyEnemyBaseStats(enemy, { ...enemy.baseStats, armor: CHEVRON_LEADER.assaultArmor, speed: CHEVRON_LEADER.assaultSpeed });
  return true;
}

export function advanceIonCharge(enemy: Enemy, seconds: number) {
  if (enemyFamily(enemy.kind) !== "chevronLeader" || enemy.chevronAssault) return false;
  enemy.ionChargeMs = (enemy.ionChargeMs ?? 0) + seconds * 1000;
  if (enemy.ionChargeMs + 1e-7 < CHEVRON_LEADER.chargeMs) return false;
  enemy.ionChargeMs = Math.max(0, enemy.ionChargeMs - CHEVRON_LEADER.chargeMs);
  return true;
}
