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
import { enemyIsBurrowed, enemyIsHighFlying, siegeRamSpeed } from "./enemyBehaviors";
import { attackIntervalMs } from "./attackSpeed";
import {
  createHomingTowerProjectile,
  createMortarProjectile,
  createTowerProjectile,
  type TowerProjectileSpec
} from "./projectiles";
import {
  attackRangeLimitX,
  bossParts,
  bossRect,
  canAttackBoss,
  canAttackBossPart,
  getAttackTarget,
  getBlockedEnemies,
  getBlockingTower,
  getHealTargets,
  getLaneRepelTargets,
  getLowestMaxHpAttackTarget,
  getShiftTargets,
  hasAttackTarget
} from "./targeting";
import { applyStatusEffect, syncEnemyBodyPosition } from "./statusEffects";
import { effectiveTowerLevel, syncTowerHpBar, towerDamageType, towerFacingDirection } from "./towers";
import { towerFinalStats } from "./unitStats";
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
    for (const spec of towerProjectileSpecs(tower, definition, runtime.battleTime)) {
      runtime.projectiles.push(createTowerProjectile(runtime.scene, spec));
    }
  }
};

export const homingCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.damage && selectSmallXTarget(runtime.enemies, tower.x, tower.y));
  },
  execute: fireHomingVolley
};

export const magicLaserCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.damage && hasMagicLaserTarget(tower, runtime));
  },
  execute: fireMagicLaser
};

export const healingCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return (
      cooldownReady(tower, time) &&
      Boolean(definition.healAmount && getHealTargets(tower, definition, runtime.occupied, definition.healTargets ?? 1).length > 0)
    );
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
  b: idleCardBehavior,
  C: projectileCardBehavior,
  c: idleCardBehavior,
  D: idleCardBehavior,
  d: magicLaserCardBehavior,
  O: idleCardBehavior,
  R: idleCardBehavior,
  X: idleCardBehavior,
  x: homingCardBehavior,
  E: projectileCardBehavior,
  M: projectileCardBehavior,
  W: projectileCardBehavior,
  w: idleCardBehavior,
  F: idleCardBehavior,
  f: idleCardBehavior,
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

function cooldownReady(tower: Tower, time: number) {
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
  const candidates = enemies.filter(canHomingProjectileTarget);
  const flyingCandidates = candidates.filter(enemyIsRegularFlying);
  return closestEnemyTo(flyingCandidates.length > 0 ? flyingCandidates : candidates, x, y);
}

function canHomingProjectileTarget(enemy: Enemy) {
  return !enemyIsBurrowed(enemy) && !enemyIsHighFlying(enemy);
}

function enemyIsRegularFlying(enemy: Enemy) {
  return enemy.statusEffects.some((effect) => effect.name === "flying");
}

function closestEnemyTo(enemies: Enemy[], x: number, y: number) {
  let closest: Enemy | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    const distance = Math.hypot(enemy.x - x, enemy.y - y);
    if (distance < closestDistance) {
      closest = enemy;
      closestDistance = distance;
    }
  }
  return closest;
}

function hasMagicLaserTarget(tower: Tower, runtime: CardReadinessRuntime) {
  const endX = magicLaserEndX(tower, runtime.enemies, runtime);
  return magicLaserTargets(tower, runtime.enemies, runtime).length > 0 || magicLaserHitsBoss(tower, runtime.boss, endX);
}

function fireMagicLaser(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const endX = magicLaserEndX(tower, runtime.enemies, runtime);
  const startX = tower.x + towerFacingDirection(tower) * MAGIC_LASER_START_OFFSET;
  const targets = magicLaserTargets(tower, runtime.enemies, runtime);
  const damage = scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  const damageType = towerDamageType(tower, definition.damageType ?? "magic", runtime.battleTime);

  makeTowerLaserEffect(runtime.scene, startX, tower.y, endX);
  for (const enemy of targets) {
    makeHitShards(runtime.scene, enemy.x, enemy.y, damageType);
    runtime.damageEnemy(enemy, damage, damageType, tower);
    if (runtime.enemies.includes(enemy) && definition.projectileDebuff && definition.projectileDebuffDuration) {
      applyStatusEffect(enemy, definition.projectileDebuff, definition.projectileDebuffDuration, runtime.battleTime);
      if (definition.projectileDebuff === "sunder") {
        makeSunderEffect(runtime.scene, enemy.x, enemy.y);
      }
    }
  }

  const bossPart = magicLaserBossPart(tower, runtime.boss, endX);
  if (bossPart) {
    runtime.damageBoss(damage, damageType, bossPart);
  }
}

