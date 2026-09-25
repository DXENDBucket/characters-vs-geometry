import Phaser from "phaser";
import { enemyMaximumHp } from "./enemyContainers";
import { syncParenthesisVisual } from "../render/parenthesisEnemy";
import { syncEnemyFacingVisual } from "../render/enemyFacing";
import { battleRandom, isBattlePlayback } from "./battleSimulation";
import { cubePromotionKind } from "../bosses/bossRanks";
import { recordEnemySeen } from "../progress";
import { LANES } from "../config";
import { createEnemyStatusVisuals } from "../render/enemyStatusVisuals";
import {
  enemyFamily,
  enemyIsMace,
  enemyPromotionKind,
  enemyRank,
  enemySplitSpawnKind,
  getEnemyDefinition
} from "../registry/enemies";
import { createEnemyShape } from "../render/unitShapes";
import type { CubeBoss, Enemy, EnemyKind } from "../types";
import { enemyAttackSpeed, enemyIsHighFlying, randomizedEnemySpeed } from "./enemyCombatRules";
import { initialEnemySkillStates } from "./enemySkillRules";
import { enemyIsSolarBomb } from "./enemyIdentity";
import { applyEnemyBaseStats, enemyBaseStatsFromDefinition } from "./unitStats";
import { setScaleIfChanged } from "./visualGuards";

export { syncEnemyFacingVisual } from "../render/enemyFacing";
export { enemyAttackSpeed, enemyAttackInterval, enemyIsBurrowed, enemyIsHighFlying, shouldEnemyShoot,
  canEnemyMelee, enemyIgnoresLeaderRestrictedMechanics, enemyVolleyShotCount,
  randomizedEnemySpeed, siegeRamSpeed } from "./enemyCombatRules";
export { initialEnemySkillStates } from "./enemySkillRules";

const SPLIT_SPAWN_LANES: number[][] = [];
for (let lane = 0; lane < LANES; lane += 1) {
  const lanes: number[] = [];
  for (let candidate = lane - 1; candidate <= lane + 1; candidate += 1) {
    if (candidate >= 0 && candidate < LANES) {
      lanes.push(candidate);
    }
  }
  SPLIT_SPAWN_LANES.push(lanes);
}

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

export function findPromotionTargets(boss: CubeBoss, enemies: Enemy[], maxRank: number, count: number) {
  if (count <= 0) {
    return [];
  }

  const targets: Enemy[] = [];
  const distances: number[] = [];
  for (const enemy of enemies) {
    if (!enemy.inPlay || enemyIsHighFlying(enemy) || !cubePromotionKind(enemy.kind, maxRank)) {
      continue;
    }

    const dx = enemy.x - boss.x;
    const dy = enemy.y - boss.y;
    const distance = dx * dx + dy * dy;
    let insertAt = targets.length;
    const rank = enemyRank(enemy.kind);
    while (insertAt > 0 && (rank > enemyRank(targets[insertAt - 1].kind) ||
      (rank === enemyRank(targets[insertAt - 1].kind) && distance < distances[insertAt - 1]))) {
      insertAt -= 1;
    }

    if (insertAt >= count) {
      continue;
    }

    targets.splice(insertAt, 0, enemy);
    distances.splice(insertAt, 0, distance);
    if (targets.length > count) {
      targets.pop();
      distances.pop();
    }
  }
  return targets;
}

export function applyEnemyPromotion(scene: Phaser.Scene, enemy: Enemy, kind: EnemyKind, battleTime: number) {
  if (!isBattlePlayback(scene)) recordEnemySeen(kind);
  const hpRatio = Phaser.Math.Clamp(enemy.hp / enemyMaximumHp(enemy), 0, 1);
  const definition = getEnemyDefinition(kind);
  const baseStats = enemyBaseStatsFromDefinition(definition, {
    speed: randomizedEnemySpeed(kind, () => battleRandom(scene).next()),
    attackSpeed: enemyAttackSpeed(kind),
    finalDamageReduction: enemy.baseStats.finalDamageReduction
  });
  enemy.kind = kind;
  applyEnemyBaseStats(enemy, baseStats, { hpRatio });
  enemy.attackAt = Math.min(enemy.attackAt, battleTime + enemy.baseStats.attackInterval);
  enemy.maceVelocity = enemyIsMace(kind) ? 0 : undefined;
  enemy.maceFacingDirection = enemyIsMace(kind) ? -1 : undefined;
  enemy.slopeFacingDirection = enemyFamily(kind) === "slopeTriangle" ? enemy.movementDirection ?? -1 : undefined;
  enemy.highFlightStartedAt = undefined;
  enemy.highFlightUntil = undefined;
  enemy.highFlightStartX = undefined;
  enemy.highFlightStartY = undefined;
  enemy.highFlightTargetX = undefined;
  enemy.highFlightTargetY = undefined;
  enemy.highFlightPeakHeight = undefined;
  enemy.angelRamWingsTriggered = false;
  enemy.body.removeAll(true);
  Object.assign(enemy, createEnemyStatusVisuals(scene));
  enemy.shape = createEnemyShape(scene, kind, { squareSize: 42, shootingNoseX: -24 });
  enemy.skills = initialEnemySkillStates(kind);
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

export function splitSpawnKind(kind: EnemyKind) {
  return enemySplitSpawnKind(kind);
}

export function splitSpawnLanes(lane: number) {
  return SPLIT_SPAWN_LANES[lane] ?? [];
}
