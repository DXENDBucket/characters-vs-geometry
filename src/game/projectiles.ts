import Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, palette } from "../config";
import { damageEffectColor, damageEffectTextColor } from "../render/combatEffects";
import type { DamageType, Enemy, EnemyProjectile, Projectile, ProjectileKind, StatusEffectName } from "../types";
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
    body
  };
}

export function createEnemyProjectile(scene: Phaser.Scene, enemy: Enemy, time: number): EnemyProjectile {
  const body = scene.add.rectangle(enemy.x - 22, enemy.y, 18, 4, palette.enemyShot, 1).setDepth(91);
  body.rotation = Math.PI;
  return {
    x: enemy.x - 22,
    y: enemy.y,
    vx: -430,
    damage: enemy.damage * statusAttackMultiplier(enemy, time),
    damageType: enemy.damageType,
    sourceLane: enemy.lane,
    body
  };
}

export function createReflectedProjectile(scene: Phaser.Scene, projectile: EnemyProjectile): Projectile {
  return createTowerProjectile(scene, {
    type: "bolt",
    x: projectile.x,
    y: projectile.y,
    lane: projectile.sourceLane,
    speed: Math.abs(projectile.vx),
    damage: projectile.damage,
    damageType: projectile.damageType,
    splashRadius: 0,
    angleDegrees: projectile.vx < 0 ? 0 : 180,
    maxX: Number.POSITIVE_INFINITY
  });
}

export function isTowerProjectileOutOfBounds(projectile: Projectile, reachedMaxX: boolean) {
  return (
    reachedMaxX ||
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