function magicLaserTargets(tower: Tower, enemies: Enemy[], runtime: CardReadinessRuntime) {
  const direction = towerFacingDirection(tower);
  const candidates = enemies
    .filter((enemy) => canMagicLaserHitEnemy(tower, enemy))
    .sort((a, b) => (direction > 0 ? a.x - b.x : b.x - a.x));
  const stoppingTarget = candidates.find((enemy) => enemyDefenseStats(enemy, enemies, runtime.battleTime).magicResistance > 0);
  if (!stoppingTarget) {
    return candidates;
  }

  return candidates.filter((enemy) => direction > 0 ? enemy.x <= stoppingTarget.x : enemy.x >= stoppingTarget.x);
}

function magicLaserEndX(tower: Tower, enemies: Enemy[], runtime: CardReadinessRuntime) {
  const direction = towerFacingDirection(tower);
  const stoppingTarget = enemies
    .filter((enemy) => canMagicLaserHitEnemy(tower, enemy))
    .sort((a, b) => (direction > 0 ? a.x - b.x : b.x - a.x))
    .find((enemy) => enemyDefenseStats(enemy, enemies, runtime.battleTime).magicResistance > 0);
  return stoppingTarget?.x ?? (direction > 0 ? BOARD_X + COLUMNS * CELL_WIDTH : BOARD_X);
}

function canMagicLaserHitEnemy(tower: Tower, enemy: Enemy) {
  if (enemyIsBurrowed(enemy) || enemyIsHighFlying(enemy) || enemy.lane !== tower.lane) {
    return false;
  }

  const direction = towerFacingDirection(tower);
  return direction > 0
    ? enemy.x > tower.x + MAGIC_LASER_START_OFFSET
    : enemy.x < tower.x - MAGIC_LASER_START_OFFSET;
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
  return bossParts(boss).find((part) => {
    const rect = bossRect(part);
    return tower.y >= rect.top && tower.y <= rect.bottom && rect.right >= left && rect.left <= right;
  });
}

