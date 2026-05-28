import Phaser from "phaser";
import { ATTACK_INTERVAL, CELL_WIDTH, ENEMY_SPEED, ENEMY_SPEED_VARIANCE, LANES, palette } from "../config";
import {
  enemyFamily,
  enemyIsBlockedDetonator,
  enemyIsBossCompanion,
  enemyIsLaser,
  enemyIsLeader,
  enemyIsMace,
  enemyIsMortar,
  enemyIsRanged,
  enemyIsSiegeRam,
  enemyPromotionKind,
  enemyRank,
  enemySplitSpawnKind,
  getEnemyDefinition
} from "../registry/enemies";
import { createEnemyShape } from "../render/unitShapes";
import type { CubeBoss, Enemy, EnemyKind } from "../types";
import { applyEnemyBaseStats, enemyBaseStatsFromDefinition } from "./unitStats";

export function enemyAttackInterval(kind: EnemyKind) {
  if (enemyIsLaser(kind)) {
    return 4_000;
  }

  if (enemyIsMortar(kind)) {
    return 15_000;
  }

  if (enemyIsRanged(kind)) {
    return 2_000;
  }

  if (enemyFamily(kind) === "heart") {
    return 5_000;
  }

  if (enemyFamily(kind) === "chargingHexagon") {
    return 2_000;
  }

  if (enemyFamily(kind) === "archangelHeptagon") {
    return 2_000;
  }

  if (enemyFamily(kind) === "triangle") {
    return ATTACK_INTERVAL / enemyRank(kind);
  }

  return ATTACK_INTERVAL;
}

export function enemyScaleFromHp(hpRatio: number) {
  return 0.4 + Phaser.Math.Clamp(hpRatio, 0, 1) * 0.6;
}

export function enemyVisualScale(enemy: Enemy) {
  return enemyScaleFromHp(enemy.hp / enemy.baseStats.maxHp);
}

export function syncEnemyVisualScale(enemy: Enemy) {
  enemy.shape.setScale(enemyVisualScale(enemy));
}

export function enemyIsBurrowed(enemy: Enemy) {
  return enemy.burrowed === true;
}

export function enemyIsHighFlying(enemy: Enemy) {
  return enemy.highFlightUntil !== undefined || enemy.statusEffects.some((effect) => effect.name === "highFlying");
}

export function promotedKind(kind: EnemyKind) {
  return enemyPromotionKind(kind);
}

export function findPromotionTargets(boss: CubeBoss, enemies: Enemy[], fromRank: number, count: number) {
  return enemies
    .filter((enemy) => !enemyIsHighFlying(enemy) && enemyRank(enemy.kind) === fromRank && promotedKind(enemy.kind))
    .sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y))
    .slice(0, count);
}

