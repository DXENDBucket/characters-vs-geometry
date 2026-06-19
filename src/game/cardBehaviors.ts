import Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import {
  damageEffectTextColor,
  makeArcWaveEffect,
  makeHealParticles,
  makeHitShards,
  makeShiftEffect,
  makeSlashEffect,
  makeSunderEffect,
  makeTowerLaserEffect
} from "../render/combatEffects";
import type { CardDefinition, CardId, CubeBoss, Enemy, Tower } from "../types";
import {
  getProjectilePattern,
  getCardAttackArea,
  muzzleFaceOffsets,
  type MuzzlePoint,
  type ProjectilePatternConfig
} from "./cardAttackConfigs";
import type { CardBehaviorRuntime, CardReadinessRuntime } from "./combatRuntime";
import { enemyDefenseStats, enemyMovementSpeed } from "./combatStats";
import { enemySupportSources } from "./enemySupport";
import { enemyIsBurrowed, enemyIsHighFlying, siegeRamSpeed } from "./enemyBehaviors";
import { forEachSnapshot } from "./iteration";
import { attackIntervalMs } from "./attackSpeed";
import {
  createHomingTowerProjectile,
  createMortarProjectile,
  createTowerProjectile
} from "./projectiles";
import {
  attackRangeLimitX,
  bossPartIntersectsRect,
  clampXToBossPart,
  clampYToBossPart,
  canAttackBoss,
  canAttackBossPart,
  findBossPart,
  getAttackTarget,
  getBlockedEnemies,
  getBlockingTowerFromOccupied,
  getHealTargets,
  hasHealTarget,
  getLaneRepelTargets,
  getLowestMaxHpAttackTarget,
  getShiftTargets,
  gridCellKey,
  hasAttackTarget,
  hasBlockedEnemy,
  hasLaneRepelTarget,
  hasShiftTarget
} from "./targeting";
import { applyStatusEffect, hasStatusEffectName, syncEnemyBodyPosition } from "./statusEffects";
import { effectiveTowerLevel, getProductionAmount, syncTowerHpBar, towerDamageType, towerFacingDirection } from "./towers";
import { towerFinalStats } from "./unitStats";
import { scaledByEffectiveUpgrades } from "./upgrades";
import { isPointInSlowAura } from "./slowAura";

export interface CardBehavior {
  canUse: (
    tower: Tower,
    definition: CardDefinition,
    time: number,
    runtime: CardReadinessRuntime,
    cooldownAlreadyReady?: boolean
  ) => boolean;
  execute: (tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) => void;
}

export const idleCardBehavior: CardBehavior = {
  canUse: () => false,
  execute: () => undefined
};

export const projectileCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(definition.damage && hasAttackTarget(tower, definition, runtime.enemies, runtime.boss));
  },
  execute: (tower, definition, runtime) => {
    fireTowerProjectiles(tower, definition, runtime);
  }
};

export const homingCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(definition.damage && selectSmallXTarget(runtime.enemies, tower.x, tower.y));
  },
  execute: fireHomingVolley
};

export const magicLaserCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(definition.damage && hasMagicLaserTarget(tower, runtime));
  },
  execute: fireMagicLaser
};

export const healingCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime, cooldownAlreadyReady) => {
    return (
      cooldownReady(tower, time, cooldownAlreadyReady) &&
      Boolean(definition.healAmount && hasHealTarget(tower, definition, runtime.occupied, definition.healTargets ?? 1))
    );
  },
  execute: fireHealingPulse
};

export const zealHealingCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(definition.healAmount && hasZealHealTarget(tower, runtime.towers));
  },
  execute: fireZealHealingPulse
};

export const productionCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, _runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(definition.produceAmount);
  },
  execute: (tower, definition, runtime) => {
    runtime.gainChars(getProductionAmount(tower, definition), tower.x, tower.y - 28);
  }
};

export const shiftCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && hasShiftTarget(tower, runtime.enemies);
  },
  execute: fireShiftPulse
};

export const laneRepelCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(resolveRepelDirection(tower)) && hasLaneRepelTarget(tower, runtime.enemies);
  },
  execute: fireLaneRepelPulse
};

export const blockedPushCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && hasBlockedEnemy(tower, runtime.towers, runtime.enemies, runtime.occupied);
  },
  execute: fireBlockedPushPulse
};

