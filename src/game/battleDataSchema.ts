import type { BossRotationState, BossState } from "./bossState";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";
import type { EnemyProjectileState, MortarProjectileState, ProjectileState } from "./projectileState";
import { rankedBossFamily } from "../bosses/bossRanks";
import type { NodeKind } from "./saveGraph";
import type { BattleEntityKind } from "./battleEntityIds";
import type { EdgeTower } from "../types";

const towerFields = new Set(Object.keys({
  entityId: true, ownerId: true,
  nullified: true, nullifiedUntil: true, deployedAt: true, nextNullificationAt: true,
  parenthesisGuard: true, parenthesisInner: true, projectileBank: true, projectileNode: true,
  nextInterceptionAt: true, healingCredit: true, healingUpdatedAt: true, routedSkills: true,
  pipelineSkillContexts: true, projectileRouteIndex: true, continuousAttack: true,
  topologyTarget: true, topologyOrder: true, numberChannels: true, imitatedSkillLevels: true,
  imitatedSkills: true, copiedType: true, sourceCardId: true, copyRevision: true,
  healthPool: true, unyieldingRatio: true, id: true, type: true, lane: true, column: true,
  x: true, y: true, hp: true, baseStats: true, finalStats: true, maxHp: true, baseMaxHp: true,
  armor: true, magicResistance: true, attackSpeed: true, lastFire: true, level: true,
  levelBonus: true, mirrorLevelBonus: true, mirrorGroupId: true, nextProduceAt: true,
  armedAt: true, skills: true, moveVisual: true, autoUpgrade: true, reflectProjectiles: true,
  nextRepelDirection: true, facingDirection: true, statusEffects: true, transient: true,
  mirroredEffect: true, turnTargetId: true, placedOrder: true, inPlay: true,
  trueDamageUntil: true, flyingUntil: true, numberMemory: true, numberValue: true, equationLevel: true
} satisfies Record<keyof TowerState, true>));
const enemyFields = new Set(Object.keys({
  entityId: true,
  healthPool: true, healthLinksInitialized: true, kind: true, waveNumber: true,
  weight: true, lane: true, spawnX: true, x: true,
  y: true, hp: true, baseStats: true, finalStats: true,
  maxHp: true, armor: true, magicResistance: true, speed: true,
  movementDirection: true, maceVelocity: true, chevronAssault: true, ionChargeMs: true,
  maceFacingDirection: true, solarBombVelocityX: true, solarBombVelocityY: true, solarBombDepleted: true,
  solarBombLastCollisionAt: true, burrowAt: true, burrowed: true, burrowUnloaded: true,
  burrowCargo: true, parenthesisCargo: true, parenthesisCarrier: true, parenthesisHpBonus: true,
  environmentHpMultiplier: true, slopeFacingDirection: true, highFlightStartedAt: true, highFlightUntil: true,
  highFlightStartX: true, highFlightStartY: true, highFlightTargetX: true, highFlightTargetY: true,
  highFlightPeakHeight: true, damage: true, damageType: true, finalDamageReduction: true,
  attackSpeed: true, attackInterval: true, attackAt: true, blockedByTowerId: true,
  blockedSince: true, angelRamWingsTriggered: true, skills: true, statusEffects: true,
  nextHasteTrailAt: true, inPlay: true, bossOrbitAngle: true, bossOrbitRadius: true,
  bossCompanionIndex: true, bossCompanionNextActionAt: true, oscillationCenterY: true, oscillationPhase: true,
  oscillationLastY: true, bossCompanionActionPhase: true
} satisfies Record<keyof EnemyState, true>));
const bossFields = new Set(Object.keys({
  entityId: true,
  deleteFormatReadyAt: true, delLaneSweep: true, delEcho: true, delSweep: true, deleteStackPending: true,
  statusEffects: true, kind: true, rank: true, label: true, x: true, y: true,
  hitboxWidth: true, hitboxHeight: true, hp: true, baseStats: true, finalStats: true,
  maxHp: true, armor: true, magicResistance: true, finalDamageReduction: true, speed: true,
  movementAxis: true, movementDirection: true, advanceMinionKind: true, hasSkills: true, skills: true,
  contactAttackBuffer: true, chargeExpiresAt: true, halfHpTriggered: true, criticalHpTriggered: true,
  pendingCriticalSummon: true, companionsInitialized: true, companionDeathsHandled: true,
  invincibleUntil: true, bossHasteUntil: true, nextBossHasteTrailAt: true,
  octahedronCopies: true, pendingCopies: true, octahedronSolarBombsInitialized: true,
  octahedronSpawn75Triggered: true, octahedronSpawn50Triggered: true, octahedronSpawn25Triggered: true
} satisfies Record<keyof BossState, true>));
// Old saves retain cosmetic rotation. It is not part of authoritative Boss state.
for (const key of Object.keys({
  rotationX: true, rotationY: true, rotationZ: true, velocityX: true, velocityY: true, velocityZ: true,
  targetVelocityX: true, targetVelocityY: true, targetVelocityZ: true, nextTurnIn: true
} satisfies Record<keyof BossRotationState, true>)) bossFields.add(key);

