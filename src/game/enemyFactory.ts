import Phaser from "phaser";
import {
  ATTACK_INTERVAL,
  BOARD_Y,
  CELL_HEIGHT,
  ENEMY_SPEED,
  ENEMY_SPEED_VARIANCE,
  LANES
} from "../config";
import { enemyDefinitions } from "../data/enemies";
import { createEnemyShape } from "../render/unitShapes";
import type { Enemy, EnemyKind } from "../types";

interface CreateEnemyOptions {
  kind: EnemyKind;
  waveNumber: number;
  time: number;
  lane: number;
  x: number;
  waveWeight: number;
  finalDamageReduction: number;
}

export function createEnemy(scene: Phaser.Scene, options: CreateEnemyOptions): Enemy {
  const definition = enemyDefinitions[options.kind];
  const y = BOARD_Y + options.lane * CELL_HEIGHT + CELL_HEIGHT / 2;
  const attackInterval = enemyAttackInterval(options.kind);
  const body = scene.add.container(options.x, y).setDepth(60 + options.lane);
  const shape = createEnemyShape(scene, options.kind, { squareSize: 42, shootingNoseX: -24 });

  body.add([shape]);

  return {
    kind: options.kind,
    waveNumber: options.waveNumber,
    weight: options.waveWeight,
    lane: options.lane,
    x: options.x,
    y,
    hp: definition.hp,
    maxHp: definition.hp,
    armor: definition.armor,
    magicResistance: definition.magicResistance,
    speed:
      ENEMY_SPEED *
      (definition.speedMultiplier ?? 1) *
      Phaser.Math.FloatBetween(1 - ENEMY_SPEED_VARIANCE, 1 + ENEMY_SPEED_VARIANCE),
    damage: definition.damage,
    damageType: definition.damageType,
    finalDamageReduction: options.finalDamageReduction,
    attackInterval,
    attackAt: options.time + attackInterval,
    body,
    shape
  };
}

export function enemyAttackInterval(kind: EnemyKind) {
  if (kind === "shootingTriangle") {
    return 2_000;
  }

  const definition = enemyDefinitions[kind];
  if (kind.startsWith("triangle")) {
    const rank = Number.parseInt(definition.label ?? "1", 10);
    return ATTACK_INTERVAL / Math.max(1, rank);
  }

  return ATTACK_INTERVAL;
}

export function enemyScaleFromHp(hpRatio: number) {
  return 0.4 + Phaser.Math.Clamp(hpRatio, 0, 1) * 0.6;
}

export function splitSpawnKind(kind: EnemyKind) {
  if (kind === "circle3") {
    return "circle2";
  }
  if (kind === "circle2") {
    return "circle";
  }
  return undefined;
}

export function splitSpawnLanes(lane: number) {
  return [lane - 1, lane, lane + 1].filter((candidate) => candidate >= 0 && candidate < LANES);
}