function fireHealingPulse(
  tower: Tower,
  definition: CardDefinition,
  runtime: Pick<CardBehaviorRuntime, "scene" | "occupied">
) {
  const targets = getHealTargets(tower, definition, runtime.occupied, definition.healTargets ?? 1);
  if (targets.length === 0) {
    return;
  }

  for (const target of targets) {
    healTower(runtime.scene, target, definition.healAmount ?? 60);
  }
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
  const shiftDirection = blockedPushDirection(tower);
  for (const target of targets) {
    const previousX = target.x;
    target.x += shiftDirection * shiftDistance;
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

  const bossPart = bossParts(boss).find((part) => canAttackBossPart(tower, definition, part)) ?? boss;
  const rect = bossRect(bossPart);
  const x = Phaser.Math.Clamp(tower.x + towerFacingDirection(tower) * CELL_WIDTH, rect.left, rect.right);
  const y = Phaser.Math.Clamp(tower.y, rect.top, rect.bottom);
  makeSlashEffect(runtime.scene, x, y, damageType);
  runtime.damageBoss(damage, damageType, bossPart);
  gainAttackProduction(definition, runtime, x, y);
}

function fireArcWave(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const damage = scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  const damageType = towerDamageType(tower, definition.damageType ?? "magic", runtime.battleTime);
  const direction = towerFacingDirection(tower);
  makeArcWaveEffect(runtime.scene, tower.x - direction * CELL_WIDTH * 0.24, tower.y, damageType, direction);

  for (const enemy of arcWaveEnemyTargets(tower, runtime.enemies)) {
    runtime.damageEnemy(enemy, damage, damageType, tower);
  }

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
  const speed = getBlockingTower(runtime.towers, enemy)
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

  const part = bossParts(boss).find((candidate) => canAttackBossPart(tower, definition, candidate)) ?? boss;
  const rect = bossRect(part);
  const durationSeconds = PREDICTIVE_MORTAR_DURATION / 1_000;
  const distance = part.finalStats.speed * durationSeconds;
  const direction = part.movementDirection ?? -1;
  return {
    x: part.x + ((part.movementAxis ?? "x") === "x" ? direction * distance : 0),
    y:
      (part.movementAxis ?? "x") === "y"
        ? part.y + direction * distance
        : Phaser.Math.Clamp(tower.y, rect.top, rect.bottom)
  };
}

function arcWaveBossPart(tower: Tower, boss: CubeBoss | null) {
  if (!boss) {
    return undefined;
  }

  return bossParts(boss).find((part) => {
    const rect = bossRect(part);
    return arcWaveCells(tower).some((cell) => Phaser.Geom.Intersects.RectangleToRectangle(cell, rect));
  });
}

function arcWaveHitsBoss(tower: Tower, boss: CubeBoss | null) {
  return Boolean(arcWaveBossPart(tower, boss));
}

function hasArcWaveTarget(tower: Tower, enemies: Enemy[], boss: CubeBoss | null) {
  return arcWaveEnemyTargets(tower, enemies).length > 0 || arcWaveHitsBoss(tower, boss);
}

function arcWaveEnemyTargets(tower: Tower, enemies: Enemy[]) {
  const cells = arcWaveCells(tower);
  return enemies.filter((enemy) => !enemyIsHighFlying(enemy) && cells.some((cell) => cell.contains(enemy.x, enemy.y)));
}

function arcWaveCells(tower: Tower) {
  const cells: Phaser.Geom.Rectangle[] = [];
  const direction = towerFacingDirection(tower);
  for (const lane of [tower.lane - 1, tower.lane, tower.lane + 1]) {
    for (const column of [tower.column, tower.column + direction]) {
      addBoardCell(cells, lane, column);
    }
  }
  addBoardCell(cells, tower.lane, tower.column + direction * 2);
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
  tower.hp = Math.min(towerFinalStats(tower).maxHp, tower.hp + amount);
  if (tower.hp <= previousHp) {
    return;
  }

  syncTowerHpBar(tower);
  makeHealParticles(scene, tower.x, tower.y);
}

function towerProjectileSpecs(tower: Tower, definition: CardDefinition, battleTime: number): TowerProjectileSpec[] {
  const pattern = getProjectilePattern(tower.type);
  if (!pattern) {
    return [];
  }

  const damageType = towerDamageType(tower, definition.damageType, battleTime);
  return pattern.shots.map((shot) => {
    const mirrored = shouldMirrorProjectilePattern(tower, pattern);
    const angleDegrees = mirrored ? 180 - shot.angleDegrees : shot.angleDegrees;
    const muzzle = projectileMuzzlePoint(tower, shot.muzzle ?? pattern.defaultMuzzle, mirrored);
    const limitDirection = Math.cos(Phaser.Math.DegToRad(angleDegrees)) < 0 ? -1 : 1;
    const spec = makeProjectileSpec(
      pattern,
      muzzle.x,
      muzzle.y,
      tower.lane,
      definition,
      damageType,
      angleDegrees,
      projectileLimitX(tower, definition, pattern, limitDirection),
      limitDirection
    );
    return {
      ...spec,
      damage: towerProjectileDamage(tower, definition),
      sourceTower: tower
    };
  });
}

function towerProjectileDamage(tower: Tower, definition: CardDefinition) {
  if (tower.type === "Q") {
    return scaledByEffectiveUpgrades(definition.damage ?? 0, effectiveTowerLevel(tower));
  }

  return definition.damage ?? 0;
}

function makeProjectileSpec(
  pattern: ProjectilePatternConfig,
  x: number,
  y: number,
  lane: number,
  definition: CardDefinition,
  damageType: TowerProjectileSpec["damageType"],
  angleDegrees: number,
  maxX = Number.POSITIVE_INFINITY,
  limitDirection: -1 | 1 = 1
): TowerProjectileSpec {
  return {
    type: pattern.projectileKind,
    x,
    y,
    lane,
    speed: pattern.speed,
    damage: definition.damage ?? 0,
    damageType,
    debuff: definition.projectileDebuff,
    debuffDuration: definition.projectileDebuffDuration,
    splashRadius: projectileSplashRadius(pattern, definition),
    angleDegrees,
    maxX,
    limitDirection
  };
}

function projectileMuzzlePoint(tower: Tower, muzzle: MuzzlePoint, mirrored: boolean) {
  const adjustedMuzzle = mirrored ? mirrorMuzzle(muzzle) : muzzle;
  const faceOffset = muzzleFaceOffsets[adjustedMuzzle.face];
  return {
    x: tower.x + faceOffset.x + (adjustedMuzzle.offsetX ?? 0),
    y: tower.y + faceOffset.y + (adjustedMuzzle.offsetY ?? 0)
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

function mirrorMuzzle(muzzle: MuzzlePoint): MuzzlePoint {
  return {
    ...muzzle,
    face: mirrorMuzzleFace(muzzle.face),
    offsetX: muzzle.offsetX ? -muzzle.offsetX : muzzle.offsetX
  };
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
