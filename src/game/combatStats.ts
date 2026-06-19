import type { CubeBoss, Enemy, Tower } from "../types";
import {
  enemySupportBonuses,
  type EnemySupportBonuses,
  type EnemySupportSources,
  hexBossArmorBonus
} from "./enemySupport";
import { movementSpeedMultiplier, type SlowAuraSources } from "./slowAura";
import { statusMultipliers, type StatusMultipliers } from "./statusEffects";

const DODECAHEDRON_COMPANION_DAMAGE_REDUCTION = 0.95;

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
  status?: StatusMultipliers;
  support?: EnemySupportBonuses;
  supportSources?: EnemySupportSources;
  slowAuraSources?: SlowAuraSources;
}

export function syncEnemyFinalStats(enemy: Enemy, context: EnemyFinalStatsContext = {}) {
  const baseStats = enemy.baseStats;
  const finalStats = enemy.finalStats;
  const includeDefense = context.includeDefense ?? Boolean(context.enemies);
  const includeMovement = context.includeMovement ?? false;
  const includeAttack = context.includeAttack ?? false;
  const status = context.status ?? (context.time !== undefined && (includeMovement || includeDefense || includeAttack)
    ? statusMultipliers(enemy, context.time)
    : undefined);
  const statusSpeed = includeMovement ? status?.speed ?? 1 : 1;
  const statusArmor = includeDefense ? status?.armor ?? 1 : 1;
  const support = context.support ?? (context.enemies && (includeDefense || includeMovement)
    ? enemySupportBonuses(context.enemies, enemy, { includeDefense, includeMovement, sources: context.supportSources })
    : undefined);
  const supportSpeed = includeMovement ? support?.speedMultiplier ?? 1 : 1;
  const terrainSpeed = includeMovement && context.towers
    ? movementSpeedMultiplier(context.towers, context.x ?? enemy.x, context.y ?? enemy.y, context.slowAuraSources)
    : 1;
  const attackMultiplier = includeAttack ? status?.attack ?? 1 : 1;

  const armor = includeDefense && context.enemies
    ? (baseStats.armor + (support?.armor ?? 0)) * statusArmor
    : finalStats.armor;
  const magicResistance = includeDefense && context.enemies
    ? baseStats.magicResistance + (support?.magicResistance ?? 0)
    : finalStats.magicResistance;
  const speed = includeMovement
    ? (context.baseSpeed ?? baseStats.speed) * statusSpeed * supportSpeed * terrainSpeed
    : finalStats.speed;
  const damage = includeAttack ? baseStats.damage * attackMultiplier : finalStats.damage;

  finalStats.maxHp = baseStats.maxHp;
  finalStats.armor = armor;
  finalStats.magicResistance = magicResistance;
  finalStats.speed = speed;
  finalStats.damage = damage;
  finalStats.damageType = baseStats.damageType;
  finalStats.finalDamageReduction = baseStats.finalDamageReduction;
  finalStats.attackSpeed = baseStats.attackSpeed;
  finalStats.attackInterval = baseStats.attackInterval;
  return finalStats;
}

export function enemyDefenseStats(enemy: Enemy, enemies: Enemy[], time?: number) {
  return syncEnemyFinalStats(enemy, { enemies, time, includeDefense: true });
}

export function enemyAttackDamage(enemy: Enemy, time: number) {
  return syncEnemyFinalStats(enemy, { time, includeAttack: true }).damage;
}

export function enemyAttackMultiplier(enemy: Enemy, time: number) {
  const status = statusMultipliers(enemy, time);
  syncEnemyFinalStats(enemy, { time, includeAttack: true, status });
  return status.attack;
}

export function enemyMovementSpeed(
  enemy: Enemy,
  context: {
    enemies: Enemy[];
    towers: Tower[];
    time: number;
    x?: number;
    y?: number;
    status?: StatusMultipliers;
    support?: EnemySupportBonuses;
    supportSources?: EnemySupportSources;
    slowAuraSources?: SlowAuraSources;
  },
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
  context: {
    enemies: Enemy[];
    towers: Tower[];
    time: number;
    x?: number;
    y?: number;
    status?: StatusMultipliers;
    support?: EnemySupportBonuses;
    supportSources?: EnemySupportSources;
    slowAuraSources?: SlowAuraSources;
  },
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

export function bossFinalStats(boss: CubeBoss, enemies: Enemy[], rootBoss: CubeBoss = boss) {
  const bodyCountReduction = octahedronBodyDamageReduction(rootBoss);
  const companionReduction = dodecahedronCompanionDamageReduction(rootBoss, enemies);
  const finalStats = boss.finalStats;
  finalStats.maxHp = boss.baseStats.maxHp;
  finalStats.armor = boss.baseStats.armor + hexBossArmorBonus(enemies, boss);
  finalStats.magicResistance = boss.baseStats.magicResistance;
  finalStats.speed = boss.baseStats.speed;
  finalStats.finalDamageReduction = combineDamageReduction(
    combineDamageReduction(boss.baseStats.finalDamageReduction, bodyCountReduction),
    companionReduction
  );
  return finalStats;
}

function dodecahedronCompanionDamageReduction(rootBoss: CubeBoss, enemies: Enemy[]) {
  if (rootBoss.kind !== "dodecahedron" && rootBoss.kind !== "dodecahedron2") {
    return 0;
  }

  for (const enemy of enemies) {
    if (enemyIsDodecahedronCompanion(enemy)) {
      return DODECAHEDRON_COMPANION_DAMAGE_REDUCTION;
    }
  }
  return 0;
}

function enemyIsDodecahedronCompanion(enemy: Enemy) {
  return enemy.kind === "dodecahedronCompanion" || enemy.kind === "dodecahedronCompanion2";
}

function octahedronBodyDamageReduction(rootBoss: CubeBoss) {
  if (rootBoss.kind !== "octahedron" && rootBoss.kind !== "octahedron2") {
    return 0;
  }

  const bodyCount = 1 + (rootBoss.octahedronCopies?.length ?? 0);
  if (bodyCount >= 4) {
    return 0.6;
  }
  if (bodyCount === 3) {
    return 0.4;
  }
  if (bodyCount === 2) {
    return 0.2;
  }
  return 0;
}

function combineDamageReduction(baseReduction: number, extraReduction: number) {
  return 1 - (1 - baseReduction) * (1 - extraReduction);
}
