import Phaser from "phaser";
import { CELL_HEIGHT, CELL_WIDTH, FLYING_DISPLAY_OFFSET_Y, palette } from "../config";
import { enemyIsBossCompanion, enemyIsMace } from "../registry/enemies";
import { makeShiftEffect, makeShockPulse } from "../render/combatEffects";
import type { Enemy, Tower } from "../types";
import type { EnemyAdvanceRuntime } from "./combatRuntime";
import { enemyMovementSpeed } from "./combatStats";
import { enemyIgnoresLeaderRestrictedMechanics, enemyIsBurrowed, enemyIsHighFlying, siegeRamSpeed } from "./enemyBehaviors";
import { applyStatusEffect, removeStatusEffect, statusSpeedMultiplier, syncEnemyBodyPosition } from "./statusEffects";

const SLOPE_TOUCH_RANGE_X = CELL_WIDTH * 0.58;
const SLOPE_TOUCH_RANGE_Y = CELL_HEIGHT * 0.55;
const HIGH_FLIGHT_MIN_DURATION = 900;
const HIGH_FLIGHT_MAX_DURATION = 2_600;
const HIGH_FLIGHT_STATUS_BUFFER = 80;

export function advanceHighFlyingEnemy(enemy: Enemy, time: number) {
  if (!enemyIsHighFlying(enemy)) {
    return false;
  }

  if (enemy.highFlightUntil === undefined) {
    statusSpeedMultiplier(enemy, time);
    if (!enemy.statusEffects.some((effect) => effect.name === "highFlying")) {
      landHighFlyingEnemy(enemy);
      return false;
    }

    enemy.body.setDepth(85 + enemy.lane);
    syncHighFlyingHalo(enemy, time);
    enemy.body.setPosition(enemy.x, enemy.y + FLYING_DISPLAY_OFFSET_Y + Math.sin(time / 130) * 2);
    return false;
  }

  const startedAt = enemy.highFlightStartedAt ?? time;
  const until = enemy.highFlightUntil ?? time;
  const duration = Math.max(1, until - startedAt);
  const progress = Phaser.Math.Clamp((time - startedAt) / duration, 0, 1);
  statusSpeedMultiplier(enemy, time);

  if (progress >= 1) {
    landHighFlyingEnemy(enemy);
    return true;
  }

  const startX = enemy.highFlightStartX ?? enemy.x;
  const startY = enemy.highFlightStartY ?? enemy.y;
  const targetX = enemy.highFlightTargetX ?? enemy.x;
  const targetY = enemy.highFlightTargetY ?? enemy.y;
  const peakHeight = enemy.highFlightPeakHeight ?? CELL_HEIGHT;
  const arcOffset = Math.sin(progress * Math.PI) * peakHeight;

  enemy.x = Phaser.Math.Linear(startX, targetX, progress);
  enemy.y = Phaser.Math.Linear(startY, targetY, progress) - arcOffset;
  enemy.body.setDepth(85 + enemy.lane);
  syncHighFlyingHalo(enemy, time);
  syncEnemyBodyPosition(enemy);
  return true;
}

export function advanceSlopeTriangle(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  blocker: Tower | undefined,
  time: number
) {
  if (enemy.kind !== "slopeTriangle") {
    return false;
  }

  if (!blocker) {
    enemy.blockedByTowerId = undefined;
    enemy.blockedSince = undefined;
    return false;
  }

  enemy.slopeFacingDirection = enemy.slopeFacingDirection ?? enemy.movementDirection ?? -1;
  const isNewBlocker = enemy.blockedByTowerId !== blocker.id;
  enemy.blockedByTowerId = blocker.id;
  enemy.blockedSince = isNewBlocker ? time : enemy.blockedSince ?? time;
  if (isNewBlocker) {
    makeShockPulse(runtime.scene, enemy.x, enemy.y, CELL_WIDTH * 0.72, CELL_HEIGHT * 0.62);
  }
  launchTouchingEnemies(runtime, enemy, time);
  syncEnemyBodyPosition(enemy);
  return true;
}

function launchTouchingEnemies(runtime: EnemyAdvanceRuntime, slope: Enemy, time: number) {
  const facingDirection = slope.slopeFacingDirection ?? slope.movementDirection ?? -1;
  for (const target of [...runtime.enemies]) {
    if (!canSlopeLaunchEnemy(target, slope)) {
      continue;
    }

    const motion = currentMotion(runtime, target, time);
    if (!motion || motion.direction !== facingDirection) {
      continue;
    }

    launchHighFlyingEnemy(runtime, target, motion.direction, motion.speed, time, slope);
  }
}