export const slowAuraCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, _runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(definition.selfDamage);
  },
  execute: (tower, definition, runtime) => {
    runtime.damageTower(tower, definition.selfDamage ?? 700, definition.selfDamageType ?? "true");
  }
};

export const slashCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(definition.damage && hasAttackTarget(tower, definition, runtime.enemies, runtime.boss));
  },
  execute: fireSlash
};

export const arcWaveCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(definition.damage && hasArcWaveTarget(tower, runtime.enemies, runtime.boss));
  },
  execute: fireArcWave
};

export const predictiveMortarCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(definition.damage && hasPredictiveMortarTarget(tower, definition, runtime));
  },
  execute: firePredictiveMortar
};

export const smallSummonerCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime, cooldownAlreadyReady) => {
    return cooldownReady(tower, time, cooldownAlreadyReady) && Boolean(getSmallSummonCell(tower, runtime.occupied, runtime.isCellDeployable));
  },
  execute: fireSmallSummon
};

export const cardBehaviorsById: Record<CardId, CardBehavior> = {
  A: projectileCardBehavior,
  a: projectileCardBehavior,
  B: idleCardBehavior,
  b: idleCardBehavior,
  C: projectileCardBehavior,
  c: idleCardBehavior,
  D: idleCardBehavior,
  d: magicLaserCardBehavior,
  O: idleCardBehavior,
  R: idleCardBehavior,
  X: productionCardBehavior,
  x: homingCardBehavior,
  E: projectileCardBehavior,
  e: zealHealingCardBehavior,
  M: projectileCardBehavior,
  m: idleCardBehavior,
  W: projectileCardBehavior,
  w: idleCardBehavior,
  F: idleCardBehavior,
  f: idleCardBehavior,
  i: idleCardBehavior,
  l: idleCardBehavior,
  G: idleCardBehavior,
  t: idleCardBehavior,
  H: healingCardBehavior,
  h: idleCardBehavior,
  I: projectileCardBehavior,
  Q: projectileCardBehavior,
  J: projectileCardBehavior,
  K: slashCardBehavior,
  k: arcWaveCardBehavior,
  S: idleCardBehavior,
  s: smallSummonerCardBehavior,
  L: shiftCardBehavior,
  N: blockedPushCardBehavior,
  n: laneRepelCardBehavior,
  T: slowAuraCardBehavior,
  U: idleCardBehavior,
  V: predictiveMortarCardBehavior,
  v: predictiveMortarCardBehavior,
  P: healingCardBehavior,
  p: healingCardBehavior,
  Y: idleCardBehavior,
  Z: slashCardBehavior
};

const PREDICTIVE_MORTAR_DURATION = 1_200;
const PREDICTIVE_MORTAR_HIT_RADIUS = 22;
const HOMING_PROJECTILE_SPEED = 620;
const HOMING_PROJECTILE_ACCELERATION = 420;
const HOMING_PROJECTILE_MAX_SPEED = 1_200;
const MAGIC_LASER_START_OFFSET = 24;
const HOMING_PROJECTILE_MUZZLES = [
  { x: 0, y: -24 },
  { x: 24, y: 0 },
  { x: 0, y: 24 },
  { x: -24, y: 0 }
] as const;
const magicLaserTargetsBuffer: Enemy[] = [];
const healingPulseTargetsBuffer: Tower[] = [];
const zealHealTargetsBuffer: Tower[] = [];

function cooldownReady(tower: Tower, time: number, cooldownAlreadyReady = false) {
  if (cooldownAlreadyReady) {
    return true;
  }
  return time >= tower.lastFire + attackIntervalMs(towerFinalStats(tower).attackSpeed);
}

function fireHomingVolley(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const target = selectSmallXTarget(runtime.enemies, tower.x, tower.y);
  if (!target) {
    return;
  }

  const damage = scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  const damageType = towerDamageType(tower, definition.damageType ?? "magic", runtime.battleTime);
  for (const muzzle of HOMING_PROJECTILE_MUZZLES) {
    runtime.projectiles.push(
      createHomingTowerProjectile(runtime.scene, {
        x: tower.x + muzzle.x,
        y: tower.y + muzzle.y,
        lane: tower.lane,
        speed: HOMING_PROJECTILE_SPEED,
        acceleration: HOMING_PROJECTILE_ACCELERATION,
        maxSpeed: HOMING_PROJECTILE_MAX_SPEED,
        damage,
        damageType,
        targetEnemy: target,
        sourceTower: tower
      })
    );
  }
}

