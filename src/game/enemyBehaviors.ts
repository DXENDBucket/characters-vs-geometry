import Phaser from "phaser";
import { enemyMaximumHp } from "./enemyContainers";
import { syncParenthesisVisual } from "../render/parenthesisEnemy";
import { syncEnemyFacingVisual } from "../render/enemyFacing";
import { battleRandom, isBattlePlayback } from "./battleSimulation";
import { applyEnemyPromotion as applyPromotion } from "./enemyPromotionRules";
import { observeBattleEnemy } from "./battleDiscovery";
import { createEnemyStatusVisuals } from "../render/enemyStatusVisuals";
import {
  enemyFamily,
  enemyPromotionKind
} from "../registry/enemies";
import { createEnemyShape } from "../render/unitShapes";
import type { Enemy, EnemyKind } from "../types";
import { enemyIsSolarBomb } from "./enemyIdentity";
import { setScaleIfChanged } from "./visualGuards";

export { syncEnemyFacingVisual } from "../render/enemyFacing";
export { enemyAttackSpeed, enemyAttackInterval, enemyIsBurrowed, enemyIsHighFlying, shouldEnemyShoot,
  canEnemyMelee, enemyIgnoresLeaderRestrictedMechanics, enemyVolleyShotCount,
  randomizedEnemySpeed, siegeRamSpeed } from "./enemyCombatRules";
export { initialEnemySkillStates } from "./enemySkillRules";

export function enemyScaleFromHp(hpRatio: number) {
  return 0.4 + Phaser.Math.Clamp(hpRatio, 0, 1) * 0.6;
}

export function enemyVisualScale(enemy: Enemy) {
  return enemyScaleFromHp(enemy.hp / enemyMaximumHp(enemy));
}

export function syncEnemyVisualScale(enemy: Enemy) {
  if (enemyFamily(enemy.kind) === "parentheses") {
    setScaleIfChanged(enemy.shape, 1, 1);
    syncParenthesisVisual(enemy, enemyVisualScale(enemy));
    return;
  }
  if (enemyIsSolarBomb(enemy)) {
    setScaleIfChanged(enemy.shape, 1, 1);
    return;
  }

  setScaleIfChanged(enemy.shape, enemyVisualScale(enemy));
}

export function promotedKind(kind: EnemyKind) {
  return enemyPromotionKind(kind);
}

export { findPromotionTargets } from "./enemyPromotionRules";

export function applyEnemyPromotion(scene: Phaser.Scene, enemy: Enemy, kind: EnemyKind, battleTime: number) {
  if (!isBattlePlayback(scene)) observeBattleEnemy(scene, kind);
  applyPromotion(enemy, kind, battleTime, () => battleRandom(scene).next());
  syncPromotedEnemyVisual(scene, enemy);
}

export function syncPromotedEnemyVisual(scene: Phaser.Scene, enemy: Enemy) {
  enemy.body.removeAll(true);
  Object.assign(enemy, createEnemyStatusVisuals(scene));
  enemy.shape = createEnemyShape(scene, enemy.kind, { squareSize: 42, shootingNoseX: -24 });
  enemy.body.add([
    enemy.frozenBorder,
    enemy.statusBorder,
    enemy.flyingHalo,
    enemy.shape,
    enemy.powerIcon,
    enemy.sunderIcon,
    enemy.armorIcon,
    enemy.magicResistanceIcon
  ]);
  syncEnemyFacingVisual(enemy);
  syncEnemyVisualScale(enemy);
}

export { splitSpawnKind, splitSpawnLanes } from "./enemySplitRules";
