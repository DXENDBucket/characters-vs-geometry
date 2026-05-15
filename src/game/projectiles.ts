import Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, CELL_WIDTH, palette } from "../config";
import { damageEffectColor, damageEffectTextColor } from "../render/combatEffects";
import type {
  CardDefinition,
  CardId,
  DamageType,
  Enemy,
  EnemyProjectile,
  Projectile,
  ProjectileKind,
  Tower
} from "../types";
import { attackRangeRight } from "./targeting";

export interface TowerProjectileSpec {
  type: ProjectileKind;
  x: number;
  y: number;
  lane: number;
  speed: number;
  damage: number;
  damageType: DamageType;
  splashRadius: number;
  angleDegrees: number;
  maxX: number;
}

export function towerProjectileSpecs(tower: Tower, definition: CardDefinition): TowerProjectileSpec[] {
  if (tower.type === "A") {
    return [
      makeProjectileSpec("bolt", tower.x + 24, tower.y, tower.lane, 540, definition, 0, 0)
    ];
  }

  if (tower.type === "E" || tower.type === "M" || tower.type === "W") {
    return fanAnglesFor(tower.type).map((angle) =>
      makeProjectileSpec(
        "bolt",
        tower.type === "E" ? tower.x + 24 : tower.x,
        tower.y,
        tower.lane,
        540,
        definition,
        0,
        angle
      )
    );
  }

  if (tower.type === "I") {
    return [
      makeProjectileSpec(
        "star",
        tower.x + 12,
        tower.y,
        tower.lane,
        540,
        definition,
        0,
        0,
        attackRangeRight(tower, definition)
      )
    ];
  }

  if (tower.type === "C" || tower.type === "J") {
    return [
      makeProjectileSpec(
        tower.type === "J" ? "hash" : "shell",
        tower.x + 22,
        tower.y,
        tower.lane,
        390,
        definition,
        definition.splashRadius ?? CELL_WIDTH,
        0,
        tower.type === "J" ? attackRangeRight(tower, definition) : Number.POSITIVE_INFINITY
      )
    ];
  }

  return [];
}

export function createTowerProjectile(scene: Phaser.Scene, spec: TowerProjectileSpec): Projectile {
  const angle = Phaser.Math.DegToRad(spec.angleDegrees);
  const projectileColor = damageEffectColor(spec.damageType);
  let body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
  if (spec.type === "bolt") {
    body = scene.add.rectangle(spec.x, spec.y, 18, 4, projectileColor, 1);
  } else if (spec.type === "star" || spec.type === "hash") {
    body = scene.add
      .text(spec.x, spec.y - 1, spec.type === "star" ? "*" : "#", {
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
    splashRadius: spec.splashRadius,
    maxX: spec.maxX,
    body
  };
}

export function createEnemyProjectile(scene: Phaser.Scene, enemy: Enemy): EnemyProjectile {
  const body = scene.add.rectangle(enemy.x - 22, enemy.y, 18, 4, palette.enemyShot, 1).setDepth(91);
  body.rotation = Math.PI;
  return {
    x: enemy.x - 22,
    y: enemy.y,
    vx: -430,
    damage: enemy.damage,
    damageType: enemy.damageType,
    sourceLane: enemy.lane,
    body
  };
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

function makeProjectileSpec(
  type: ProjectileKind,
  x: number,
  y: number,
  lane: number,
  speed: number,
  definition: CardDefinition,
  splashRadius: number,
  angleDegrees: number,
  maxX = Number.POSITIVE_INFINITY
): TowerProjectileSpec {
  return {
    type,
    x,
    y,
    lane,
    speed,
    damage: definition.damage ?? 0,
    damageType: definition.damageType ?? "physical",
    splashRadius,
    angleDegrees,
    maxX
  };
}

function fanAnglesFor(type: CardId) {
  if (type === "W") {
    return [-100, -90, -80];
  }
  if (type === "M") {
    return [80, 90, 100];
  }
  return [-10, 0, 10];
}
