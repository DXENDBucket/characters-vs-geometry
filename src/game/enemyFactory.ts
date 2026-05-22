import type Phaser from "phaser";
import { BOARD_Y, CELL_HEIGHT, palette } from "../config";
import { enemyIsMace, getEnemyDefinition } from "../registry/enemies";
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
  movementDirection?: -1 | 1;
  maceFacingDirection?: -1 | 1;
}

export function createEnemy(scene: Phaser.Scene, options: CreateEnemyOptions): Enemy {
  const definition = getEnemyDefinition(options.kind);
  const y = BOARD_Y + options.lane * CELL_HEIGHT + CELL_HEIGHT / 2;
  const attackInterval = enemyAttackInterval(options.kind);
  const speed = randomizedEnemySpeed(options.kind);
  const isBurrowArrow = options.kind === "burrowArrow";
  const body = scene.add.container(options.x, y).setDepth(60 + options.lane);
  const statusBorder = scene.add.circle(0, 0, 28, palette.black, 0).setStrokeStyle(2, palette.magic, 0.92);
  const powerIcon = scene.add
    .text(0, -38, "!", {
      color: "#ff6464",
      fontFamily: "monospace",
      fontSize: "22px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const armorIcon = scene.add
    .text(0, -38, "⬡", {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "22px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const flyingHalo = scene.add.ellipse(0, -42, 30, 8, palette.black, 0).setStrokeStyle(2, palette.white, 0.94);
  const shape = createEnemyShape(scene, options.kind, { squareSize: 42, shootingNoseX: -24 });

  statusBorder.setVisible(false);
  powerIcon.setVisible(false);
  armorIcon.setVisible(false);
  flyingHalo.setVisible(false);
  body.add([statusBorder, flyingHalo, shape, powerIcon, armorIcon]);

  return {
    kind: options.kind,
    waveNumber: options.waveNumber,
    weight: options.waveWeight,
    lane: options.lane,
    spawnX: options.x,
    x: options.x,
    y,
    hp: definition.hp,
    maxHp: definition.hp,
    armor: definition.armor,
    magicResistance: definition.magicResistance,
    speed,
    movementDirection: options.movementDirection ?? -1,
    maceVelocity: enemyIsMace(options.kind) ? 0 : undefined,
    maceFacingDirection: enemyIsMace(options.kind)
      ? options.maceFacingDirection ?? options.movementDirection ?? -1
      : undefined,
    burrowAt: isBurrowArrow ? options.time + 6_000 : undefined,
    burrowed: false,
    burrowUnloaded: false,
    burrowCargo: isBurrowArrow ? [] : undefined,
    angelRamWingsTriggered: false,
    damage: definition.damage,
    damageType: definition.damageType,
    finalDamageReduction: options.finalDamageReduction,
    attackInterval,
    attackAt: options.time + attackInterval,
    skills: {},
    statusEffects: [],
    statusBorder,
    powerIcon,
    armorIcon,
    flyingHalo,
    nextHasteTrailAt: options.time,
    body,
    shape
  };
}
