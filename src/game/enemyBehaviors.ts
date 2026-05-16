import Phaser from "phaser";
import { ATTACK_INTERVAL, ENEMY_SPEED, ENEMY_SPEED_VARIANCE, LANES, palette } from "../config";
import {
  enemyFamily,
  enemyIsBlockedDetonator,
  enemyIsRanged,
  enemyPromotionKind,
  enemyRank,
  enemySplitSpawnKind,
  getEnemyDefinition
} from "../registry/enemies";
import { createEnemyShape } from "../render/unitShapes";
import type { CubeBoss, Enemy, EnemyKind } from "../types";

export function enemyAttackInterval(kind: EnemyKind) {
  if (enemyIsRanged(kind)) {
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

export function promotedKind(kind: EnemyKind) {
  return enemyPromotionKind(kind);
}

export function findPromotionTarget(boss: CubeBoss, enemies: Enemy[], fromRank: number) {
  return enemies
    .filter((enemy) => enemyRank(enemy.kind) === fromRank && promotedKind(enemy.kind))
    .sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y))[0];
}

export function applyEnemyPromotion(scene: Phaser.Scene, enemy: Enemy, kind: EnemyKind, battleTime: number) {
  const hpRatio = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
  const definition = getEnemyDefinition(kind);
  enemy.kind = kind;
  enemy.maxHp = definition.hp;
  enemy.hp = Math.max(1, definition.hp * hpRatio);
  enemy.armor = definition.armor;
  enemy.magicResistance = definition.magicResistance;
  enemy.damage = definition.damage;
  enemy.damageType = definition.damageType;
  enemy.attackInterval = enemyAttackInterval(kind);
  enemy.attackAt = Math.min(enemy.attackAt, battleTime + enemy.attackInterval);
  enemy.speed = randomizedEnemySpeed(kind);
  enemy.body.removeAll(true);
  enemy.statusBorder = scene.add.circle(0, 0, 28, palette.black, 0).setStrokeStyle(2, palette.magic, 0.92);
  enemy.statusBorder.setVisible(false);
  enemy.powerIcon = scene.add
    .text(0, -38, "⚔", {
      color: "#ff6464",
      fontFamily: "Segoe UI Emoji, sans-serif",
      fontSize: "18px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  enemy.powerIcon.setVisible(false);
  enemy.shape = createEnemyShape(scene, kind, { squareSize: 42, shootingNoseX: -24 });
  enemy.body.add([enemy.statusBorder, enemy.shape, enemy.powerIcon]);
  enemy.shape.setScale(enemyScaleFromHp(enemy.hp / enemy.maxHp));
}

export function splitSpawnKind(kind: EnemyKind) {
  return enemySplitSpawnKind(kind);
}

export function splitSpawnLanes(lane: number) {
  return [lane - 1, lane, lane + 1].filter((candidate) => candidate >= 0 && candidate < LANES);
}

export function shouldEnemyShoot(enemy: Enemy, time: number) {
  return enemyIsRanged(enemy.kind) && time >= enemy.attackAt;
}

export function canEnemyMelee(enemy: Enemy) {
  return !enemyIsRanged(enemy.kind) && !enemyIsBlockedDetonator(enemy.kind);
}

export function enemyVolleyShotCount(enemy: Enemy) {
  return enemyIsRanged(enemy.kind) ? enemyRank(enemy.kind) : 1;
}

export function randomizedEnemySpeed(kind: EnemyKind) {
  const definition = getEnemyDefinition(kind);
  return (
    ENEMY_SPEED *
    (definition.speedMultiplier ?? 1) *
    Phaser.Math.FloatBetween(1 - ENEMY_SPEED_VARIANCE, 1 + ENEMY_SPEED_VARIANCE)
  );
}
