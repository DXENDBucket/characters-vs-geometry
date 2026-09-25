import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH } from "../config";
import type { CardDefinition, CardId, EquationAxis, NumberTowerState, SkillState, StatusEffect,
  StoredTowerShot, Tower, TowerBaseStats, TowerFinalStats, TowerHealthPool } from "../types";
import { deploymentCardId } from "./cardIdentity";
import { initialTowerSkillStates } from "./towerSkillRules";

export interface TowerState extends NumberTowerState {
  entityId?: string;
  nullified?: boolean;
  nullifiedUntil?: number;
  deployedAt?: number;
  nextNullificationAt?: number;
  parenthesisGuard?: Tower;
  parenthesisInner?: Tower;
  projectileBank?: { shots: StoredTowerShot[]; remaining: number; nextAt: number; outletIndex: number };
  projectileNode?: {
    input: StoredTowerShot[];
    output: StoredTowerShot[];
    processing?: { shots: StoredTowerShot[]; count: number; completeAt: number };
  };
  nextInterceptionAt?: number;
  healingCredit?: number;
  healingUpdatedAt?: number;
  routedSkills?: Partial<Record<CardId, number>>;
  pipelineSkillContexts?: Partial<Record<CardId, { level: number; stats: TowerFinalStats }>>;
  projectileRouteIndex?: number;
  continuousAttack?: boolean;
  topologyTarget?: { lane: number; column: number };
  topologyOrder?: number;
  numberChannels?: Partial<Record<EquationAxis, NumberTowerState>>;
  imitatedSkillLevels?: Partial<Record<CardId, number>>;
  imitatedSkills?: CardId[];
  copiedType?: CardId;
  sourceCardId?: CardId;
  copyRevision?: number;
  healthPool?: TowerHealthPool;
  unyieldingRatio?: number;
  id: string;
  type: CardId;
  lane: number;
  column: number;
  x: number;
  y: number;
  hp: number;
  baseStats: TowerBaseStats;
  finalStats: TowerFinalStats;
  maxHp: number;
  baseMaxHp: number;
  armor: number;
  magicResistance: number;
  attackSpeed?: number;
  lastFire: number;
  level: number;
  levelBonus: number;
  mirrorLevelBonus: number;
  mirrorGroupId?: number;
  nextProduceAt: number;
  armedAt: number;
  skills: Record<string, SkillState>;
  // Retained in checkpoints for legacy interpolation and checksum compatibility.
  moveVisual?: { fromX: number; fromY: number; startedAt: number; duration: number };
  autoUpgrade: boolean;
  reflectProjectiles: boolean;
  nextRepelDirection: -1 | 1;
  facingDirection: -1 | 1;
  statusEffects: StatusEffect[];
  transient: boolean;
  mirroredEffect: boolean;
  turnTargetId?: string;
  placedOrder: number;
  inPlay: boolean;
  trueDamageUntil: number;
  flyingUntil: number;
}

export function towerBaseStatsFromDefinition(definition: CardDefinition): TowerBaseStats {
  return {
    maxHp: definition.maxHp,
    armor: definition.armor ?? 0,
    magicResistance: definition.magicResistance ?? 0,
    attackSpeed: definition.attackSpeed,
    attackPower: definition.attackPower,
    damageType: definition.damageType
  };
}

export function createTowerState(definition: CardDefinition, lane: number, column: number,
  battleTime: number, placedOrder: number, options: { transient?: boolean; turnTargetId?: string } = {}): TowerState {
  const sourceCardId = definition.id;
  const type = deploymentCardId(sourceCardId);
  const baseStats = towerBaseStatsFromDefinition(definition);
  // Preserve initialization order, sentinels and lazy skill states for existing replays.
  return {
    id: `tower:${placedOrder}`,
    type,
    sourceCardId: sourceCardId !== type ? sourceCardId : undefined,
    lane,
    column,
    x: BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2,
    y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2,
    hp: baseStats.maxHp,
    baseStats,
    finalStats: { ...baseStats },
    maxHp: baseStats.maxHp,
    baseMaxHp: baseStats.maxHp,
    armor: baseStats.armor,
    magicResistance: baseStats.magicResistance,
    attackSpeed: baseStats.attackSpeed,
    lastFire: definition.category === "production" && definition.attackSpeed && definition.produceAmount
      ? battleTime : -Infinity,
    level: 1,
    levelBonus: 0,
    mirrorLevelBonus: 0,
    nextProduceAt: definition.produceEvery ? battleTime + definition.produceEvery : Infinity,
    armedAt: definition.armTime ? battleTime + definition.armTime : 0,
    skills: initialTowerSkillStates(type),
    autoUpgrade: false,
    reflectProjectiles: Boolean(definition.reflectProjectiles),
    nextRepelDirection: placedOrder % 2 === 0 ? -1 : 1,
    facingDirection: 1,
    statusEffects: [],
    transient: Boolean(options.transient),
    mirroredEffect: false,
    turnTargetId: options.turnTargetId,
    placedOrder,
    deployedAt: battleTime,
    inPlay: true,
    trueDamageUntil: 0,
    flyingUntil: 0
  };
}