function selectSmallXTarget(enemies: Enemy[], x: number, y: number) {
  let closest: Enemy | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestFlying: Enemy | undefined;
  let closestFlyingDistance = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (!canHomingProjectileTarget(enemy)) {
      continue;
    }

    const distance = distanceSq(enemy.x, enemy.y, x, y);
    if (distance < closestDistance) {
      closest = enemy;
      closestDistance = distance;
    }
    if (enemyIsRegularFlying(enemy) && distance < closestFlyingDistance) {
      closestFlying = enemy;
      closestFlyingDistance = distance;
    }
  }
  return closestFlying ?? closest;
}

function canHomingProjectileTarget(enemy: Enemy) {
  return !enemyIsBurrowed(enemy) && !enemyIsHighFlying(enemy);
}

function enemyIsRegularFlying(enemy: Enemy) {
  return hasStatusEffectName(enemy, "flying");
}

function hasMagicLaserTarget(tower: Tower, runtime: CardReadinessRuntime) {
  const direction = towerFacingDirection(tower);
  const endX = magicLaserEndX(tower, runtime.enemies, runtime, direction);
  return hasMagicLaserEnemyTarget(tower, runtime.enemies, direction, endX) || magicLaserHitsBoss(tower, runtime.boss, endX);
}

function fireMagicLaser(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const direction = towerFacingDirection(tower);
  const endX = magicLaserEndX(tower, runtime.enemies, runtime, direction);
  const startX = tower.x + direction * MAGIC_LASER_START_OFFSET;
  const targets = magicLaserTargets(tower, runtime.enemies, direction, endX);
  const damage = scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  const damageType = towerDamageType(tower, definition.damageType ?? "magic", runtime.battleTime);

  makeTowerLaserEffect(runtime.scene, startX, tower.y, endX);
  try {
    for (const enemy of targets) {
      makeHitShards(runtime.scene, enemy.x, enemy.y, damageType);
      runtime.damageEnemy(enemy, damage, damageType, tower);
      if (enemy.inPlay && definition.projectileDebuff && definition.projectileDebuffDuration) {
        applyStatusEffect(enemy, definition.projectileDebuff, definition.projectileDebuffDuration, runtime.battleTime);
        if (definition.projectileDebuff === "sunder") {
          makeSunderEffect(runtime.scene, enemy.x, enemy.y);
        }
      }
    }
  } finally {
    targets.length = 0;
  }

  const bossPart = magicLaserBossPart(tower, runtime.boss, endX);
  if (bossPart) {
    runtime.damageBoss(damage, damageType, bossPart);
  }
}

function magicLaserTargets(tower: Tower, enemies: Enemy[], direction: number, endX: number) {
  const targets = magicLaserTargetsBuffer;
  targets.length = 0;
  for (const enemy of enemies) {
    if (!canMagicLaserHitEnemy(tower, enemy, direction) || !enemyIsBeforeMagicLaserEnd(enemy, direction, endX)) {
      continue;
    }

    insertMagicLaserTarget(targets, enemy, direction);
  }
  return targets;
}

function hasMagicLaserEnemyTarget(tower: Tower, enemies: Enemy[], direction: number, endX: number) {
  for (const enemy of enemies) {
    if (canMagicLaserHitEnemy(tower, enemy, direction) && enemyIsBeforeMagicLaserEnd(enemy, direction, endX)) {
      return true;
    }
  }
  return false;
}

function magicLaserEndX(tower: Tower, enemies: Enemy[], runtime: CardReadinessRuntime, direction: number) {
  let stoppingX: number | undefined;
  const supportSources = enemySupportSources(enemies);
  for (const enemy of enemies) {
    if (
      !canMagicLaserHitEnemy(tower, enemy, direction) ||
      enemyDefenseStats(enemy, enemies, runtime.battleTime, supportSources).magicResistance <= 0
    ) {
      continue;
    }

    if (stoppingX === undefined || (direction > 0 ? enemy.x < stoppingX : enemy.x > stoppingX)) {
      stoppingX = enemy.x;
    }
  }
  return stoppingX ?? (direction > 0 ? BOARD_X + COLUMNS * CELL_WIDTH : BOARD_X);
}

