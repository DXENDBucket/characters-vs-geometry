import Phaser from "phaser";
import { ATTACK_INTERVAL, ENEMY_SPEED, ENEMY_SPEED_VARIANCE, LANES } from "../config";
import { enemyDefinitions } from "../data/enemies";
import { createEnemyShape } from "../render/unitShapes";
import type { CubeBoss, Enemy, EnemyKind } from "../types";

const PROMOTIONS: Partial<Record<EnemyKind, EnemyKind>> = {
  circle: "circle2",
  circle2: "circle3",
  triangle: "triangle2",
  triangle2: "triangle3",
  square: "square2",
  square2: "square3"
};

const SPLIT_SPAWNS: Partial<Record<EnemyKind, EnemyKind>> = {
  circle2: "circle",
  circle3: "circle2"
};

export function enemyAttackInterval(kind: EnemyKind) {
  if (kind.startsWith("shootingTriangle")) {
    return 2_000;
  }

  if (kind.startsWith("triangle")) {
    return ATTACK_INTERVAL / enemyRank(kind);
  }

  return ATTACK_INTERVAL;
}

export function enemyScaleFromHp(hpRatio: number) {
  return 0.4 + Phaser.Math.Clamp(hpRatio, 0, 1) * 0.6;
}

export function enemyRank(kind: EnemyKind) {
  return Math.max(1, Number.parseInt(enemyDefinitions[kind].label ?? "1", 10));
}

export function promotedKind(kind: EnemyKind) {
  return PROMOTIONS[kind];
}

export function findPromotionTarget(boss: CubeBoss, enemies: Enemy[], fromRank: number) {
  return enemies
    .filter((enemy) => enemyRank(enemy.kind) === fromRank && promotedKind(enemy.kind))
    .sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y))[0];
}

export function applyEnemyPromotion(scene: Phaser.Scene, enemy: Enemy, kind: EnemyKind, battleTime: number) {
  const hpRatio = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
  const definition = enemyDefinitions[kind];
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
  enemy.shape = createEnemyShape(scene, kind, { squareSize: 42, shootingNoseX: -24 });
  enemy.body.add(enemy.shape);
  enemy.shape.setScale(enemyScaleFromHp(enemy.hp / enemy.maxHp));
}

export function splitSpawnKind(kind: EnemyKind) {
  return SPLIT_SPAWNS[kind];
}

export function splitSpawnLanes(lane: number) {
  return [lane - 1, lane, lane + 1].filter((candidate) => candidate >= 0 && candidate < LANES);
}

export function shouldEnemyShoot(enemy: Enemy, time: number) {
  return enemy.kind.startsWith("shootingTriangle") && time >= enemy.attackAt;
}

export function canEnemyMelee(enemy: Enemy) {
  return !enemy.kind.startsWith("shootingTriangle");
}

export function enemyVolleyShotCount(enemy: Enemy) {
  return enemy.kind.startsWith("shootingTriangle") ? enemyRank(enemy.kind) : 1;
}

export function randomizedEnemySpeed(kind: EnemyKind) {
  const definition = enemyDefinitions[kind];
  return (
    ENEMY_SPEED *
    (definition.speedMultiplier ?? 1) *
    Phaser.Math.FloatBetween(1 - ENEMY_SPEED_VARIANCE, 1 + ENEMY_SPEED_VARIANCE)
  );
}
