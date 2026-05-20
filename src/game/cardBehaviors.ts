import Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import { damageEffectTextColor } from "../render/combatEffects";
import { makeArcWaveEffect, makeHealParticles, makeShiftEffect, makeSlashEffect } from "../render/combatEffects";
import type { CardDefinition, CardId, CubeBoss, Enemy, Tower } from "../types";
import {
  getProjectilePattern,
  muzzleFaceOffsets,
  type MuzzlePoint,
  type ProjectilePatternConfig
} from "./cardAttackConfigs";
import type { CardBehaviorRuntime, CardReadinessRuntime } from "./combatRuntime";
import { chargingHexSpeedMultiplier } from "./enemySupport";
import { createMortarProjectile, createTowerProjectile, type TowerProjectileSpec } from "./projectiles";
import { movementSpeedMultiplier } from "./slowAura";
import { statusSpeedMultiplier } from "./statusEffects";
import {
  attackRangeRight,
  bossRect,
  canAttackBoss,
  getAttackTarget,
  getBlockedEnemies,
  getBlockingTower,
  getHealTarget,
  getLaneRepelTargets,
  getLowestMaxHpAttackTarget,
  getShiftTargets,
  hasAttackTarget
} from "./targeting";
import { syncEnemyBodyPosition } from "./statusEffects";
import { effectiveTowerLevel, syncTowerHpBar } from "./towers";
import { scaledByEffectiveUpgrades } from "./upgrades";

export interface CardBehavior {
  canUse: (
    tower: Tower,
    definition: CardDefinition,
    time: number,
    runtime: CardReadinessRuntime
  ) => boolean;
  execute: (tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) => void;
}

export const idleCardBehavior: CardBehavior = {
  canUse: () => false,
  execute: () => undefined
};

export const projectileCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.damage && hasAttackTarget(tower, definition, runtime.enemies, runtime.boss));
  },
  execute: (tower, definition, runtime) => {
    for (const spec of towerProjectileSpecs(tower, definition)) {
      runtime.projectiles.push(createTowerProjectile(runtime.scene, spec));
    }
  }
};

export const healingCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.healAmount && getHealTarget(tower, definition, runtime.occupied));
  },
  execute: fireHealingPulse
};

export const shiftCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime) => {
    return cooldownReady(tower, time) && getShiftTargets(tower, runtime.enemies).length > 0;
  },
  execute: fireShiftPulse
};

export const laneRepelCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(resolveRepelDirection(tower)) && getLaneRepelTargets(tower, runtime.enemies).length > 0;
  },
  execute: fireLaneRepelPulse
};

export const blockedPushCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime) => {
    return cooldownReady(tower, time) && getBlockedEnemies(tower, runtime.towers, runtime.enemies).length > 0;
  },
  execute: fireBlockedPushPulse
};

export const slowAuraCardBehavior: CardBehavior = {
  canUse: (tower, definition, time) => {
    return cooldownReady(tower, time) && Boolean(definition.selfDamage);
  },
  execute: (tower, definition, runtime) => {
    runtime.damageTower(tower, definition.selfDamage ?? 700, definition.selfDamageType ?? "true");
  }
};

export const slashCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.damage && hasAttackTarget(tower, definition, runtime.enemies, runtime.boss));
  },
  execute: fireSlash
};

export const arcWaveCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.damage && hasArcWaveTarget(tower, runtime.enemies, runtime.boss));
  },
  execute: fireArcWave
};

export const predictiveMortarCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.damage && hasPredictiveMortarTarget(tower, definition, runtime));
  },
  execute: firePredictiveMortar
};

