import type { StatusEffect } from "../../types";
import type { EnemyState as Enemy } from "../enemyState";
import type { BossState } from "../bossState";

export interface StatusHolder {
  statusEffects: StatusEffect[];
}

export function facingWithEffects(unit: StatusHolder, baseDirection: -1 | 1): -1 | 1 {
  return unit.statusEffects.some((effect) => effect.name === "reversed") ? (baseDirection === 1 ? -1 : 1) : baseDirection;
}

export function enemyMovementDirection(enemy: Enemy) {
  return facingWithEffects(enemy, enemy.movementDirection ?? -1);
}

export function enemyFacingDirection(enemy: Enemy) {
  return facingWithEffects(enemy, enemy.maceFacingDirection ?? enemy.slopeFacingDirection ?? enemy.movementDirection ?? -1);
}

export function bossMovementDirection(boss: Pick<BossState, "movementAxis" | "movementDirection" | "statusEffects">) {
  const direction = boss.movementDirection ?? -1;
  return boss.movementAxis === "y" ? direction : facingWithEffects(boss, direction);
}

export function applyReversalEffect(unit: StatusHolder, duration: number, time: number) {
  const existing = unit.statusEffects.find((effect) => effect.name === "reversed");
  if (existing) {
    existing.expiresAt = Math.max(existing.expiresAt, time + duration);
  } else {
    unit.statusEffects.push({ name: "reversed", expiresAt: time + duration });
  }
}

// Enemies expire their full effect list; towers and bosses use this for reversal.
export function expireReversalEffect(unit: StatusHolder, time: number) {
  const index = unit.statusEffects.findIndex((effect) => effect.name === "reversed" && effect.expiresAt <= time);
  if (index < 0) {
    return false;
  }
  unit.statusEffects.splice(index, 1);
  return true;
}