function canSlopeLaunchEnemy(target: Enemy, slope: Enemy) {
  return (
    target !== slope &&
    !enemyIgnoresLeaderRestrictedMechanics(target) &&
    !enemyIsBossCompanion(target.kind) &&
    !enemyIsBurrowed(target) &&
    !enemyIsHighFlying(target) &&
    target.lane === slope.lane &&
    Math.abs(target.x - slope.x) <= SLOPE_TOUCH_RANGE_X &&
    Math.abs(target.y - slope.y) <= SLOPE_TOUCH_RANGE_Y
  );
}

function currentMotion(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  const direction = currentMotionDirection(enemy);
  if (!direction) {
    return null;
  }

  const speed = enemyMovementSpeed(
    enemy,
    { enemies: runtime.enemies, towers: runtime.towers, time },
    currentBaseSpeed(enemy)
  );

  return speed > 0 ? { direction, speed } : null;
}

function currentMotionDirection(enemy: Enemy) {
  if (enemyIsMace(enemy.kind)) {
    const velocityDirection = Math.sign(enemy.maceVelocity ?? 0);
    return velocityDirection === 0 ? undefined : (velocityDirection as -1 | 1);
  }

  return enemy.movementDirection ?? -1;
}

function currentBaseSpeed(enemy: Enemy) {
  if (enemyIsMace(enemy.kind)) {
    return Math.abs(enemy.maceVelocity ?? 0);
  }

  return siegeRamSpeed(enemy);
}

function launchHighFlyingEnemy(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  direction: -1 | 1,
  speed: number,
  time: number,
  slope: Enemy
) {
  const distance = (speed / 10) * 1.5 * CELL_WIDTH;
  const duration = Phaser.Math.Clamp(750 + distance * 3.2, HIGH_FLIGHT_MIN_DURATION, HIGH_FLIGHT_MAX_DURATION);
  const peakHeight = Phaser.Math.Clamp(CELL_HEIGHT * 0.72 + distance * 0.18, CELL_HEIGHT * 0.85, CELL_HEIGHT * 2.4);
  const targetX = enemy.x + direction * distance;

  enemy.highFlightStartedAt = time;
  enemy.highFlightUntil = time + duration;
  enemy.highFlightStartX = enemy.x;
  enemy.highFlightStartY = enemy.y;
  enemy.highFlightTargetX = targetX;
  enemy.highFlightTargetY = enemy.y;
  enemy.highFlightPeakHeight = peakHeight;
  enemy.blockedByTowerId = undefined;
  enemy.blockedSince = undefined;
  applyStatusEffect(enemy, "highFlying", duration + HIGH_FLIGHT_STATUS_BUFFER, time, 1, true);
  syncHighFlyingHalo(enemy, time);
  makeShiftEffect(runtime.scene, enemy.x, enemy.y, targetX, enemy.y);
  makeShockPulse(runtime.scene, slope.x, slope.y, CELL_WIDTH * 0.48, CELL_HEIGHT * 0.48);
}

function landHighFlyingEnemy(enemy: Enemy) {
  enemy.x = enemy.highFlightTargetX ?? enemy.x;
  enemy.y = enemy.highFlightTargetY ?? enemy.y;
  enemy.highFlightStartedAt = undefined;
  enemy.highFlightUntil = undefined;
  enemy.highFlightStartX = undefined;
  enemy.highFlightStartY = undefined;
  enemy.highFlightTargetX = undefined;
  enemy.highFlightTargetY = undefined;
  enemy.highFlightPeakHeight = undefined;
  removeStatusEffect(enemy, "highFlying");
  const regularHaloActive = enemy.statusEffects.some((effect) => effect.name === "flying" && effect.showHalo);
  enemy.flyingHalo.setVisible(regularHaloActive);
  if (!regularHaloActive) {
    enemy.flyingHalo.setScale(1, 1);
  }
  enemy.body.setDepth(60 + enemy.lane);
  syncEnemyBodyPosition(enemy);
}

function syncHighFlyingHalo(enemy: Enemy, time: number) {
  if (enemy.kind === "archangelHeptagon") {
    enemy.flyingHalo.setVisible(false);
    return;
  }

  enemy.flyingHalo.setVisible(true);
  enemy.flyingHalo.setStrokeStyle(2, palette.gold, 0.94);
  enemy.flyingHalo.setY(-44 + Math.sin(time / 95) * 2);
  enemy.flyingHalo.setScale(1 + Math.sin(time / 140) * 0.06, 1);
}
