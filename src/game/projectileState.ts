import * as battleMath from "./battleMath";
import type { CardId, DamageType, ProjectileKind, StatusEffectName } from "../types";
import type { BossState as CubeBoss } from "./bossState";
import type { EnemyState as Enemy } from "./enemyState";
import type { TowerState as Tower } from "./towerState";
import type { ProjectileIntegrity } from "./projectileIntegrity";
import { towerActionContext, towerBehaviorType } from "./towerIdentity";

export interface ProjectileState extends ProjectileIntegrity {
  entityId?: string;
  circuitChecked?: boolean;
  sourceBehaviorType?: CardId;
  lastGatheredAt?: number;
  type: ProjectileKind;
  lane: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damageType: DamageType;
  debuff?: StatusEffectName;
  debuffDuration?: number;
  splashRadius: number;
  maxX: number;
  limitDirection: -1 | 1;
  targetEnemy?: Enemy;
  targetBossPart?: CubeBoss;
  sourceTower?: Tower;
  speed?: number;
  acceleration?: number;
  maxSpeed?: number;
}

export interface EnemyProjectileState extends ProjectileIntegrity {
  entityId?: string;
  lastGatheredAt?: number;
  appearance?: "bolt" | "star" | "ion" | "chevron";
  splashRadius?: number;
  x: number;
  y: number;
  vx: number;
  damageType: DamageType;
  sourceLane: number;
  vy?: number;
  targetTower?: Tower;
  speed?: number;
  acceleration?: number;
  maxSpeed?: number;
}

export interface MortarProjectileState extends ProjectileIntegrity {
  entityId?: string;
  owner: "enemy" | "tower";
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  progress: number;
  duration: number;
  damageType: DamageType;
  rangeX: number;
  rangeY: number;
  marker?: "shell" | "text";
  markerText?: string;
  markerTextColor?: string;
  sourceEnemy?: Enemy;
  sourceTower?: Tower;
  targetEnemy?: Enemy;
  targetTower?: Tower;
  singleTarget?: boolean;
  hitRadius?: number;
  radialFalloff?: boolean;
  debuff?: StatusEffectName;
  debuffDuration?: number;
  shiftSelfDamageApplied?: boolean;
}

export interface TowerProjectileSpec extends ProjectileIntegrity {
  type: ProjectileKind;
  x: number;
  y: number;
  lane: number;
  speed: number;
  damageType: DamageType;
  debuff?: StatusEffectName;
  debuffDuration?: number;
  splashRadius: number;
  angleDegrees: number;
  maxX: number;
  limitDirection?: -1 | 1;
  sourceTower?: Tower;
}

export interface HomingTowerProjectileSpec {
  x: number;
  y: number;
  lane: number;
  speed: number;
  acceleration: number;
  maxSpeed: number;
  damage: number;
  damageType: DamageType;
  targetEnemy?: Enemy;
  targetBossPart?: CubeBoss;
  sourceTower?: Tower;
}

export interface MortarProjectileSpec extends ProjectileIntegrity {
  owner: "enemy" | "tower";
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  damageType: DamageType;
  rangeX: number;
  rangeY: number;
  marker?: "shell" | "text";
  markerText?: string;
  markerTextColor?: string;
  sourceEnemy?: Enemy;
  sourceTower?: Tower;
  targetEnemy?: Enemy;
  targetTower?: Tower;
  duration?: number;
  singleTarget?: boolean;
  hitRadius?: number;
  radialFalloff?: boolean;
  debuff?: StatusEffectName;
  debuffDuration?: number;
}

