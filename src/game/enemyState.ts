import { BOARD_Y, CELL_HEIGHT, LANES } from "../config";
import { ARCHANGEL_ENTRY } from "../data/enemyAbilities";
import { enemyFamily, enemyIsMace, getEnemyDefinition } from "../registry/enemies";
import type { BossCompanionActionPhase, DamageType, EnemyBaseStats, EnemyDefinition,
  EnemyFinalStats, EnemyHealthPool, EnemyKind, SkillState, StatusEffect } from "../types";
import { attackIntervalMs } from "./attackSpeed";
import { enemyAttackSpeed, randomizedEnemySpeed } from "./enemyCombatRules";
import { initialEnemySkillStates } from "./enemySkillRules";
import { refreshStatusEffect } from "./rules/statusEffectRules";

export interface EnemyState {
  entityId?: string;
  healthPool?: EnemyHealthPool<EnemyState>;
  healthLinksInitialized?: boolean;
  kind: EnemyKind;
  waveNumber: number;
  weight: number;
  lane: number;
  spawnX: number;
  x: number;
  y: number;
  hp: number;
  baseStats: EnemyBaseStats;
  finalStats: EnemyFinalStats;
  maxHp: number;
  armor: number;
  magicResistance: number;
  speed: number;
  movementDirection?: -1 | 1;
  maceVelocity?: number;
  chevronAssault?: boolean;
  ionChargeMs?: number;
  maceFacingDirection?: -1 | 1;
  solarBombVelocityX?: number;
  solarBombVelocityY?: number;
  solarBombDepleted?: boolean;
  solarBombLastCollisionAt?: number;
  burrowAt?: number;
  burrowed?: boolean;
  burrowUnloaded?: boolean;
  burrowCargo?: EnemyState[];
  parenthesisCargo?: EnemyState[];
  parenthesisCarrier?: EnemyState;
  parenthesisHpBonus?: number;
  environmentHpMultiplier?: number;
  slopeFacingDirection?: -1 | 1;
  highFlightStartedAt?: number;
  highFlightUntil?: number;
  highFlightStartX?: number;
  highFlightStartY?: number;
  highFlightTargetX?: number;
  highFlightTargetY?: number;
  highFlightPeakHeight?: number;
  damage: number;
  damageType: DamageType;
  finalDamageReduction: number;
  attackSpeed: number;
  attackInterval: number;
  attackAt: number;
  blockedByTowerId?: string;
  blockedSince?: number;
  angelRamWingsTriggered?: boolean;
  skills: Record<string, SkillState>;
  statusEffects: StatusEffect[];
  // Retained for checkpoint compatibility even though it schedules a visual trail.
  nextHasteTrailAt: number;
  inPlay: boolean;
  bossOrbitAngle?: number;
  bossOrbitRadius?: number;
  bossCompanionIndex?: number;
  bossCompanionNextActionAt?: number;
  oscillationCenterY?: number;
  oscillationPhase?: number;
  oscillationLastY?: number;
  bossCompanionActionPhase?: BossCompanionActionPhase;
}

export interface CreateEnemyOptions {
  environmentHpMultiplier?: number;
  kind: EnemyKind;
  waveNumber: number;
  time: number;
  lane: number;
  x: number;
  waveWeight: number;
  finalDamageReduction: number;
  movementDirection?: -1 | 1;
  maceFacingDirection?: -1 | 1;
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
    attackPower: definition.attackPower,
    attackMultiplier: definition.attackMultiplier,
    damageType: definition.damageType,
    finalDamageReduction: options.finalDamageReduction,
    attackSpeed: options.attackSpeed,
    attackInterval: attackIntervalMs(options.attackSpeed)
  };
}

export function createEnemyState(options: CreateEnemyOptions, random: () => number): EnemyState {
  const definition = getEnemyDefinition(options.kind);
  const family = enemyFamily(options.kind);
  const y = family === "tilde"
    ? BOARD_Y + (Math.min(LANES - 2, options.lane) + 1) * CELL_HEIGHT
    : BOARD_Y + options.lane * CELL_HEIGHT + CELL_HEIGHT / 2;
  const attackSpeed = enemyAttackSpeed(options.kind);
  const speed = randomizedEnemySpeed(options.kind, random);
  const baseStats = enemyBaseStatsFromDefinition(definition, {
    speed,
    attackSpeed,
    finalDamageReduction: options.finalDamageReduction
  });
  const isBurrowArrow = family === "burrowArrow";
  const environmentHpMultiplier = options.environmentHpMultiplier ?? 1;
  const maxHp = baseStats.maxHp * environmentHpMultiplier;
  const movementDirection = options.movementDirection ?? -1;
  // Keep initialization order and optional sentinels stable for existing replay checksums.
  const skills = initialEnemySkillStates(options.kind);

  const enemy: EnemyState = {
    kind: options.kind,
    waveNumber: options.waveNumber,
    weight: options.waveWeight,
    lane: Math.min(LANES - 1, Math.floor((y - BOARD_Y) / CELL_HEIGHT)),
    oscillationCenterY: family === "tilde" ? y : undefined,
    oscillationPhase: family === "tilde" ? 0 : undefined,
    oscillationLastY: family === "tilde" ? y : undefined,
    spawnX: options.x,
    x: options.x,
    y,
    hp: maxHp,
    environmentHpMultiplier,
    baseStats,
    finalStats: { ...baseStats, maxHp },
    maxHp,
    armor: baseStats.armor,
    magicResistance: baseStats.magicResistance,
    speed: baseStats.speed,
    movementDirection,
    solarBombVelocityX: options.kind === "solarBomb" ? movementDirection * baseStats.speed : undefined,
    solarBombVelocityY: options.kind === "solarBomb" ? 0 : undefined,
    solarBombDepleted: false,
    solarBombLastCollisionAt: 0,
    maceVelocity: enemyIsMace(options.kind) ? 0 : undefined,
    chevronAssault: family === "chevronLeader" ? false : undefined,
    ionChargeMs: family === "chevronLeader" ? 0 : undefined,
    maceFacingDirection: enemyIsMace(options.kind)
      ? options.maceFacingDirection ?? movementDirection
      : undefined,
    burrowAt: isBurrowArrow ? options.time + 6_000 : undefined,
    burrowed: false,
    burrowUnloaded: false,
    burrowCargo: isBurrowArrow ? [] : undefined,
    slopeFacingDirection: family === "slopeTriangle" ? movementDirection : undefined,
    angelRamWingsTriggered: false,
    damage: baseStats.damage,
    damageType: baseStats.damageType,
    finalDamageReduction: baseStats.finalDamageReduction,
    attackSpeed: baseStats.attackSpeed,
    attackInterval: baseStats.attackInterval,
    attackAt: options.time + baseStats.attackInterval,
    skills,
    statusEffects: [],
    nextHasteTrailAt: options.time,
    inPlay: true
  };

  if (family === "archangelHeptagon") {
    enemy.statusEffects.push({ name: "flying", expiresAt: Number.POSITIVE_INFINITY, speedMultiplier: 1, showHalo: false });
    refreshStatusEffect(enemy, "highFlying", options.time + ARCHANGEL_ENTRY.highFlightDuration,
      ARCHANGEL_ENTRY.speedMultiplier, false);
  }
  return enemy;
}