function canMagicLaserHitEnemy(tower: Tower, enemy: Enemy, direction: number = towerFacingDirection(tower)) {
  if (enemyIsBurrowed(enemy) || enemyIsHighFlying(enemy) || enemy.lane !== tower.lane) {
    return false;
  }

  return direction > 0
    ? enemy.x > tower.x + MAGIC_LASER_START_OFFSET
    : enemy.x < tower.x - MAGIC_LASER_START_OFFSET;
}

function enemyIsBeforeMagicLaserEnd(enemy: Enemy, direction: number, endX: number) {
  return direction > 0 ? enemy.x <= endX : enemy.x >= endX;
}

function insertMagicLaserTarget(targets: Enemy[], enemy: Enemy, direction: number) {
  let index = 0;
  while (index < targets.length && magicLaserTargetComesBefore(targets[index], enemy, direction)) {
    index += 1;
  }
  targets.splice(index, 0, enemy);
}

function magicLaserTargetComesBefore(a: Enemy, b: Enemy, direction: number) {
  return direction > 0 ? a.x <= b.x : a.x >= b.x;
}

function magicLaserHitsBoss(tower: Tower, boss: CubeBoss | null, endX: number) {
  return Boolean(magicLaserBossPart(tower, boss, endX));
}

function magicLaserBossPart(tower: Tower, boss: CubeBoss | null, endX: number) {
  if (!boss) {
    return undefined;
  }

  const startX = tower.x + towerFacingDirection(tower) * MAGIC_LASER_START_OFFSET;
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  return findBossPart(boss, (part) => bossPartIntersectsRect(part, left, right, tower.y, tower.y));
}

function fireHealingPulse(
  tower: Tower,
  definition: CardDefinition,
  runtime: Pick<CardBehaviorRuntime, "scene" | "occupied">
) {
  const targets = getHealTargets(tower, definition, runtime.occupied, definition.healTargets ?? 1, healingPulseTargetsBuffer);
  if (targets.length === 0) {
    return;
  }

  try {
    for (const target of targets) {
      healTower(runtime.scene, target, definition.healAmount ?? 60);
    }
  } finally {
    targets.length = 0;
  }
}

function fireZealHealingPulse(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const targets = getZealHealTargets(tower, runtime.towers);
  if (targets.length === 0) {
    return;
  }

  const amount = definition.healAmount ?? definition.damage ?? 0;
  try {
    for (const target of targets) {
      healTower(runtime.scene, target, amount);
    }
  } finally {
    targets.length = 0;
  }
}

function getZealHealTargets(tower: Tower, towers: Tower[]) {
  const targets = zealHealTargetsBuffer;
  targets.length = 0;
  for (const target of towers) {
    if (isZealHealTarget(tower, target)) {
      targets.push(target);
    }
  }
  return targets;
}

function hasZealHealTarget(tower: Tower, towers: Tower[]) {
  for (const target of towers) {
    if (isZealHealTarget(tower, target)) {
      return true;
    }
  }
  return false;
}

function isZealHealTarget(tower: Tower, target: Tower) {
  return !target.transient && isPointInSlowAura(tower, target.x, target.y) && target.hp < towerFinalStats(target).maxHp;
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
    if (!tower.inPlay) {
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
    if (!tower.inPlay) {
      break;
    }
    runtime.damageTower(tower, definition.selfDamage ?? 400, definition.selfDamageType ?? "true");
  }
}

function fireBlockedPushPulse(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const targets = getBlockedEnemies(tower, runtime.towers, runtime.enemies, runtime.occupied);
  if (targets.length === 0) {
    return;
  }

  const shiftDistance = (definition.shiftCells ?? 4) * CELL_WIDTH;
  const shiftDirection = blockedPushDirection(tower);
  for (const target of targets) {
    const previousX = target.x;
    target.x += shiftDirection * shiftDistance;
    syncEnemyBodyPosition(target);
    makeShiftEffect(runtime.scene, previousX, target.y, target.x, target.y);
  }

  for (let index = 0; index < targets.length; index += 1) {
    if (!tower.inPlay) {
      break;
    }
    runtime.damageTower(tower, definition.selfDamage ?? 400, definition.selfDamageType ?? "true");
  }
}

