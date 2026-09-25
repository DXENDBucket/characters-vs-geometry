import type { EnemyState as Enemy } from "./enemyState";
import type { EnemyProjectileState as EnemyProjectile } from "./projectileState";
import { enemyFamily } from "../registry/enemies";
import { enemyAttackDamage } from "./combatStats";
import { enemyMovementDirection, enemyFacingDirection } from "./rules/reversal";
import { CELL_WIDTH } from "../config";
import { CHEVRON_LEADER } from "../data/chevronLeader";

export function createEnemyProjectileState(enemy: Enemy, time: number, hitCount = 1): EnemyProjectile {
  const isDiamondShot = enemyFamily(enemy.kind) === "diamond";
  const direction = enemyMovementDirection(enemy);
  const shotX = enemy.x + direction * 22;
  return { x: shotX, y: enemy.y, hitCount, vx: direction * 430,
    damage: enemyAttackDamage(enemy, time), damageType: enemy.damageType, sourceLane: enemy.lane,
    appearance: isDiamondShot ? "star" : "bolt" };
}

export function createIonProjectileState(enemy: Enemy, time: number): EnemyProjectile {
  const direction = enemyFacingDirection(enemy);
  return {
    x: enemy.x + direction * 12, y: enemy.y, vx: direction * CHEVRON_LEADER.projectileSpeed,
    appearance: "ion", sourceLane: enemy.lane, hitCount: 1,
    damage: enemyAttackDamage(enemy, time) * CHEVRON_LEADER.attackMultiplier, damageType: "magic",
    splashRadius: CHEVRON_LEADER.radiusCells * CELL_WIDTH
  };
}
