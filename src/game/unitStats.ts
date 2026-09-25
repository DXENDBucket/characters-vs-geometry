import type {
  BossBaseStats,
  CardDefinition,
  CubeBoss,
  Enemy,
  EnemyBaseStats,
  Tower
} from "../types";
import { enemyMaximumHp } from "./enemyContainers";
import {
  effectiveUpgradeCountForLevel,
  isMaxHpUpgradeable,
  upgradedAttackMultiplier,
  maxHpGainForEffectiveUpgrades
} from "./upgrades";
import { inheritTowerTopology } from "./towerTopology";
import { towerFormType, towerActionContext, withTowerActionContext } from "./towerIdentity";
import { syncTowerHealthCapacity } from "./towerHealth";
import { syncEnemyHealthCapacity } from "./enemyHealth";
import { towerZealAttackSpeedMultiplier, type TowerAuraSources } from "./towerAuras";
import { towerBaseStatsFromDefinition } from "./towerState";
export { enemyBaseStatsFromDefinition } from "./enemyState";
export { towerBaseStatsFromDefinition } from "./towerState";

export function syncTowerFinalStats(
  tower: Tower,
  options: { healMaxHpIncrease?: boolean; towers?: Tower[]; towerAuraSources?: TowerAuraSources } = {}
) {
  const previousMaxHp = tower.finalStats?.maxHp ?? tower.maxHp;
  calculateTowerFinalStats(tower, options.towers, options.towerAuraSources);
  tower.maxHp = tower.finalStats.maxHp;
  tower.baseMaxHp = tower.baseStats.maxHp;
  tower.armor = tower.finalStats.armor;
  tower.magicResistance = tower.finalStats.magicResistance;
  tower.attackSpeed = tower.finalStats.attackSpeed;

  syncTowerHealthCapacity(tower, previousMaxHp, !!options.healMaxHpIncrease);
}

export function calculateTowerFinalStats(tower: Tower, towers?: Tower[], towerAuraSources?: TowerAuraSources) {
  const baseStats = tower.baseStats;
  const finalStats = tower.finalStats;
  const effectiveUpgrades = effectiveUpgradeCountForLevel(effectiveTowerStatLevel(tower));
  const maxHp = isMaxHpUpgradeable(towerFormType(tower))
    ? baseStats.maxHp + maxHpGainForEffectiveUpgrades(baseStats.maxHp, effectiveUpgrades)
    : baseStats.maxHp;
  const attackSpeed = baseStats.attackSpeed === undefined
    ? undefined
    : baseStats.attackSpeed * towerZealAttackSpeedMultiplier(towers, tower, towerAuraSources);

  finalStats.maxHp = maxHp;
  finalStats.armor = baseStats.armor;
  finalStats.magicResistance = baseStats.magicResistance;
  finalStats.attackSpeed = attackSpeed;
  finalStats.attackPower = baseStats.attackPower;
  finalStats.damageType = baseStats.damageType;
  return finalStats;
}

export function towerFinalStats(tower: Tower) {
  return towerActionContext(tower)?.stats ?? tower.finalStats;
}

// Use the original tower as the actor, but borrow a behavior's level-scaled panel
// only for this action. Health, identity, placement and persistent stats stay intact.
export function withTowerBehavior<T>(tower: Tower, definition: CardDefinition, level: number, run: () => T, towers?: Tower[]): T {
  const baseStats = towerBaseStatsFromDefinition(definition);
  const view: Tower = { ...tower, type: definition.id, copiedType: undefined, baseStats, finalStats: { ...baseStats },
    level, levelBonus: 0, mirrorLevelBonus: 0 };
  inheritTowerTopology(tower, view);
  const stats = calculateTowerFinalStats(view, towers);
  return withTowerActionContext(tower, { type: definition.id, level, stats }, run);
}

export function towerAttackAmount(tower: Tower, definition: CardDefinition, multiplier = definition.attackMultiplier ?? 1) {
  const level = towerActionContext(tower)?.level ?? effectiveTowerStatLevel(tower);
  return towerFinalStats(tower).attackPower * upgradedAttackMultiplier(definition.id, multiplier, level);
}

export function towerBaseStats(tower: Tower) {
  return tower.baseStats;
}

export function effectiveTowerStatLevel(tower: Tower) {
  return Math.max(1, tower.level + tower.levelBonus + tower.mirrorLevelBonus);
}


export function applyEnemyBaseStats(
  enemy: Enemy,
  baseStats: EnemyBaseStats,
  options: { hpRatio?: number } = {}
) {
  enemy.baseStats = { ...baseStats };
  enemy.finalStats = { ...baseStats };
  enemy.maxHp = enemyMaximumHp(enemy);
  enemy.finalStats.maxHp = enemy.maxHp;
  enemy.armor = baseStats.armor;
  enemy.magicResistance = baseStats.magicResistance;
  enemy.speed = baseStats.speed;
  enemy.damage = baseStats.damage;
  enemy.damageType = baseStats.damageType;
  enemy.finalDamageReduction = baseStats.finalDamageReduction;
  enemy.attackSpeed = baseStats.attackSpeed;
  enemy.attackInterval = baseStats.attackInterval;

  if (options.hpRatio !== undefined) {
    enemy.hp = Math.max(1, enemy.maxHp * clamp(options.hpRatio, 0, 1));
  } else {
    enemy.hp = Math.min(enemy.hp, enemy.maxHp);
  }
  syncEnemyHealthCapacity(enemy);
}

export function bossBaseStatsFromValues(
  stats: { hp: number; armor: number; magicResistance: number; speed: number },
  finalDamageReduction: number
): BossBaseStats {
  return {
    maxHp: stats.hp,
    armor: stats.armor,
    magicResistance: stats.magicResistance,
    speed: stats.speed,
    finalDamageReduction
  };
}

export function syncBossBaseStats(boss: CubeBoss) {
  boss.finalStats = { ...boss.baseStats };
  boss.maxHp = boss.baseStats.maxHp;
  boss.armor = boss.baseStats.armor;
  boss.magicResistance = boss.baseStats.magicResistance;
  boss.speed = boss.baseStats.speed;
  boss.finalDamageReduction = boss.baseStats.finalDamageReduction;
  boss.hp = Math.min(boss.hp, boss.maxHp);
}

export function setBossBaseArmor(boss: CubeBoss, armor: number) {
  boss.baseStats.armor = Math.max(0, armor);
  syncBossBaseStats(boss);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
