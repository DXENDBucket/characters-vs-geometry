import type { CubeBoss, Enemy, Tower } from "../types";
import {
  chargingHexSpeedMultiplier,
  hexArmorBonus,
  hexBossArmorBonus,
  hexMagicResistanceBonus
} from "./enemySupport";
import { movementSpeedMultiplier } from "./slowAura";
import { statusAttackMultiplier, statusSpeedMultiplier } from "./statusEffects";

interface EnemyFinalStatsContext {
  enemies?: Enemy[];
  towers?: Tower[];
  time?: number;
  x?: number;
  y?: number;
  baseSpeed?: number;
  includeAttack?: boolean;
  includeDefense?: boolean;
  includeMovement?: boolean;
}

export function syncEnemyFinalStats(enemy: Enemy, context: EnemyFinalStatsContext = {}) {
  const baseStats = enemy.baseStats;
  const previousStats = enemy.finalStats ?? baseStats;
  const includeDefense = context.includeDefense ?? Boolean(context.enemies);
  const includeMovement = context.includeMovement ?? false;
  const includeAttack = context.includeAttack ?? false;
  const statusSpeed = includeMovement && context.time !== undefined ? statusSpeedMultiplier(enemy, context.time) : 1;
  const supportSpeed = includeMovement && context.enemies ? chargingHexSpeedMultiplier(context.enemies, enemy) : 1;
  const terrainSpeed = includeMovement && context.towers
    ? movementSpeedMultiplier(context.towers, context.x ?? enemy.x, context.y ?? enemy.y)
    : 1;
  const attackMultiplier = includeAttack && context.time !== undefined ? statusAttackMultiplier(enemy, context.time) : 1;

  enemy.finalStats = {
    ...baseStats,
    armor: includeDefense && context.enemies
      ? baseStats.armor + hexArmorBonus(context.enemies, enemy)
      : previousStats.armor,
    magicResistance: includeDefense && context.enemies
      ? baseStats.magicResistance + hexMagicResistanceBonus(context.enemies, enemy)
      : previousStats.magicResistance,
    speed: includeMovement
      ? (context.baseSpeed ?? baseStats.speed) * statusSpeed * supportSpeed * terrainSpeed
      : previousStats.speed,
    damage: includeAttack ? baseStats.damage * attackMultiplier : previousStats.damage
  };
  return enemy.finalStats;
}

export function enemyDefenseStats(enemy: Enemy, enemies: Enemy[]) {
  return syncEnemyFinalStats(enemy, { enemies, includeDefense: true });
}

export function enemyAttackDamage(enemy: Enemy, time: number) {
  return syncEnemyFinalStats(enemy, { time, includeAttack: true }).damage;
}

export function enemyAttackMultiplier(enemy: Enemy, time: number) {
  syncEnemyFinalStats(enemy, { time, includeAttack: true });
  return statusAttackMultiplier(enemy, time);
}

export function enemyMovementSpeed(
  enemy: Enemy,
  context: { enemies: Enemy[]; towers: Tower[]; time: number; x?: number; y?: number },
  baseSpeed = enemy.baseStats.speed
) {
  return syncEnemyFinalStats(enemy, {
    ...context,
    baseSpeed,
    includeDefense: true,
    includeMovement: true
  }).speed;
}

export function enemyMovementMultiplier(
  enemy: Enemy,
  context: { enemies: Enemy[]; towers: Tower[]; time: number; x?: number; y?: number },
  baseSpeed = enemy.baseStats.speed
) {
  if (baseSpeed === 0) {
    syncEnemyFinalStats(enemy, {
      ...context,
      baseSpeed,
      includeDefense: true,
      includeMovement: true
    });
    return 0;
  }

  return enemyMovementSpeed(enemy, context, baseSpeed) / baseSpeed;
}

export function bossFinalStats(boss: CubeBoss, enemies: Enemy[]) {
  boss.finalStats = {
    ...boss.baseStats,
    armor: boss.baseStats.armor + hexBossArmorBonus(enemies, boss)
  };
  return boss.finalStats;
}
