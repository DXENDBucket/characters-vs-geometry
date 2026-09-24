import Phaser from "phaser";
import { CHEVRON_LEADER } from "../data/chevronLeader";
import { drawIonOrb } from "../render/chevronLeader";
import { attachProjectileTrail } from "../render/projectileTrail";
import { enemyFacingDirection, enemyMovementDirection } from "./rules/reversal";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, CELL_WIDTH, palette } from "../config";
import { enemyFamily } from "../registry/enemies";
import { damageEffectColor, damageEffectTextColor } from "../render/combatEffects";
import type {
  DamageType,
  Enemy,
  EnemyProjectile,
  MortarProjectile,
  Projectile,
  ProjectileKind,
  Tower
} from "../types";
import { enemyAttackDamage } from "./combatStats";
import { projectileVisualScale } from "./projectileIntegrity";
import { createTowerProjectileState, createHomingTowerProjectileState, createMortarProjectileState,
  homingProjectileAngleDegrees, reflectedProjectileSpec,
  type TowerProjectileSpec, type HomingTowerProjectileSpec, type MortarProjectileSpec,
  type ProjectileState, type EnemyProjectileState } from "./projectileState";

export type { TowerProjectileSpec, HomingTowerProjectileSpec, MortarProjectileSpec } from "./projectileState";

export function createTowerProjectile(scene: Phaser.Scene, spec: TowerProjectileSpec): Projectile {
  const state = createTowerProjectileState(spec);
  return Object.assign(state, { body: createTowerProjectileBody(scene, state, spec.angleDegrees) });
}

function createTowerProjectileBody(scene: Phaser.Scene, spec: ProjectileState, angleDegrees: number) {
  const angle = Phaser.Math.DegToRad(angleDegrees);
  const projectileColor = damageEffectColor(spec.damageType);
  let body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
  if (spec.type === "bolt") {
    body = scene.add.rectangle(spec.x, spec.y, 18, 4, projectileColor, 1);
  } else if (spec.type === "star" || spec.type === "hash" || spec.type === "dollar" || spec.type === "chevron") {
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
  body.setScale(projectileVisualScale(spec));
  body.rotation = angle;

  return body;
}

export function createHomingTowerProjectile(scene: Phaser.Scene, spec: HomingTowerProjectileSpec): Projectile {
  const state = createHomingTowerProjectileState(spec);
  return Object.assign(state, { body: createTowerProjectileBody(scene, state, homingProjectileAngleDegrees(spec)) });
}

export function createEnemyProjectile(scene: Phaser.Scene, enemy: Enemy, time: number, hitCount = 1): EnemyProjectile {
  const isDiamondShot = enemyFamily(enemy.kind) === "diamond";
  const direction = enemyMovementDirection(enemy);
  const shotX = enemy.x + direction * 22;
  return restoreEnemyProjectile(scene, { x: shotX, y: enemy.y, hitCount, vx: direction * 430,
    damage: enemyAttackDamage(enemy, time), damageType: enemy.damageType, sourceLane: enemy.lane,
    appearance: isDiamondShot ? "star" : "bolt" });
}

export function restoreEnemyProjectile(scene: Phaser.Scene, state: EnemyProjectileState): EnemyProjectile {
  const isDiamondShot = state.appearance === "star";
  const body = state.appearance === "ion" ? scene.add.graphics().setPosition(state.x, state.y).setDepth(91) : isDiamondShot
    ? scene.add
        .text(state.x, state.y - 1, "*", {
          color: "#ff6464",
          fontFamily: "monospace",
          fontSize: "22px",
          fontStyle: "700"
        })
        .setOrigin(0.5)
        .setDepth(91)
    : scene.add.rectangle(state.x, state.y, 18, 4, palette.enemyShot, 1).setDepth(91);
  if (state.appearance === "ion") drawIonOrb(body as Phaser.GameObjects.Graphics);
  body.rotation = isDiamondShot ? 0 : state.vx < 0 ? Math.PI : 0;
  body.setScale(projectileVisualScale(state));
  return {
    ...state,
    body
  };
}

export function createIonProjectile(scene: Phaser.Scene, enemy: Enemy, time: number): EnemyProjectile {
  const direction = enemyFacingDirection(enemy);
  return restoreEnemyProjectile(scene, {
    x: enemy.x + direction * 12, y: enemy.y, vx: direction * CHEVRON_LEADER.projectileSpeed,
    appearance: "ion", sourceLane: enemy.lane, hitCount: 1,
    damage: enemyAttackDamage(enemy, time) * CHEVRON_LEADER.attackMultiplier, damageType: "magic",
    splashRadius: CHEVRON_LEADER.radiusCells * CELL_WIDTH
  });
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

  const trailColor = spec.marker === "text"
    ? Phaser.Display.Color.HexStringToColor(spec.markerTextColor ?? damageEffectTextColor(spec.damageType)).color
    : projectileColor;
  attachProjectileTrail(scene, body, trailColor, 119);
  body.setScale(projectileVisualScale(spec));

  return Object.assign(createMortarProjectileState(spec), { body });
}

export function createReflectedProjectile(
  scene: Phaser.Scene,
  projectile: EnemyProjectile,
  damageType: DamageType = projectile.damageType,
  sourceTower?: Tower
): Projectile {
  return createTowerProjectile(scene, reflectedProjectileSpec(projectile, damageType, sourceTower));
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
  if (type === "chevron") {
    return ">";
  }
  return "$";
}