export const cardBehaviorsById: Record<CardId, CardBehavior> = {
  A: projectileCardBehavior,
  a: projectileCardBehavior,
  B: idleCardBehavior,
  C: projectileCardBehavior,
  c: idleCardBehavior,
  D: idleCardBehavior,
  O: idleCardBehavior,
  R: idleCardBehavior,
  X: idleCardBehavior,
  E: projectileCardBehavior,
  M: projectileCardBehavior,
  W: projectileCardBehavior,
  F: idleCardBehavior,
  f: idleCardBehavior,
  l: idleCardBehavior,
  G: idleCardBehavior,
  H: healingCardBehavior,
  h: idleCardBehavior,
  I: projectileCardBehavior,
  Q: projectileCardBehavior,
  J: projectileCardBehavior,
  K: slashCardBehavior,
  k: arcWaveCardBehavior,
  S: idleCardBehavior,
  L: shiftCardBehavior,
  N: blockedPushCardBehavior,
  n: laneRepelCardBehavior,
  T: slowAuraCardBehavior,
  U: idleCardBehavior,
  V: predictiveMortarCardBehavior,
  P: healingCardBehavior,
  Y: idleCardBehavior,
  Z: slashCardBehavior
};

const PREDICTIVE_MORTAR_DURATION = 1_200;
const PREDICTIVE_MORTAR_HIT_RADIUS = 22;

function cooldownReady(tower: Tower, time: number) {
  return time >= tower.lastFire + tower.fireRate;
}

function fireHealingPulse(
  tower: Tower,
  definition: CardDefinition,
  runtime: Pick<CardBehaviorRuntime, "scene" | "occupied">
) {
  const target = getHealTarget(tower, definition, runtime.occupied);
  if (!target) {
    return;
  }

  healTower(runtime.scene, target, definition.healAmount ?? 60);
}

function fireShiftPulse(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const targets = getShiftTargets(tower, runtime.enemies);
  if (targets.length === 0) {
    return;
  }

  for (const target of targets) {
    const previousY = target.y;
    target.lane = tower.lane;
    target.y = tower.y;
    target.body.setDepth(60 + target.lane);
    syncEnemyBodyPosition(target);
    makeShiftEffect(runtime.scene, target.x, previousY, target.x, target.y);
  }
  for (let index = 0; index < targets.length; index += 1) {
    if (!runtime.towers.includes(tower)) {
      break;
    }
    runtime.damageTower(tower, definition.selfDamage ?? 400, definition.selfDamageType ?? "true");
  }
}

function fireLaneRepelPulse(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const targets = getLaneRepelTargets(tower, runtime.enemies);
  const direction = resolveRepelDirection(tower);
  if (targets.length === 0 || !direction) {
    return;
  }

  const targetLane = tower.lane + direction;
  const targetY = BOARD_Y + targetLane * CELL_HEIGHT + CELL_HEIGHT / 2;
  for (const target of targets) {
    const previousY = target.y;
    target.lane = targetLane;
    target.y = targetY;
    target.body.setDepth(60 + target.lane);
    syncEnemyBodyPosition(target);
    makeShiftEffect(runtime.scene, target.x, previousY, target.x, target.y);
  }
  tower.nextRepelDirection = direction === -1 ? 1 : -1;

  for (let index = 0; index < targets.length; index += 1) {
    if (!runtime.towers.includes(tower)) {
      break;
    }
    runtime.damageTower(tower, definition.selfDamage ?? 400, definition.selfDamageType ?? "true");
  }
}

function fireBlockedPushPulse(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const targets = getBlockedEnemies(tower, runtime.towers, runtime.enemies);
  if (targets.length === 0) {
    return;
  }

  const shiftDistance = (definition.shiftCells ?? 4) * CELL_WIDTH;
  for (const target of targets) {
    const previousX = target.x;
    target.x -= shiftDistance;
    syncEnemyBodyPosition(target);
    makeShiftEffect(runtime.scene, previousX, target.y, target.x, target.y);
  }

  for (let index = 0; index < targets.length; index += 1) {
    if (!runtime.towers.includes(tower)) {
      break;
    }
    runtime.damageTower(tower, definition.selfDamage ?? 400, definition.selfDamageType ?? "true");
  }
}

function resolveRepelDirection(tower: Tower) {
  if (laneIsInBoard(tower.lane + tower.nextRepelDirection)) {
    return tower.nextRepelDirection;
  }

  const fallbackDirection = (tower.nextRepelDirection === -1 ? 1 : -1) as -1 | 1;
  return laneIsInBoard(tower.lane + fallbackDirection) ? fallbackDirection : null;
}

function laneIsInBoard(lane: number) {
  return lane >= 0 && lane < LANES;
}