// Record covers optional fields too. Filtering retains the original object's field order and graph IDs.
const projectileFields = new Set(Object.keys({
  entityId: true,
  circuitChecked: true, sourceBehaviorType: true, lastGatheredAt: true,
  type: true, lane: true, x: true, y: true, vx: true, vy: true,
  damage: true, hitCount: true, partialHitDamage: true, initialDamageBudget: true,
  damageType: true, debuff: true, debuffDuration: true, splashRadius: true,
  maxX: true, limitDirection: true, targetEnemy: true, targetBossPart: true,
  sourceTower: true, speed: true, acceleration: true, maxSpeed: true
} satisfies Record<keyof ProjectileState, true>));
const enemyProjectileFields = new Set(Object.keys({
  entityId: true,
  lastGatheredAt: true, appearance: true, splashRadius: true,
  damage: true, hitCount: true, partialHitDamage: true, initialDamageBudget: true,
  x: true, y: true, vx: true, damageType: true, sourceLane: true,
  vy: true, targetTower: true, speed: true, acceleration: true, maxSpeed: true
} satisfies Record<keyof EnemyProjectileState, true>));
const mortarFields = new Set(Object.keys({
  entityId: true,
  damage: true, hitCount: true, partialHitDamage: true, initialDamageBudget: true,
  owner: true, x: true, y: true, fromX: true, fromY: true, targetX: true, targetY: true,
  progress: true, duration: true, damageType: true, rangeX: true, rangeY: true,
  marker: true, markerText: true, markerTextColor: true, sourceEnemy: true, sourceTower: true,
  targetEnemy: true, targetTower: true, singleTarget: true, hitRadius: true, radialFalloff: true,
  debuff: true, debuffDuration: true, shiftSelfDamageApplied: true
} satisfies Record<keyof MortarProjectileState, true>));

const edgeFields = new Set(Object.keys({
  entityId: true, ownerId: true, type: true, mode: true, level: true, autoUpgrade: true, flowCredit: true,
  flowUpdatedAt: true, axis: true, lane: true, column: true
} satisfies Record<keyof EdgeTower, true>));

export interface BattleDataClassification { kind: NodeKind; entityKind?: BattleEntityKind; include?: ReadonlySet<string> }

export function classifyBattleData(object: object): BattleDataClassification {
  const value = object as Record<string, unknown>;
  if (typeof value.id === "string" && value.id.startsWith("tower:")) return { kind: "tower", entityKind: "tower", include: towerFields };
  if ("kind" in value && "waveNumber" in value) return { kind: "enemy", entityKind: "enemy", include: enemyFields };
  if ("advanceMinionKind" in value && "rank" in value) {
    if (!rankedBossFamily(value.kind) && value.kind !== "icosahedron" && value.kind !== "del") throw new Error("Unsupported boss save");
    return { kind: "boss", entityKind: "boss", include: bossFields };
  }
  if ("owner" in value && "fromX" in value && "progress" in value) return { kind: "mortar", entityKind: "mortar", include: mortarFields };
  if ("sourceLane" in value && "vx" in value) return { kind: "enemyProjectile", entityKind: "enemyProjectile", include: enemyProjectileFields };
  if ("type" in value && "limitDirection" in value && "vx" in value) return { kind: "projectile", entityKind: "projectile", include: projectileFields };
  if (value.type === "=" && (value.axis === "horizontal" || value.axis === "vertical")) return { kind: "object", entityKind: "edge", include: edgeFields };
  if ("body" in value || (!Array.isArray(object) && Object.getPrototypeOf(object) !== Object.prototype)) {
    throw new Error("Non-data object in save");
  }
  return { kind: Array.isArray(object) ? "array" : "object" };
}