export function applyEnemyPromotion(scene: Phaser.Scene, enemy: Enemy, kind: EnemyKind, battleTime: number) {
  const hpRatio = Phaser.Math.Clamp(enemy.hp / enemy.baseStats.maxHp, 0, 1);
  const definition = getEnemyDefinition(kind);
  const baseStats = enemyBaseStatsFromDefinition(definition, {
    speed: randomizedEnemySpeed(kind),
    attackInterval: enemyAttackInterval(kind),
    finalDamageReduction: enemy.baseStats.finalDamageReduction
  });
  enemy.kind = kind;
  applyEnemyBaseStats(enemy, baseStats, { hpRatio });
  enemy.attackAt = Math.min(enemy.attackAt, battleTime + enemy.baseStats.attackInterval);
  enemy.maceVelocity = enemyIsMace(kind) ? 0 : undefined;
  enemy.maceFacingDirection = enemyIsMace(kind) ? -1 : undefined;
  enemy.slopeFacingDirection = kind === "slopeTriangle" ? enemy.movementDirection ?? -1 : undefined;
  enemy.highFlightStartedAt = undefined;
  enemy.highFlightUntil = undefined;
  enemy.highFlightStartX = undefined;
  enemy.highFlightStartY = undefined;
  enemy.highFlightTargetX = undefined;
  enemy.highFlightTargetY = undefined;
  enemy.highFlightPeakHeight = undefined;
  enemy.angelRamWingsTriggered = false;
  enemy.body.removeAll(true);
  enemy.statusBorder = scene.add.circle(0, 0, 28, palette.black, 0).setStrokeStyle(2, palette.magic, 0.92);
  enemy.statusBorder.setVisible(false);
  enemy.powerIcon = scene.add
    .text(0, -38, "!", {
      color: "#ff6464",
      fontFamily: "monospace",
      fontSize: "22px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  enemy.powerIcon.setVisible(false);
  enemy.armorIcon = scene.add
    .text(0, -38, "⬡", {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "22px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  enemy.armorIcon.setVisible(false);
  enemy.magicResistanceIcon = scene.add
    .text(0, -38, "✦", {
      color: "#9fdcff",
      fontFamily: "monospace",
      fontSize: "22px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  enemy.magicResistanceIcon.setVisible(false);
  enemy.flyingHalo = scene.add.ellipse(0, -42, 30, 8, palette.black, 0).setStrokeStyle(2, palette.white, 0.94);
  enemy.flyingHalo.setVisible(false);
  enemy.shape = createEnemyShape(scene, kind, { squareSize: 42, shootingNoseX: -24 });
  enemy.skills = {};
  enemy.body.add([enemy.statusBorder, enemy.flyingHalo, enemy.shape, enemy.powerIcon, enemy.armorIcon, enemy.magicResistanceIcon]);
  syncEnemyVisualScale(enemy);
}

export function splitSpawnKind(kind: EnemyKind) {
  return enemySplitSpawnKind(kind);
}

export function splitSpawnLanes(lane: number) {
  return [lane - 1, lane, lane + 1].filter((candidate) => candidate >= 0 && candidate < LANES);
}

export function shouldEnemyShoot(enemy: Enemy, time: number) {
  return (enemyIsRanged(enemy.kind) || enemyIsMortar(enemy.kind) || enemyIsLaser(enemy.kind)) && time >= enemy.attackAt;
}

export function canEnemyMelee(enemy: Enemy) {
  return (
    !enemyIsRanged(enemy.kind) &&
    !enemyIsMortar(enemy.kind) &&
    !enemyIsLaser(enemy.kind) &&
    !enemyIsBlockedDetonator(enemy.kind) &&
    !enemyIsSiegeRam(enemy.kind) &&
    !enemyIsMace(enemy.kind) &&
    enemyFamily(enemy.kind) !== "heart" &&
    enemyFamily(enemy.kind) !== "hexSpellBulwark" &&
    enemyFamily(enemy.kind) !== "slopeTriangle" &&
    !enemyIsBossCompanion(enemy.kind)
  );
}

export function enemyVolleyShotCount(enemy: Enemy) {
  return enemyIsRanged(enemy.kind) || enemyIsMortar(enemy.kind) || enemyIsLaser(enemy.kind) ? enemyRank(enemy.kind) : 1;
}

export function randomizedEnemySpeed(kind: EnemyKind) {
  const definition = getEnemyDefinition(kind);
  const baseSpeed = ENEMY_SPEED * (definition.speedMultiplier ?? 1);
  if (enemyIsLeader(kind)) {
    return baseSpeed;
  }

  return baseSpeed * Phaser.Math.FloatBetween(1 - ENEMY_SPEED_VARIANCE, 1 + ENEMY_SPEED_VARIANCE);
}

export function siegeRamSpeed(enemy: Enemy) {
  if (!enemyIsSiegeRam(enemy.kind)) {
    return enemy.baseStats.speed;
  }

  const accelerationDistance = 7 * CELL_WIDTH;
  const traveled = Math.max(0, enemy.spawnX - enemy.x);
  const progress = Phaser.Math.Clamp(traveled / accelerationDistance, 0, 1);
  const multiplier = Math.sqrt(1 + 15 * progress);
  return enemy.baseStats.speed * multiplier;
}