function fireSlash(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const damage = definition.damage ?? 0;
  const damageType = definition.damageType ?? "physical";
  const target = getAttackTarget(tower, definition, runtime.enemies);
  if (target) {
    makeSlashEffect(runtime.scene, target.x, target.y, damageType);
    runtime.damageEnemy(target, damage, damageType);
    gainAttackProduction(definition, runtime, target.x, target.y);
    return;
  }

  const boss = runtime.boss;
  if (!boss || !canAttackBoss(tower, definition, boss)) {
    return;
  }

  const rect = bossRect(boss);
  const x = Phaser.Math.Clamp(tower.x + CELL_WIDTH, rect.left, rect.right);
  const y = Phaser.Math.Clamp(tower.y, rect.top, rect.bottom);
  makeSlashEffect(runtime.scene, x, y, damageType);
  runtime.damageBoss(damage, damageType);
  gainAttackProduction(definition, runtime, x, y);
}

function fireArcWave(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const damage = scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  const damageType = definition.damageType ?? "magic";
  makeArcWaveEffect(runtime.scene, tower.x - CELL_WIDTH * 0.24, tower.y, damageType);

  for (const enemy of arcWaveEnemyTargets(tower, runtime.enemies)) {
    runtime.damageEnemy(enemy, damage, damageType);
  }

  if (arcWaveHitsBoss(tower, runtime.boss)) {
    runtime.damageBoss(damage, damageType);
  }
}

function hasPredictiveMortarTarget(
  tower: Tower,
  definition: CardDefinition,
  runtime: CardReadinessRuntime
) {
  return Boolean(getLowestMaxHpAttackTarget(tower, definition, runtime.enemies) || canAttackBoss(tower, definition, runtime.boss));
}

function firePredictiveMortar(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const damage = scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  const damageType = definition.damageType ?? "magic";
  const enemy = getLowestMaxHpAttackTarget(tower, definition, runtime.enemies);
  const target = enemy
    ? predictedEnemyMortarTarget(enemy, runtime)
    : predictedBossMortarTarget(tower, runtime.boss);

  if (!target) {
    return;
  }

  runtime.mortarProjectiles.push(
    createMortarProjectile(runtime.scene, {
      owner: "tower",
      fromX: tower.x + 18,
      fromY: tower.y,
      targetX: target.x,
      targetY: target.y,
      damage,
      damageType,
      rangeX: PREDICTIVE_MORTAR_HIT_RADIUS,
      rangeY: PREDICTIVE_MORTAR_HIT_RADIUS,
      marker: "text",
      markerText: "*",
      markerTextColor: damageEffectTextColor(damageType),
      duration: PREDICTIVE_MORTAR_DURATION,
      singleTarget: true,
      hitRadius: PREDICTIVE_MORTAR_HIT_RADIUS
    })
  );
}

function predictedEnemyMortarTarget(enemy: Enemy, runtime: CardBehaviorRuntime) {
  const durationSeconds = PREDICTIVE_MORTAR_DURATION / 1_000;
  const speed = getBlockingTower(runtime.towers, enemy)
    ? 0
    : enemy.speed *
      statusSpeedMultiplier(enemy, runtime.battleTime) *
      movementSpeedMultiplier(runtime.towers, enemy.x, enemy.y) *
      chargingHexSpeedMultiplier(runtime.enemies, enemy);
  return {
    x: enemy.x - speed * durationSeconds,
    y: enemy.y
  };
}

function predictedBossMortarTarget(tower: Tower, boss: CubeBoss | null) {
  if (!boss) {
    return null;
  }

  const rect = bossRect(boss);
  const durationSeconds = PREDICTIVE_MORTAR_DURATION / 1_000;
  return {
    x: boss.x - boss.speed * durationSeconds,
    y: Phaser.Math.Clamp(tower.y, rect.top, rect.bottom)
  };
}

function hasArcWaveTarget(tower: Tower, enemies: Enemy[], boss: CubeBoss | null) {
  return arcWaveEnemyTargets(tower, enemies).length > 0 || arcWaveHitsBoss(tower, boss);
}

