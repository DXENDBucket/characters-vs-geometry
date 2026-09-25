import Phaser from "phaser";
import { createEnemyProjectileState, createIonProjectileState } from "./enemyProjectileRules";
import { drawIonOrb } from "../render/chevronLeader";
import { attachProjectileTrail } from "../render/projectileTrail";
import { palette } from "../config";
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
import { projectileVisualScale } from "./projectileIntegrity";
import { identifyBattleEntity } from "./battleEntityIds";
import { createTowerProjectileState, createHomingTowerProjectileState, createMortarProjectileState,
  homingProjectileAngleDegrees, reflectedProjectileSpec,
  type TowerProjectileSpec, type HomingTowerProjectileSpec, type MortarProjectileSpec,
  type ProjectileState, type EnemyProjectileState } from "./projectileState";

export type { TowerProjectileSpec, HomingTowerProjectileSpec, MortarProjectileSpec } from "./projectileState";
export { isTowerProjectileOutOfBounds, isEnemyProjectileOutOfBounds } from "./projectileBounds";

export function createTowerProjectile(scene: Phaser.Scene, spec: TowerProjectileSpec): Projectile {
  const state = createTowerProjectileState(spec);
  return identifyBattleEntity(scene, "projectile", Object.assign(state, { body: createTowerProjectileBody(scene, state, spec.angleDegrees) }) as Projectile);
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
  return identifyBattleEntity(scene, "projectile", Object.assign(state, { body: createTowerProjectileBody(scene, state, homingProjectileAngleDegrees(spec)) }) as Projectile);
}

export function createEnemyProjectile(scene: Phaser.Scene, enemy: Enemy, time: number, hitCount = 1): EnemyProjectile {
  return restoreEnemyProjectile(scene, createEnemyProjectileState(enemy, time, hitCount));
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
  return identifyBattleEntity(scene, "enemyProjectile", {
    ...state,
    body
  });
}

export function createIonProjectile(scene: Phaser.Scene, enemy: Enemy, time: number): EnemyProjectile {
  return restoreEnemyProjectile(scene, createIonProjectileState(enemy, time));
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

  return identifyBattleEntity(scene, "mortar", Object.assign(createMortarProjectileState(spec), { body }) as MortarProjectile);
}

export function createReflectedProjectile(
  scene: Phaser.Scene,
  projectile: EnemyProjectile,
  damageType: DamageType = projectile.damageType,
  sourceTower?: Tower
): Projectile {
  return createTowerProjectile(scene, reflectedProjectileSpec(projectile, damageType, sourceTower));
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