function blockedPushDirection(tower: Tower) {
  return -towerFacingDirection(tower);
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
  const damageType = towerDamageType(tower, definition.damageType, runtime.battleTime);
  const target = getAttackTarget(tower, definition, runtime.enemies);
  if (target) {
    makeSlashEffect(runtime.scene, target.x, target.y, damageType);
    runtime.damageEnemy(target, damage, damageType, tower);
    gainAttackProduction(definition, runtime, target.x, target.y);
    return;
  }

  const boss = runtime.boss;
  if (!boss || !canAttackBoss(tower, definition, boss)) {
    return;
  }

  const bossPart = findBossPart(boss, (part) => canAttackBossPart(tower, definition, part)) ?? boss;
  const x = clampXToBossPart(bossPart, tower.x + towerFacingDirection(tower) * CELL_WIDTH);
  const y = clampYToBossPart(bossPart, tower.y);
  makeSlashEffect(runtime.scene, x, y, damageType);
  runtime.damageBoss(damage, damageType, bossPart);
  gainAttackProduction(definition, runtime, x, y);
}

function fireArcWave(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const damage = scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  const damageType = towerDamageType(tower, definition.damageType ?? "magic", runtime.battleTime);
  const direction = towerFacingDirection(tower);
  makeArcWaveEffect(runtime.scene, tower.x - direction * CELL_WIDTH * 0.24, tower.y, damageType, direction);

  forEachSnapshot(runtime.enemies, (enemy) => {
    if (enemyIsInArcWave(tower, enemy)) {
      runtime.damageEnemy(enemy, damage, damageType, tower);
    }
  });

  const bossPart = arcWaveBossPart(tower, runtime.boss);
  if (bossPart) {
    runtime.damageBoss(damage, damageType, bossPart);
  }
}

function hasPredictiveMortarTarget(
  tower: Tower,
  definition: CardDefinition,
  runtime: CardReadinessRuntime
) {
  return Boolean(getPredictiveMortarEnemyTarget(tower, definition, runtime.enemies) || canAttackBoss(tower, definition, runtime.boss));
}

function firePredictiveMortar(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const damage = scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  const damageType = towerDamageType(tower, definition.damageType ?? "magic", runtime.battleTime);
  const enemy = getPredictiveMortarEnemyTarget(tower, definition, runtime.enemies);
  const target = enemy
    ? predictedEnemyMortarTarget(enemy, runtime)
    : predictedBossMortarTarget(tower, definition, runtime.boss);

  if (!target) {
    return;
  }

  runtime.mortarProjectiles.push(
    createMortarProjectile(runtime.scene, {
      owner: "tower",
      fromX: tower.x + towerFacingDirection(tower) * 18,
      fromY: tower.y,
      targetX: target.x,
      targetY: target.y,
      damage,
      damageType,
      sourceTower: tower,
      rangeX: PREDICTIVE_MORTAR_HIT_RADIUS,
      rangeY: PREDICTIVE_MORTAR_HIT_RADIUS,
      marker: "text",
      markerText: definition.mortarMarkerText ?? "*",
      markerTextColor: damageEffectTextColor(damageType),
      duration: PREDICTIVE_MORTAR_DURATION,
      singleTarget: definition.mortarSingleTarget ?? true,
      hitRadius: definition.mortarHitRadius ?? PREDICTIVE_MORTAR_HIT_RADIUS,
      radialFalloff: definition.mortarAoeFalloff,
      debuff: definition.projectileDebuff,
      debuffDuration: definition.projectileDebuffDuration,
      ...(definition.splashRadius
        ? {
            rangeX: definition.splashRadius,
            rangeY: definition.splashRadius
          }
        : {})
    })
  );
}

function getPredictiveMortarEnemyTarget(tower: Tower, definition: CardDefinition, enemies: Enemy[]) {
  if (definition.mortarTargeting === "first") {
    return getAttackTarget(tower, definition, enemies);
  }

  return getLowestMaxHpAttackTarget(tower, definition, enemies);
}

function predictedEnemyMortarTarget(enemy: Enemy, runtime: CardBehaviorRuntime) {
  const durationSeconds = PREDICTIVE_MORTAR_DURATION / 1_000;
  const speed = getBlockingTowerFromOccupied(runtime.occupied, enemy)
    ? 0
    : enemyMovementSpeed(
        enemy,
        { enemies: runtime.enemies, towers: runtime.towers, time: runtime.battleTime },
        siegeRamSpeed(enemy)
      );
  const direction = Math.sign(enemy.maceVelocity ?? 0) || (enemy.movementDirection ?? -1);
  return {
    x: enemy.x + direction * speed * durationSeconds,
    y: enemy.y
  };
}

