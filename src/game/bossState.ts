import {
  BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, BOSS_HITBOX_HEIGHT, BOSS_HITBOX_WIDTH,
  CELL_HEIGHT, CELL_WIDTH, CUBE_BOSS_STATS
} from "../config";
import { bossStatsAtRank, rankedBossFamily } from "../bosses/bossRanks";
import { toRomanNumeral } from "../format";
import type {
  BossBaseStats, BossFinalStats, BossKind, BossSkill, DelLaneSweepState, DelSweepState,
  EnemyKind, PendingBossCopy, StatusEffect
} from "../types";
import { initialBossSkillStates } from "./bossSkillRules";
import { bossRank, isOctahedronBossKind, isSkilllessBossKind } from "./bossRules";
import { enemyKindAtRank } from "./enemyIdentity";

export interface BossState {
  entityId?: string;
  deleteFormatReadyAt?: number;
  delLaneSweep?: DelLaneSweepState<BossState>;
  delEcho?: boolean;
  delSweep?: DelSweepState;
  deleteStackPending?: boolean;
  statusEffects: StatusEffect[];
  kind: BossKind;
  rank: number;
  label: string;
  x: number;
  y: number;
  hitboxWidth: number;
  hitboxHeight: number;
  hp: number;
  baseStats: BossBaseStats;
  finalStats: BossFinalStats;
  maxHp: number;
  armor: number;
  magicResistance: number;
  finalDamageReduction: number;
  speed: number;
  movementAxis?: "x" | "y";
  movementDirection?: -1 | 1;
  advanceMinionKind: EnemyKind;
  hasSkills: boolean;
  skills: {
    promotion: BossSkill<"promotion">;
    advance: BossSkill<"advance">;
    charge?: BossSkill<"charge">;
    impact?: BossSkill<"impact">;
    suppression?: BossSkill<"suppression">;
    desperation?: BossSkill<"desperation">;
    endlessWings?: BossSkill<"endlessWings">;
    ultimateAdvance?: BossSkill<"ultimateAdvance">;
    heartbeatAlpha?: BossSkill<"heartbeatAlpha">;
    heartbeatBeta?: BossSkill<"heartbeatBeta">;
    leap?: BossSkill<"leap">;
    deleteStack?: BossSkill<"deleteStack">;
    deleteFormat?: BossSkill<"deleteFormat">;
  };
  contactAttackBuffer: number;
  chargeExpiresAt: number;
  halfHpTriggered: boolean;
  criticalHpTriggered: boolean;
  pendingCriticalSummon: boolean;
  companionsInitialized: boolean;
  companionDeathsHandled: number;
  invincibleUntil: number;
  bossHasteUntil: number; // Legacy save field; live haste is stored in statusEffects.
  nextBossHasteTrailAt: number;
  octahedronCopies?: BossState[];
  pendingCopies?: PendingBossCopy[];
  octahedronSolarBombsInitialized?: boolean;
  octahedronSpawn75Triggered?: boolean;
  octahedronSpawn50Triggered?: boolean;
  octahedronSpawn25Triggered?: boolean;
}

// Retained in legacy saves, but excluded from battle checksums and pure initialization.
export interface BossRotationState {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  targetVelocityX: number;
  targetVelocityY: number;
  targetVelocityZ: number;
  nextTurnIn: number;
}

export interface CreateBossOptions {
  rank?: number;
  x?: number;
  y?: number;
  movementAxis?: "x" | "y";
  movementDirection?: -1 | 1;
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

export function createBossState(kind: BossKind, finalDamageReduction: number, options: CreateBossOptions = {}): BossState {
  const ranked = rankedBossFamily(kind);
  const rank = ranked ? options.rank ?? bossRank(kind) : bossRank(kind);
  const stats = ranked ? bossStatsAtRank(kind, rank) : CUBE_BOSS_STATS[kind];
  const baseStats = bossBaseStatsFromValues(stats, finalDamageReduction);
  const hitboxWidth = stats.hitboxCells ? CELL_WIDTH * stats.hitboxCells : BOSS_HITBOX_WIDTH;
  const hitboxHeight = stats.hitboxCells ? CELL_HEIGHT * stats.hitboxCells : BOSS_HITBOX_HEIGHT;
  const x = options.x ?? BOARD_X + BOARD_WIDTH - hitboxWidth / 2;
  const y = options.y ?? BOARD_Y + BOARD_HEIGHT / 2;
  return {
    kind,
    rank,
    label: kind === "del" ? "DEL" : toRomanNumeral(rank),
    x,
    y,
    hitboxWidth,
    hitboxHeight,
    hp: baseStats.maxHp,
    baseStats,
    finalStats: { ...baseStats },
    maxHp: baseStats.maxHp,
    armor: baseStats.armor,
    magicResistance: baseStats.magicResistance,
    finalDamageReduction: baseStats.finalDamageReduction,
    speed: baseStats.speed,
    movementAxis: options.movementAxis ?? "x",
    movementDirection: options.movementDirection ?? -1,
    statusEffects: [],
    advanceMinionKind: enemyKindAtRank("square", rank),
    hasSkills: !isSkilllessBossKind(kind),
    skills: initialBossSkillStates(kind),
    contactAttackBuffer: 0,
    chargeExpiresAt: 0,
    halfHpTriggered: false,
    criticalHpTriggered: false,
    pendingCriticalSummon: false,
    companionsInitialized: false,
    companionDeathsHandled: 0,
    invincibleUntil: 0,
    bossHasteUntil: 0,
    nextBossHasteTrailAt: 0,
    octahedronCopies: isOctahedronBossKind(kind) ? [] : undefined,
    octahedronSpawn75Triggered: false,
    octahedronSpawn50Triggered: false,
    octahedronSpawn25Triggered: false
  };
}
