import type Phaser from "phaser";
import { battleRandom, isBattlePlayback } from "./battleSimulation";
import { recordEnemySeen } from "../progress";
import { BOARD_Y, CELL_HEIGHT, LANES } from "../config";
import { createEnemyStatusVisuals } from "../render/enemyStatusVisuals";
import { enemyFamily, enemyIsMace, getEnemyDefinition } from "../registry/enemies";
import { createEnemyShape } from "../render/unitShapes";
import type { Enemy, EnemyKind } from "../types";
import { enemyAttackSpeed, initialEnemySkillStates, randomizedEnemySpeed, syncEnemyFacingVisual } from "./enemyBehaviors";
import { enemyIsSolarBomb, syncSolarBombVisual } from "./solarBomb";
import { applyStatusEffect, statusSpeedMultiplier } from "./statusEffects";
import { enemyBaseStatsFromDefinition } from "./unitStats";

export const ARCHANGEL_SPAWN_HIGH_FLIGHT_DURATION = 3_000;
export const ARCHANGEL_SPAWN_SPEED_MULTIPLIER = 2.5;

interface CreateEnemyOptions {
  environmentHpMultiplier?: number;
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
  if (!isBattlePlayback(scene)) recordEnemySeen(options.kind);
  const definition = getEnemyDefinition(options.kind);
  const family = enemyFamily(options.kind);
  const y = family === "tilde"
    ? BOARD_Y + (Math.min(LANES - 2, options.lane) + 1) * CELL_HEIGHT
    : BOARD_Y + options.lane * CELL_HEIGHT + CELL_HEIGHT / 2;
  const attackSpeed = enemyAttackSpeed(options.kind);
  const speed = randomizedEnemySpeed(options.kind, () => battleRandom(scene).next());
  const baseStats = enemyBaseStatsFromDefinition(definition, {
    speed,
    attackSpeed,
    finalDamageReduction: options.finalDamageReduction
  });
  const isBurrowArrow = family === "burrowArrow";
  const environmentHpMultiplier = options.environmentHpMultiplier ?? 1;
  const maxHp = baseStats.maxHp * environmentHpMultiplier;
  const movementDirection = options.movementDirection ?? -1;
  const body = scene.add.container(options.x, y).setDepth(60 + options.lane);
  const { statusBorder, frozenBorder, powerIcon, sunderIcon, armorIcon, magicResistanceIcon, flyingHalo } =
    createEnemyStatusVisuals(scene);
  const shape = createEnemyShape(scene, options.kind, { squareSize: 42, shootingNoseX: -24 });

  body.add([frozenBorder, statusBorder, flyingHalo, shape, powerIcon, sunderIcon, armorIcon, magicResistanceIcon]);

  const skills = initialEnemySkillStates(options.kind);

  const enemy: Enemy = {
    kind: options.kind,
    waveNumber: options.waveNumber,
    weight: options.waveWeight,
    lane: Math.min(LANES - 1, Math.floor((y - BOARD_Y) / CELL_HEIGHT)),
    oscillationCenterY: family === "tilde" ? y : undefined,
    oscillationPhase: family === "tilde" ? 0 : undefined,
    oscillationLastY: family === "tilde" ? y : undefined,
    spawnX: options.x,
    x: options.x,
    y,
    hp: maxHp,
    environmentHpMultiplier,
    baseStats,
    finalStats: { ...baseStats, maxHp },
    maxHp,
    armor: baseStats.armor,
    magicResistance: baseStats.magicResistance,
    speed: baseStats.speed,
    movementDirection,
    solarBombVelocityX: options.kind === "solarBomb" ? movementDirection * baseStats.speed : undefined,
    solarBombVelocityY: options.kind === "solarBomb" ? 0 : undefined,
    solarBombDepleted: false,
    solarBombLastCollisionAt: 0,
    maceVelocity: enemyIsMace(options.kind) ? 0 : undefined,
    chevronAssault: family === "chevronLeader" ? false : undefined,
    ionChargeMs: family === "chevronLeader" ? 0 : undefined,
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