export function createTowerProjectileState(spec: TowerProjectileSpec): ProjectileState {
  // Match the original degree conversion and field order for replay checkpoints.
  const angle = spec.angleDegrees * (Math.PI / 180);
  return {
    type: spec.type,
    hitCount: spec.hitCount ?? 1,
    partialHitDamage: spec.partialHitDamage,
    initialDamageBudget: spec.initialDamageBudget,
    lane: spec.lane,
    x: spec.x,
    y: spec.y,
    vx: battleMath.cos(angle) * spec.speed,
    vy: battleMath.sin(angle) * spec.speed,
    damage: spec.damage,
    damageType: spec.damageType,
    debuff: spec.debuff,
    debuffDuration: spec.debuffDuration,
    splashRadius: spec.splashRadius,
    maxX: spec.maxX,
    limitDirection: spec.limitDirection ?? (battleMath.cos(angle) < 0 ? -1 : 1),
    sourceTower: spec.sourceTower,
    sourceBehaviorType: spec.sourceTower && (spec.sourceTower.type === "@" || towerActionContext(spec.sourceTower))
      ? towerBehaviorType(spec.sourceTower) : undefined
  };
}

export function homingProjectileAngleDegrees(spec: HomingTowerProjectileSpec) {
  const target = spec.targetEnemy ?? spec.targetBossPart;
  return (target ? battleMath.atan2(target.y - spec.y, target.x - spec.x) : 0) * (180 / Math.PI);
}

export function createHomingTowerProjectileState(spec: HomingTowerProjectileSpec): ProjectileState {
  const projectile = createTowerProjectileState({
    type: "chevron", x: spec.x, y: spec.y, lane: spec.lane, speed: spec.speed,
    damage: spec.damage, damageType: spec.damageType, splashRadius: 0,
    angleDegrees: homingProjectileAngleDegrees(spec), maxX: Infinity, limitDirection: 1,
    sourceTower: spec.sourceTower
  });
  projectile.targetEnemy = spec.targetEnemy;
  projectile.targetBossPart = spec.targetBossPart;
  projectile.speed = spec.speed;
  projectile.acceleration = spec.acceleration;
  projectile.maxSpeed = spec.maxSpeed;
  return projectile;
}

export function createMortarProjectileState(spec: MortarProjectileSpec): MortarProjectileState {
  return {
    owner: spec.owner,
    hitCount: spec.hitCount ?? 1,
    partialHitDamage: spec.partialHitDamage,
    initialDamageBudget: spec.initialDamageBudget,
    x: spec.fromX,
    y: spec.fromY,
    fromX: spec.fromX,
    fromY: spec.fromY,
    targetX: spec.targetX,
    targetY: spec.targetY,
    progress: 0,
    duration: spec.duration ?? 3_240,
    damage: spec.damage,
    damageType: spec.damageType,
    rangeX: spec.rangeX,
    rangeY: spec.rangeY,
    marker: spec.marker,
    markerText: spec.markerText,
    markerTextColor: spec.markerTextColor,
    sourceEnemy: spec.sourceEnemy,
    sourceTower: spec.sourceTower,
    targetEnemy: spec.targetEnemy,
    targetTower: spec.targetTower,
    singleTarget: spec.singleTarget,
    hitRadius: spec.hitRadius,
    radialFalloff: spec.radialFalloff,
    debuff: spec.debuff,
    debuffDuration: spec.debuffDuration
  };
}

export function reflectedProjectileSpec(projectile: EnemyProjectileState,
  damageType: DamageType = projectile.damageType, sourceTower?: Tower): TowerProjectileSpec {
  const reflectedAngle = projectile.appearance === "chevron"
    ? battleMath.atan2(-(projectile.vy ?? 0), -projectile.vx) * 180 / Math.PI
    : projectile.vx < 0 ? 0 : 180;
  return {
    type: projectile.splashRadius ? "shell" : "bolt",
    hitCount: projectile.hitCount,
    partialHitDamage: projectile.partialHitDamage,
    initialDamageBudget: projectile.initialDamageBudget,
    x: projectile.x, y: projectile.y, lane: projectile.sourceLane,
    speed: projectile.appearance === "chevron" ? battleMath.sqrt(battleMath.square(projectile.vx) + battleMath.square(projectile.vy ?? 0)) : Math.abs(projectile.vx), damage: projectile.damage, damageType,
    splashRadius: projectile.splashRadius ?? 0, angleDegrees: reflectedAngle,
    maxX: Math.abs(reflectedAngle) > 90 ? -Infinity : Infinity,
    limitDirection: Math.abs(reflectedAngle) > 90 ? -1 : 1, sourceTower
  };
}
