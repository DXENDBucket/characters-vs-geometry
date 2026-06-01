import type {
  BossBaseStats,
  CardDefinition,
  CubeBoss,
  Enemy,
  EnemyBaseStats,
  EnemyDefinition,
  Tower,
  TowerBaseStats
} from "../types";
import {
  effectiveUpgradeCountForLevel,
  isMaxHpUpgradeable,
  maxHpGainForEffectiveUpgrades
} from "./upgrades";
import { attackIntervalMs } from "./attackSpeed";
import { towerZealAttackSpeedMultiplier } from "./towerAuras";

export function towerBaseStatsFromDefinition(definition: CardDefinition): TowerBaseStats {
  return {
    maxHp: definition.maxHp,
    armor: definition.armor ?? 0,
    magicResistance: definition.magicResistance ?? 0,
    attackSpeed: definition.attackSpeed,
    damage: definition.damage,
    damageType: definition.damageType
  };
}

export function syncTowerFinalStats(tower: Tower, options: { healMaxHpIncrease?: boolean; towers?: Tower[] } = {}) {
  const previousMaxHp = tower.finalStats?.maxHp ?? tower.maxHp;
  tower.finalStats = calculateTowerFinalStats(tower, options.towers);
  tower.maxHp = tower.finalStats.maxHp;
  tower.baseMaxHp = tower.baseStats.maxHp;
  tower.armor = tower.finalStats.armor;
  tower.magicResistance = tower.finalStats.magicResistance;
  tower.attackSpeed = tower.finalStats.attackSpeed;

  if (options.healMaxHpIncrease && tower.maxHp > previousMaxHp) {
    tower.hp = Math.min(tower.maxHp, tower.hp + tower.maxHp - previousMaxHp);
  } else {
    tower.hp = Math.min(tower.hp, tower.maxHp);
  }
}

export function calculateTowerFinalStats(tower: Tower, towers?: Tower[]) {
  const baseStats = tower.baseStats;
  const effectiveUpgrades = effectiveUpgradeCountForLevel(effectiveTowerStatLevel(tower));
  const maxHp = isMaxHpUpgradeable(tower.type)
    ? baseStats.maxHp + maxHpGainForEffectiveUpgrades(baseStats.maxHp, effectiveUpgrades)
    : baseStats.maxHp;
  const attackSpeed = baseStats.attackSpeed === undefined
    ? undefined
    : baseStats.attackSpeed * towerZealAttackSpeedMultiplier(towers, tower);

  return {
    ...baseStats,
    maxHp,
    attackSpeed
  };
}

export function towerFinalStats(tower: Tower) {
  return tower.finalStats;
}

export function towerBaseStats(tower: Tower) {
  return tower.baseStats;
}

export function effectiveTowerStatLevel(tower: Tower) {
  return Math.max(1, tower.level + tower.levelBonus);
}

export function enemyBaseStatsFromDefinition(
  definition: EnemyDefinition,
  options: { speed: number; attackSpeed: number; finalDamageReduction: number }
): EnemyBaseStats {
  return {
    maxHp: definition.hp,
    armor: definition.armor,
    magicResistance: definition.magicResistance,
    speed: options.speed,
    damage: definition.damage,
    damageType: definition.damageType,
    finalDamageReduction: options.finalDamageReduction,
    attackSpeed: options.attackSpeed,
    attackInterval: attackIntervalMs(options.attackSpeed)
  };
}

export function applyEnemyBaseStats(
  enemy: Enemy,
  baseStats: EnemyBaseStats,
  options: { hpRatio?: number } = {}
) {
  enemy.baseStats = { ...baseStats };
  enemy.finalStats = { ...baseStats };
  enemy.maxHp = baseStats.maxHp;
  enemy.armor = baseStats.armor;
  enemy.magicResistance = baseStats.magicResistance;
  enemy.speed = baseStats.speed;
  enemy.damage = baseStats.damage;
  enemy.damageType = baseStats.damageType;
  enemy.finalDamageReduction = baseStats.finalDamageReduction;
  enemy.attackSpeed = baseStats.attackSpeed;
  enemy.attackInterval = baseStats.attackInterval;

  if (options.hpRatio !== undefined) {
    enemy.hp = Math.max(1, baseStats.maxHp * clamp(options.hpRatio, 0, 1));
  } else {
    enemy.hp = Math.min(enemy.hp, baseStats.maxHp);
  }
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
