import type Phaser from "phaser";
import { BOARD_Y, CELL_HEIGHT, palette } from "../config";
import { enemyFamily, enemyIsMace, getEnemyDefinition } from "../registry/enemies";
import { createEnemyShape } from "../render/unitShapes";
import type { Enemy, EnemyKind } from "../types";
import { enemyAttackSpeed, initialEnemySkillStates, randomizedEnemySpeed, syncEnemyFacingVisual } from "./enemyBehaviors";
import { enemyIsSolarBomb, syncSolarBombVisual } from "./solarBomb";
import { applyStatusEffect, statusSpeedMultiplier } from "./statusEffects";
import { enemyBaseStatsFromDefinition } from "./unitStats";

const ARCHANGEL_SPAWN_HIGH_FLIGHT_DURATION = 3_000;
const ARCHANGEL_SPAWN_SPEED_MULTIPLIER = 2.5;

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
  const attackSpeed = enemyAttackSpeed(options.kind);
  const speed = randomizedEnemySpeed(options.kind);
  const baseStats = enemyBaseStatsFromDefinition(definition, {
    speed,
    attackSpeed,
    finalDamageReduction: options.finalDamageReduction
  });
  const isBurrowArrow = enemyFamily(options.kind) === "burrowArrow";
  const family = enemyFamily(options.kind);
  const movementDirection = options.movementDirection ?? -1;
  const body = scene.add.container(options.x, y).setDepth(60 + options.lane);
  const statusBorder = scene.add.circle(0, 0, 28, palette.black, 0).setStrokeStyle(2, palette.magic, 0.92);
  const frozenBorder = scene.add.rectangle(0, 0, 56, 56, palette.black, 0).setStrokeStyle(3, palette.magic, 0.92);
  const powerIcon = scene.add
    .text(0, -38, "!", {
      color: "#ff6464",
      fontFamily: "monospace",
      fontSize: "22px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const sunderIcon = scene.add
    .text(0, -56, "▣", {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "20px",
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
  const magicResistanceIcon = scene.add
    .text(0, -38, "⬡", {
      color: "#9fdcff",
      fontFamily: "monospace",
      fontSize: "22px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const flyingHalo = scene.add.ellipse(0, -42, 30, 8, palette.black, 0).setStrokeStyle(2, palette.white, 0.94);
  const shape = createEnemyShape(scene, options.kind, { squareSize: 42, shootingNoseX: -24 });

  statusBorder.setVisible(false);
  frozenBorder.setVisible(false);
  powerIcon.setVisible(false);
  sunderIcon.setVisible(false);
  armorIcon.setVisible(false);
  magicResistanceIcon.setVisible(false);
  flyingHalo.setVisible(false);
  body.add([frozenBorder, statusBorder, flyingHalo, shape, powerIcon, sunderIcon, armorIcon, magicResistanceIcon]);

  const skills = initialEnemySkillStates(options.kind);

  const enemy: Enemy = {
    kind: options.kind,
    waveNumber: options.waveNumber,
    weight: options.waveWeight,
    lane: options.lane,
    spawnX: options.x,
    x: options.x,
    y,
    hp: baseStats.maxHp,
    baseStats,
    finalStats: { ...baseStats },
    maxHp: baseStats.maxHp,
    armor: baseStats.armor,
    magicResistance: baseStats.magicResistance,
    speed: baseStats.speed,
    movementDirection,
    solarBombVelocityX: options.kind === "solarBomb" ? movementDirection * baseStats.speed : undefined,
    solarBombVelocityY: options.kind === "solarBomb" ? 0 : undefined,
    solarBombDepleted: false,
    solarBombLastCollisionAt: 0,
    maceVelocity: enemyIsMace(options.kind) ? 0 : undefined,
    maceFacingDirection: enemyIsMace(options.kind)
      ? options.maceFacingDirection ?? movementDirection
      : undefined,
    burrowAt: isBurrowArrow ? options.time + 6_000 : undefined,
    burrowed: false,
    burrowUnloaded: false,
    burrowCargo: isBurrowArrow ? [] : undefined,
    slopeFacingDirection: family === "slopeTriangle" ? movementDirection : undefined,
    angelRamWingsTriggered: false,
    damage: baseStats.damage,
    damageType: baseStats.damageType,
    finalDamageReduction: baseStats.finalDamageReduction,
    attackSpeed: baseStats.attackSpeed,
    attackInterval: baseStats.attackInterval,
    attackAt: options.time + baseStats.attackInterval,
    skills,
    statusEffects: [],
    statusMultiplierCache: {
      speed: 1,
      attack: 1,
      armor: 1,
      visualSyncedAt: Number.NaN,
      visualSyncedX: Number.NaN,
      visualSyncedY: Number.NaN
    },
    statusBorder,
    frozenBorder,
    powerIcon,
    sunderIcon,
    armorIcon,
    magicResistanceIcon,
    flyingHalo,
    nextHasteTrailAt: options.time,
    inPlay: true,
    body,
    shape
  };

  if (family === "archangelHeptagon") {
    enemy.statusEffects.push({ name: "flying", expiresAt: Number.POSITIVE_INFINITY, speedMultiplier: 1, showHalo: false });
    applyStatusEffect(
      enemy,
      "highFlying",
      ARCHANGEL_SPAWN_HIGH_FLIGHT_DURATION,
      options.time,
      ARCHANGEL_SPAWN_SPEED_MULTIPLIER,
      false
    );
    statusSpeedMultiplier(enemy, options.time);
    enemy.body.setDepth(85 + enemy.lane);
  }

  if (enemyIsSolarBomb(enemy)) {
    syncSolarBombVisual(enemy);
  }

  syncEnemyFacingVisual(enemy);

  return enemy;
}