function predictedBossMortarTarget(tower: Tower, definition: CardDefinition, boss: CubeBoss | null) {
  if (!boss) {
    return null;
  }

  const part = findBossPart(boss, (candidate) => canAttackBossPart(tower, definition, candidate)) ?? boss;
  const durationSeconds = PREDICTIVE_MORTAR_DURATION / 1_000;
  const distance = part.finalStats.speed * durationSeconds;
  const direction = part.movementDirection ?? -1;
  return {
    x: part.x + ((part.movementAxis ?? "x") === "x" ? direction * distance : 0),
    y:
      (part.movementAxis ?? "x") === "y"
        ? part.y + direction * distance
        : clampYToBossPart(part, tower.y)
  };
}

function fireSmallSummon(tower: Tower, _definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const cell = getSmallSummonCell(tower, runtime.occupied, runtime.isCellDeployable);
  if (!cell) {
    return;
  }

  const spawned = runtime.spawnTower("a", cell.lane, cell.column, effectiveTowerLevel(tower), towerFacingDirection(tower));
  if (spawned) {
    makeShiftEffect(runtime.scene, tower.x, tower.y, spawned.x, spawned.y);
  }
}

function getSmallSummonCell(
  tower: Tower,
  occupied: Map<string, Tower>,
  isCellDeployable: ((lane: number, column: number) => boolean) | undefined
) {
  const direction = towerFacingDirection(tower);
  for (let column = tower.column + direction; column >= 0 && column < COLUMNS; column += direction) {
    if (!occupied.has(gridCellKey(tower.lane, column)) && (isCellDeployable?.(tower.lane, column) ?? true)) {
      return { lane: tower.lane, column };
    }
  }

  return null;
}

function arcWaveBossPart(tower: Tower, boss: CubeBoss | null) {
  if (!boss) {
    return undefined;
  }

  return findBossPart(boss, (part) => {
    return bossPartIntersectsArcWave(tower, part);
  });
}

function arcWaveHitsBoss(tower: Tower, boss: CubeBoss | null) {
  return Boolean(arcWaveBossPart(tower, boss));
}

function hasArcWaveTarget(tower: Tower, enemies: Enemy[], boss: CubeBoss | null) {
  return hasArcWaveEnemyTarget(tower, enemies) || arcWaveHitsBoss(tower, boss);
}

function hasArcWaveEnemyTarget(tower: Tower, enemies: Enemy[]) {
  for (const enemy of enemies) {
    if (enemyIsInArcWave(tower, enemy)) {
      return true;
    }
  }
  return false;
}

function enemyIsInArcWave(tower: Tower, enemy: Enemy) {
  if (enemyIsHighFlying(enemy)) {
    return false;
  }

  let hit = false;
  forEachArcWaveCell(tower, (lane, column) => {
    if (!hit && pointInBoardCell(enemy.x, enemy.y, lane, column)) {
      hit = true;
    }
  });
  return hit;
}

function bossPartIntersectsArcWave(tower: Tower, part: CubeBoss) {
  let hit = false;
  forEachArcWaveCell(tower, (lane, column) => {
    if (!hit && boardCellIntersectsBossPart(lane, column, part)) {
      hit = true;
    }
  });
  return hit;
}

function forEachArcWaveCell(tower: Tower, visit: (lane: number, column: number) => void) {
  const direction = towerFacingDirection(tower);
  for (let lane = tower.lane - 1; lane <= tower.lane + 1; lane += 1) {
    visitBoardCell(lane, tower.column, visit);
    visitBoardCell(lane, tower.column + direction, visit);
  }
  visitBoardCell(tower.lane, tower.column + direction * 2, visit);
}

function visitBoardCell(lane: number, column: number, visit: (lane: number, column: number) => void) {
  if (lane < 0 || lane >= LANES || column < 0 || column >= COLUMNS) {
    return;
  }

  visit(lane, column);
}

function pointInBoardCell(x: number, y: number, lane: number, column: number) {
  const left = BOARD_X + column * CELL_WIDTH;
  const top = BOARD_Y + lane * CELL_HEIGHT;
  return x >= left && x <= left + CELL_WIDTH && y >= top && y <= top + CELL_HEIGHT;
}

