import Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, palette } from "../config";
import { enemyFamily } from "../registry/enemies";
import { damageEffectColor, damageEffectTextColor } from "../render/combatEffects";
import type {
  DamageType,
  Enemy,
  EnemyProjectile,
  MortarProjectile,
  Projectile,
  ProjectileKind,
  StatusEffectName,
  Tower
} from "../types";
import { statusAttackMultiplier } from "./statusEffects";

export interface TowerProjectileSpec {
  type: ProjectileKind;
  x: number;
  y: number;
  lane: number;
  speed: number;
  damage: number;
  damageType: DamageType;
  debuff?: StatusEffectName;
  debuffDuration?: number;
  splashRadius: number;
  angleDegrees: number;
  maxX: number;
  limitDirection?: -1 | 1;
}

export function createTowerProjectile(scene: Phaser.Scene, spec: TowerProjectileSpec): Projectile {
  const angle = Phaser.Math.DegToRad(spec.angleDegrees);
  const projectileColor = damageEffectColor(spec.damageType);
  let body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
  if (spec.type === "bolt") {
    body = scene.add.rectangle(spec.x, spec.y, 18, 4, projectileColor, 1);
  } else if (spec.type === "star" || spec.type === "hash" || spec.type === "dollar") {
    body = scene.add
      .text(spec.x, spec.y - 1, projectileText(spec.type), {
        color: damageEffectTextColor(spec.damageType),
        fontFamily: "monospace",
        fontSize: "22px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
  } else {
    body = scene.add.circle(spec.x, spec.y, 7, palette.black, 1).setStrokeStyle(2, projectileColor, 1);
  }
  body.setDepth(90);
  body.rotation = angle;

  return {
    type: spec.type,
    lane: spec.lane,
    x: spec.x,
    y: spec.y,
    vx: Math.cos(angle) * spec.speed,
    vy: Math.sin(angle) * spec.speed,
    damage: spec.damage,
    damageType: spec.damageType,
    debuff: spec.debuff,
    debuffDuration: spec.debuffDuration,
    splashRadius: spec.splashRadius,
    maxX: spec.maxX,
    limitDirection: spec.limitDirection ?? (Math.cos(angle) < 0 ? -1 : 1),
    body
  };
}

export function createEnemyProjectile(scene: Phaser.Scene, enemy: Enemy, time: number): EnemyProjectile {
  const isDiamondShot = enemyFamily(enemy.kind) === "diamond";
  const direction = enemy.movementDirection ?? -1;
  const shotX = enemy.x + direction * 22;
  const body = isDiamondShot
    ? scene.add
        .text(shotX, enemy.y - 1, "*", {
          color: "#ff6464",
          fontFamily: "monospace",
          fontSize: "22px",
          fontStyle: "700"
        })
        .setOrigin(0.5)
        .setDepth(91)
    : scene.add.rectangle(shotX, enemy.y, 18, 4, palette.enemyShot, 1).setDepth(91);
  body.rotation = isDiamondShot ? 0 : direction < 0 ? Math.PI : 0;
  return {
    x: shotX,
    y: enemy.y,
    vx: direction * 430,
    damage: enemy.damage * statusAttackMultiplier(enemy, time),
    damageType: enemy.damageType,
    sourceLane: enemy.lane,
    body
  };
}

export interface MortarProjectileSpec {
  owner: "enemy" | "tower";
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  damage: number;
  damageType: DamageType;
  rangeX: number;
  rangeY: number;
  marker?: "shell" | "text";
  markerText?: string;
  markerTextColor?: string;
  sourceEnemy?: Enemy;
  targetEnemy?: Enemy;
  targetTower?: Tower;
  duration?: number;
  singleTarget?: boolean;
  hitRadius?: number;
  radialFalloff?: boolean;
  debuff?: StatusEffectName;
  debuffDuration?: number;
}

export function createMortarProjectile(scene: Phaser.Scene, spec: MortarProjectileSpec): MortarProjectile {
  const projectileColor = spec.owner === "enemy" ? palette.enemyShot : damageEffectColor(spec.damageType);
  const body =
    spec.marker === "text"
      ? scene.add
          .text(spec.fromX, spec.fromY - 1, spec.markerText ?? "#", {
            color: spec.markerTextColor ?? damageEffectTextColor(spec.damageType),
            fontFamily: "monospace",
            fontSize: "24px",
            fontStyle: "700"
          })
          .setOrigin(0.5)
          .setDepth(120)
      : scene.add.circle(spec.fromX, spec.fromY, 7, palette.black, 1).setStrokeStyle(2, projectileColor, 1).setDepth(120);

  return {
    owner: spec.owner,
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
    targetEnemy: spec.targetEnemy,
    targetTower: spec.targetTower,
    singleTarget: spec.singleTarget,
    hitRadius: spec.hitRadius,
    radialFalloff: spec.radialFalloff,
    debuff: spec.debuff,
    debuffDuration: spec.debuffDuration,
    body
  };
}

export function createReflectedProjectile(
  scene: Phaser.Scene,
  projectile: EnemyProjectile,
  damageType: DamageType = projectile.damageType
): Projectile {
  const reflectedAngle = projectile.vx < 0 ? 0 : 180;
  return createTowerProjectile(scene, {
    type: "bolt",
    x: projectile.x,
    y: projectile.y,
    lane: projectile.sourceLane,
    speed: Math.abs(projectile.vx),
    damage: projectile.damage,
    damageType,
    splashRadius: 0,
    angleDegrees: reflectedAngle,
    maxX: reflectedAngle === 180 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    limitDirection: reflectedAngle === 180 ? -1 : 1
  });
}

export function isTowerProjectileOutOfBounds(projectile: Projectile, reachedLimitX: boolean) {
  return (
    reachedLimitX ||
    projectile.x < BOARD_X - 60 ||
    projectile.x > BOARD_X + BOARD_WIDTH + 52 ||
    projectile.y < BOARD_Y - 60 ||
    projectile.y > BOARD_Y + BOARD_HEIGHT + 60
  );
}

export function isEnemyProjectileOutOfBounds(projectile: EnemyProjectile) {
  return projectile.x < BOARD_X - 60 || projectile.x > BOARD_X + BOARD_WIDTH + 60;
}

function projectileText(type: ProjectileKind) {
  if (type === "star") {
    return "*";
  }
  if (type === "hash") {
    return "#";
  }
  return "$";
}
