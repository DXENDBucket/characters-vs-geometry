import type Phaser from "phaser";
import { BOARD_Y, CELL_HEIGHT } from "../config";
import { getEnemyDefinition } from "../registry/enemies";
import { createEnemyShape } from "../render/unitShapes";
import type { Enemy, EnemyKind } from "../types";
import { enemyAttackInterval, randomizedEnemySpeed } from "./enemyBehaviors";

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
  const definition = getEnemyDefinition(options.kind);
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
    speed: randomizedEnemySpeed(options.kind),
    damage: definition.damage,
    damageType: definition.damageType,
    finalDamageReduction: options.finalDamageReduction,
    attackInterval,
    attackAt: options.time + attackInterval,
    statusEffects: [],
    body,
    shape
  };
}