function boardCellIntersectsBossPart(lane: number, column: number, part: CubeBoss) {
  const left = BOARD_X + column * CELL_WIDTH;
  const right = left + CELL_WIDTH;
  const top = BOARD_Y + lane * CELL_HEIGHT;
  const bottom = top + CELL_HEIGHT;
  return bossPartIntersectsRect(part, left, right, top, bottom);
}

function gainAttackProduction(definition: CardDefinition, runtime: CardBehaviorRuntime, x: number, y: number) {
  if (!definition.attackProduceAmount) {
    return;
  }

  runtime.gainChars(definition.attackProduceAmount, x, y - 24);
}

function healTower(scene: Phaser.Scene, tower: Tower, amount: number) {
  const previousHp = tower.hp;
  tower.hp = Math.min(towerFinalStats(tower).maxHp, tower.hp + amount);
  if (tower.hp <= previousHp) {
    return;
  }

  syncTowerHpBar(tower);
  makeHealParticles(scene, tower.x, tower.y);
}

function fireTowerProjectiles(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const pattern = getProjectilePattern(tower.type);
  if (!pattern) {
    return;
  }

  const damageType = towerDamageType(tower, definition.damageType, runtime.battleTime);
  const damage = towerProjectileDamage(tower, definition);
  const mirrored = shouldMirrorProjectilePattern(tower, pattern);
  const splashRadius = projectileSplashRadius(pattern, definition);
  for (const shot of pattern.shots) {
    const angleDegrees = mirrored ? 180 - shot.angleDegrees : shot.angleDegrees;
    const muzzle = projectileMuzzlePoint(tower, shot.muzzle ?? pattern.defaultMuzzle, mirrored);
    const limitDirection = Math.cos(Phaser.Math.DegToRad(angleDegrees)) < 0 ? -1 : 1;
    runtime.projectiles.push(
      createTowerProjectile(runtime.scene, {
        type: pattern.projectileKind,
        x: muzzle.x,
        y: muzzle.y,
        lane: tower.lane,
        speed: pattern.speed,
        damage,
        damageType,
        sourceTower: tower,
        debuff: definition.projectileDebuff,
        debuffDuration: definition.projectileDebuffDuration,
        splashRadius,
        angleDegrees,
        maxX: projectileLimitX(tower, definition, pattern, limitDirection),
        limitDirection
      })
    );
  }
}

function towerProjectileDamage(tower: Tower, definition: CardDefinition) {
  if (tower.type === "Q") {
    return scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  }

  return definition.damage ?? 0;
}

function projectileMuzzlePoint(tower: Tower, muzzle: MuzzlePoint, mirrored: boolean) {
  const face = mirrored ? mirrorMuzzleFace(muzzle.face) : muzzle.face;
  const offsetX = mirrored && muzzle.offsetX ? -muzzle.offsetX : muzzle.offsetX ?? 0;
  const faceOffset = muzzleFaceOffsets[face];
  return {
    x: tower.x + faceOffset.x + offsetX,
    y: tower.y + faceOffset.y + (muzzle.offsetY ?? 0)
  };
}

function shouldMirrorProjectilePattern(tower: Tower, pattern: ProjectilePatternConfig) {
  if (towerFacingDirection(tower) > 0) {
    return false;
  }

  const area = pattern.maxTravelArea ?? getCardAttackArea(tower.type);
  if (area.kind === "verticalFan") {
    return false;
  }

  return true;
}

function mirrorMuzzleFace(face: MuzzlePoint["face"]): MuzzlePoint["face"] {
  if (face === "right") {
    return "left";
  }
  if (face === "left") {
    return "right";
  }
  return face;
}

function projectileSplashRadius(pattern: ProjectilePatternConfig, definition: CardDefinition) {
  if (pattern.splashRadius === "definition") {
    return definition.splashRadius ?? CELL_WIDTH;
  }
  return pattern.splashRadius ?? 0;
}

function projectileLimitX(
  tower: Tower,
  definition: CardDefinition,
  pattern: ProjectilePatternConfig,
  limitDirection: -1 | 1
) {
  if (pattern.maxTravelArea) {
    return attackRangeLimitX(tower, definition);
  }

  return limitDirection < 0 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