function arcWaveEnemyTargets(tower: Tower, enemies: Enemy[]) {
  const cells = arcWaveCells(tower);
  return enemies.filter((enemy) => cells.some((cell) => cell.contains(enemy.x, enemy.y)));
}

function arcWaveHitsBoss(tower: Tower, boss: CubeBoss | null) {
  if (!boss) {
    return false;
  }

  const rect = bossRect(boss);
  return arcWaveCells(tower).some((cell) => Phaser.Geom.Intersects.RectangleToRectangle(cell, rect));
}

function arcWaveCells(tower: Tower) {
  const cells: Phaser.Geom.Rectangle[] = [];
  for (const lane of [tower.lane - 1, tower.lane, tower.lane + 1]) {
    for (const column of [tower.column, tower.column + 1]) {
      addBoardCell(cells, lane, column);
    }
  }
  addBoardCell(cells, tower.lane, tower.column + 2);
  return cells;
}

function addBoardCell(cells: Phaser.Geom.Rectangle[], lane: number, column: number) {
  if (lane < 0 || lane >= LANES || column < 0 || column >= COLUMNS) {
    return;
  }

  cells.push(new Phaser.Geom.Rectangle(
    BOARD_X + column * CELL_WIDTH,
    BOARD_Y + lane * CELL_HEIGHT,
    CELL_WIDTH,
    CELL_HEIGHT
  ));
}

function gainAttackProduction(definition: CardDefinition, runtime: CardBehaviorRuntime, x: number, y: number) {
  if (!definition.attackProduceAmount) {
    return;
  }

  runtime.gainChars(definition.attackProduceAmount, x, y - 24);
}

function healTower(scene: Phaser.Scene, tower: Tower, amount: number) {
  const previousHp = tower.hp;
  tower.hp = Math.min(tower.maxHp, tower.hp + amount);
  if (tower.hp <= previousHp) {
    return;
  }

  syncTowerHpBar(tower);
  makeHealParticles(scene, tower.x, tower.y);
}

function towerProjectileSpecs(tower: Tower, definition: CardDefinition): TowerProjectileSpec[] {
  const pattern = getProjectilePattern(tower.type);
  if (!pattern) {
    return [];
  }

  return pattern.shots.map((shot) => {
    const muzzle = projectileMuzzlePoint(tower, shot.muzzle ?? pattern.defaultMuzzle);
    return makeProjectileSpec(
      pattern,
      muzzle.x,
      muzzle.y,
      tower.lane,
      definition,
      shot.angleDegrees,
      projectileMaxX(tower, definition, pattern)
    );
  });
}

function makeProjectileSpec(
  pattern: ProjectilePatternConfig,
  x: number,
  y: number,
  lane: number,
  definition: CardDefinition,
  angleDegrees: number,
  maxX = Number.POSITIVE_INFINITY
): TowerProjectileSpec {
  return {
    type: pattern.projectileKind,
    x,
    y,
    lane,
    speed: pattern.speed,
    damage: definition.damage ?? 0,
    damageType: definition.damageType ?? "physical",
    debuff: definition.projectileDebuff,
    debuffDuration: definition.projectileDebuffDuration,
    splashRadius: projectileSplashRadius(pattern, definition),
    angleDegrees,
    maxX
  };
}

function projectileMuzzlePoint(tower: Tower, muzzle: MuzzlePoint) {
  const faceOffset = muzzleFaceOffsets[muzzle.face];
  return {
    x: tower.x + faceOffset.x + (muzzle.offsetX ?? 0),
    y: tower.y + faceOffset.y + (muzzle.offsetY ?? 0)
  };
}

function projectileSplashRadius(pattern: ProjectilePatternConfig, definition: CardDefinition) {
  if (pattern.splashRadius === "definition") {
    return definition.splashRadius ?? CELL_WIDTH;
  }
  return pattern.splashRadius ?? 0;
}

function projectileMaxX(tower: Tower, definition: CardDefinition, pattern: ProjectilePatternConfig) {
  if (pattern.maxTravelArea) {
    return attackRangeRight(tower, definition);
  }

  return Number.POSITIVE_INFINITY;
}
