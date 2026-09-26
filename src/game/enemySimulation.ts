import * as battleMath from "./battleMath";
import { createMinusProjectiles } from "./enemyHomingProjectiles";
import { releaseBurrowCargo, destroyContainedEnemies } from "./enemyReleaseRules";
import { syncPassengerPositionState } from "./enemyContainerRules";
import { addEnemyToField, removeEnemyFromField } from "./enemyRoster";
import { advanceIonCharge, enemyUsesMaceMovement, updateChevronPhase } from "./chevronLeader";
import { HEART_ATTACK_RADIUS, ENEMY_MORTAR_RANGE_X, ENEMY_MORTAR_RANGE_Y } from "../data/enemyCombatConfig";
import { towerAreaTargets, towerDamageReceiver } from "./towerOccupancy";
import { collectParenthesisPassengers, passengerMovementStatus } from "./parenthesisRules";
import { enemyCanBeLoaded, enemyIsActive, enemyMaximumHp } from "./enemyContainerRules";
import { towerBehaviorType } from "./towerIdentity";
import type { EnemyAttackAction } from "./battleActions";
import { enemyFacingDirection, enemyMovementDirection } from "./rules/reversal";
import { isShockTower } from "./towerRules";
import { redirectOrientedTarget } from "./orientationRules";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, LANES } from "../config";
import { getCardDefinition } from "../registry/cardDefinitions";
import {
  enemyKindAtRank,
  enemyBlockedDetonation,
  enemyFamily,
  enemyIsBossCompanion,
  enemyIsLaser,
  enemyIsLeader,
  enemyIsMortar,
  enemyIsSiegeRam,
  enemyRank,
  getEnemyDefinition
} from "../registry/enemies";
import type { EnemyKind } from "../types";
import type { EnemyState as Enemy } from "./enemyState";
import type { TowerState as Tower } from "./towerState";
import type { BossState as CubeBoss } from "./bossState";
import type { EnemySimulationRuntime as EnemyAdvanceRuntime } from "./enemySimulationRuntime";
import {
  canEnemyMelee, enemyIgnoresLeaderRestrictedMechanics, enemyIsBurrowed, enemyIsHighFlying,
  enemyVolleyShotCount, shouldEnemyShoot, siegeRamSpeed
} from "./enemyCombatRules";
import { detachEnemyHealth } from "./enemyHealth";
import { createEnemyProjectileState, createIonProjectileState } from "./enemyProjectileRules";
import { enemyAttackDamage, enemyAttackMultiplier, enemyMovementMultiplier, enemyMovementSpeed } from "./combatStats";
import {
  enemySupportBonuses,
  enemySupportSources,
  type EnemySupportSources
} from "./enemySupport";
import { updateEnemySkills } from "./enemySkillExecution";
import { forEachInitial, forEachSnapshot } from "./iteration";
import { advanceHighFlyingEnemy, advanceSlopeTriangle } from "./slopeRules";
import {
  SOLAR_BOMB_BOUNCE_COOLDOWN,
  SOLAR_BOMB_COLLISION_DAMAGE,
  SOLAR_BOMB_DEPLETED_BOSS_ACCELERATION,
  SOLAR_BOMB_RADIUS,
  SOLAR_BOMB_SHIELD_BREAK_AOE_DAMAGE,
  SOLAR_BOMB_SHIELD_BREAK_AOE_RADIUS_CELLS,
  bounceSolarBombFromPoint,
  solarBombIsDepleted,
  vectorLength
} from "./solarBombRules";
import { enemyIsSolarBomb } from "./enemyIdentity";
import { slowAuraSources, type SlowAuraSources } from "./slowAura";
import { applyStatusEffect, hasUnexpiredStatusEffect, statusMultipliers, type StatusMultipliers } from "./statusEffects";
import { hasStatusEffectName } from "./rules/statusEffectRules";
import { getBlockingTowerFromOccupied, getSweptBlockingTowerFromOccupied, latestPlacedTower } from "./enemyBlockingRules";
import { bossBounds, forEachBossPart, type RectBounds } from "./unitGeometry";
import { isTrapArmed, towerDamageType } from "./towerRules";
import { towerAttackAmount, towerFinalStats } from "./unitStatRules";
import { volleyInterval } from "./upgrades";
import { repeatHits, volleyHitsAt, volleyTimingCount } from "./volley";
import { oscillationTarget, commitOscillation } from "./oscillatingMovement";

interface EnemyScratch { blockedCounts: Map<string, number>; laserTargets: Tower[] }
const scratchBuffers = new WeakMap<EnemyAdvanceRuntime, EnemyScratch>();
function scratch(runtime: EnemyAdvanceRuntime) {
  let buffer = scratchBuffers.get(runtime);
  if (!buffer) {
    buffer = { blockedCounts: new Map(), laserTargets: [] };
    scratchBuffers.set(runtime, buffer);
  }
  return buffer;
}

export function advanceEnemies(runtime: EnemyAdvanceRuntime, time: number, seconds: number) {
  if (runtime.enemies.length === 0) {
    return;
  }

  forEachSnapshot(runtime.enemies, enemy => collectParenthesisPassengers(enemy, runtime.enemies, time, runtime.presentation));
  const passengerPositions = runtime.enemies.some(enemy => enemyFamily(enemy.kind) === "parentheses" &&
    (enemy.parenthesisCargo?.length ?? 0) < enemyRank(enemy.kind) + 1)
    ? new Map(runtime.enemies.map(enemy => [enemy, { x: enemy.x, y: enemy.y }])) : undefined;
  updateEnemySkills(runtime, seconds, time);
  const supportSources = enemySupportSources(runtime.enemies);
  const slowSources = slowAuraSources(runtime.towers);

  forEachInitial(runtime.enemies, (enemy) => {
    if (!enemy.inPlay) {
      return;
    }

    const status = statusMultipliers(enemy, time);
    if (updateChevronPhase(enemy)) runtime.presentation.chevron(enemy);
    if (hasStatusEffectName(enemy, "frozen")) {
      return;
    }

    if (advanceHighFlyingEnemy(enemy, time, runtime.presentation)) {
      return;
    }

    if (advanceSolarBomb(runtime, enemy, time, seconds, status, supportSources, slowSources)) {
      return;
    }

    const baseMovementSpeed = siegeRamSpeed(enemy);
    const support = enemySupportBonuses(runtime.enemies, enemy, {
      includeDefense: true,
      includeMovement: true,
      sources: supportSources
    });
    let movementSpeed = enemyMovementSpeed(
      enemy,
      { enemies: runtime.enemies, towers: runtime.towers, time, support, status, supportSources, slowAuraSources: slowSources },
      baseMovementSpeed
    );
    for (const passenger of enemy.parenthesisCargo ?? []) {
      const inherited = passengerMovementStatus(passenger, enemy, time);
      const speed = enemyUsesMaceMovement(passenger)
        ? Math.abs(hexMaceMovementTargetX(runtime, passenger, seconds, time, inherited, supportSources, slowSources) - passenger.x) / Math.max(seconds, 1e-9)
        : enemyMovementSpeed(passenger, { enemies: runtime.enemies, towers: runtime.towers, time,
          status: inherited, supportSources, slowAuraSources: slowSources }, siegeRamSpeed(passenger));
      movementSpeed = Math.max(movementSpeed, speed);
      if (!enemyIsHighFlying(passenger) && !hasStatusEffectName(passenger, "frozen")) updateEnemyRangedAttack(runtime, passenger, time);
    }
    enemy.finalStats.speed = movementSpeed;
    if (hasStatusEffectName(enemy, "haste") && time >= enemy.nextHasteTrailAt) {
      runtime.presentation.hasteTrail(enemy.x, enemy.y);
      enemy.nextHasteTrailAt = time + 120;
    }

    if (advanceBurrowArrow(runtime, enemy, time, seconds, status, supportSources, slowSources)) {
      if (enemy.x < BOARD_X - 34 && runtime.onEnemyReachedBase(enemy)) {
        return false;
      }

      if (enemy.x > BOARD_X + BOARD_WIDTH + 70) {
        removeEscapedReverseEnemy(runtime, enemy);
      }
      return;
    }

    updateEnemyRangedAttack(runtime, enemy, time);
    if (!enemyIsHighFlying(enemy) && advanceIonCharge(enemy, seconds)) runtime.enemyProjectiles.push(runtime.createProjectile(createIonProjectileState(enemy, time)));
    runtime.presentation.chevron(enemy);

    if (enemyFamily(enemy.kind) === "heart" && time >= enemy.attackAt) {
      fireLeaderAreaAttack(runtime, enemy, time);
      enemy.attackAt = time + enemy.finalStats.attackInterval;
    }

    let blocker = getBlockingTowerFromOccupied(runtime.occupied, enemy);
    let nextX = enemy.x;
    let nextY = enemy.y;
    let nextPhase = enemy.oscillationPhase ?? 0;
    if (!blocker) {
      nextX = enemyUsesMaceMovement(enemy)
        ? hexMaceMovementTargetX(runtime, enemy, seconds, time, status, supportSources, slowSources)
        : enemy.x + enemyMovementDirection(enemy) * movementSpeed * seconds;
      if (enemy.oscillationCenterY !== undefined && movementSpeed > 0) {
        const target = oscillationTarget(enemy, seconds * movementSpeed / Math.max(1, enemy.baseStats.speed));
        nextY = target.y;
        nextPhase = target.phase;
      }
      const contact = getSweptBlockingTowerFromOccupied(runtime.occupied, enemy, nextX, nextY);
      runtime.projectileMotion?.record(enemy, enemy.x, enemy.y, contact?.x ?? nextX, contact?.y ?? nextY);
      if (contact) {
        enemy.x = contact.x;
        if (enemy.oscillationCenterY !== undefined) {
          const phase = enemy.oscillationPhase ?? 0;
          commitOscillation(enemy, contact.y, phase + (nextPhase - phase) * contact.fraction);
        }
        syncEnemyPosition(runtime, enemy);
        blocker = contact.tower;
      }
    }

    if (blocker) {
      const wingedPassenger = enemy.parenthesisCargo?.find(passenger => enemyFamily(passenger.kind) === "angelPentagonRam" &&
        !passenger.angelRamWingsTriggered && !hasUnexpiredStatusEffect(passenger, "frozen", time));
      if (wingedPassenger) {
        wingedPassenger.angelRamWingsTriggered = true;
        applyStatusEffect(enemy, "flying", 2_000, time, 1, true);
        runtime.presentation.wings(enemy.x, enemy.y);
        syncEnemyPosition(runtime, enemy);
        return;
      }
      if (towerBehaviorType(blocker) === "G" && isTrapArmed(blocker, time)) {
        runtime.triggerTrapTower(blocker, enemy);
        return;
      }

      if (isShockTower(blocker)) {
        runtime.triggerShockTower(blocker);
        return;
      }

      if (advanceSlopeTriangle(runtime, enemy, blocker, time)) {
        return;
      }

      if (advanceSiegeRam(runtime, enemy, blocker, time)) {
        return;
      }

      if (advanceHexMace(runtime, enemy, blocker, time, status, supportSources, slowSources)) {
        return;
      }

      if (canEnemyMelee(enemy) && time >= enemy.attackAt) {
        const target = towerDamageReceiver(redirectOrientedTarget(runtime.towers, blocker, time)!);
        runtime.damageTower(target, enemyAttackDamage(enemy, time), enemy.damageType);
        const blockerDefinition = getCardDefinition(towerBehaviorType(target));
        if (blockerDefinition.reflectAttackMultiplier && !runtime.onRetaliation?.(target, enemy)) {
          runtime.damageEnemy(
            enemy,
            towerAttackAmount(target, blockerDefinition, blockerDefinition.reflectAttackMultiplier),
            towerDamageType(target, blockerDefinition.damageType ?? "physical", time),
            target
          );
          runtime.presentation.reflect(target.x, target.y);
        }
        enemy.attackAt = time + enemy.finalStats.attackInterval;
      }
    }

    if (advanceSlopeTriangle(runtime, enemy, blocker, time)) {
      return;
    }

    if (advanceBlockedDetonator(runtime, enemy, blocker, time)) {
      return;
    }

    const movementDirection = enemyUsesMaceMovement(enemy) ? Math.sign(enemy.maceVelocity ?? 0) : enemyMovementDirection(enemy);
    if (!blocker) {
      enemy.x = nextX;
      if (enemy.oscillationCenterY !== undefined) commitOscillation(enemy, nextY, nextPhase);
      syncEnemyPosition(runtime, enemy);
    }

    if (!enemy.inPlay) {
      return;
    }

    if (enemyIsBossCompanion(enemy.kind)) {
      return;
    }

    if (movementDirection < 0 && enemy.x < BOARD_X - 34) {
      const exit = () => runtime.onEnemyReachedBase(enemy);
      if (runtime.projectileMotion ? runtime.projectileMotion.deferExit(enemy, exit) : exit()) return false;
    }

    if (movementDirection > 0 && enemy.x > BOARD_X + BOARD_WIDTH + 70) {
      const exit = () => removeEscapedReverseEnemy(runtime, enemy);
      if (runtime.projectileMotion) runtime.projectileMotion.deferExit(enemy, exit);
      else exit();
    }
  });
  if (passengerPositions) {
    forEachSnapshot(runtime.enemies, enemy => collectParenthesisPassengers(enemy, runtime.enemies, time, runtime.presentation, passengerPositions));
  }
  for (const enemy of runtime.enemies) {
    syncPassengerPositionState(enemy);
    runtime.presentation.passengerSeats(enemy);
  }
}

function updateEnemyRangedAttack(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  if (!shouldEnemyShoot(enemy, time)) return;
  const shots = volleyTimingCount(enemyVolleyShotCount(enemy));
  const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
  if (enemyIsMortar(enemy.kind)) {
    enemy.attackAt = fireEnemyMortarVolley(runtime, enemy, time) ? time + enemy.finalStats.attackInterval + (shots - 1) * interval : time + 1_000;
  } else {
    if (enemyIsLaser(enemy.kind)) fireEnemyLaserVolley(runtime, enemy, time);
    else fireEnemyVolley(runtime, enemy, time);
    enemy.attackAt = time + enemy.finalStats.attackInterval + (shots - 1) * interval;
  }
}

type SolarBombCollision =
  | { kind: "tower"; target: Tower; x: number; y: number; distanceSq: number }
  | { kind: "boss"; target: CubeBoss; x: number; y: number; distanceSq: number };

function advanceSolarBomb(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  time: number,
  seconds: number,
  status: StatusMultipliers,
  supportSources: EnemySupportSources,
  slowSources: SlowAuraSources
) {
  if (!enemyIsSolarBomb(enemy)) {
    return false;
  }

  initializeSolarBombVelocity(enemy);
  accelerateDepletedSolarBombTowardInvincibleBoss(runtime, enemy, time, seconds);
  const rawVelocityX = enemy.solarBombVelocityX ?? 0;
  const rawVelocityY = enemy.solarBombVelocityY ?? 0;
  const baseSpeed = Math.max(vectorLength(rawVelocityX, rawVelocityY), enemy.baseStats.speed || 1);
  const movementMultiplier = enemyMovementMultiplier(
    enemy,
    { enemies: runtime.enemies, towers: runtime.towers, time, status, supportSources, slowAuraSources: slowSources },
    baseSpeed
  );

  enemy.x += rawVelocityX * movementMultiplier * seconds;
  enemy.y += rawVelocityY * movementMultiplier * seconds;
  bounceSolarBombOffBoard(enemy);
  syncSolarBombLane(runtime, enemy);
  runtime.presentation.rotateSolarBomb(enemy, seconds);
  runtime.presentation.solarBomb(enemy);
  syncEnemyPosition(runtime, enemy);

  if (time < (enemy.solarBombLastCollisionAt ?? 0) + SOLAR_BOMB_BOUNCE_COOLDOWN) {
    return true;
  }

  const collision = findSolarBombCollision(runtime, enemy);
  if (!collision) {
    return true;
  }

  enemy.solarBombLastCollisionAt = time;
  bounceSolarBombFromPoint(enemy, collision.x, collision.y);
  syncSolarBombLane(runtime, enemy);
  syncEnemyPosition(runtime, enemy);
  runtime.presentation.solarCollision(collision.x, collision.y);

  if (collision.kind === "tower") {
    runtime.damageTower(collision.target, SOLAR_BOMB_COLLISION_DAMAGE, "true");
  } else {
    const breaksOctahedronShield = solarBombBreaksOctahedronShield(enemy, collision.target, time);
    if (breaksOctahedronShield) {
      collision.target.invincibleUntil = 0;
    }
    runtime.damageBoss(SOLAR_BOMB_COLLISION_DAMAGE, "true", collision.target);
    if (breaksOctahedronShield) {
      detonateSolarBombShieldBreak(runtime, enemy);
      removeSolarBomb(runtime, enemy);
    }
  }

  return true;
}

function solarBombBreaksOctahedronShield(enemy: Enemy, boss: CubeBoss, time: number) {
  return solarBombIsDepleted(enemy) && (boss.kind === "octahedron" || boss.kind === "octahedron2") && boss.invincibleUntil > time;
}

function removeSolarBomb(runtime: EnemyAdvanceRuntime, enemy: Enemy) {
  enemy.inPlay = false;
  removeEnemyFromField(runtime.enemies, enemy);
  runtime.presentation.remove(enemy);
}

function initializeSolarBombVelocity(enemy: Enemy) {
  if (enemy.solarBombVelocityX !== undefined && enemy.solarBombVelocityY !== undefined) {
    return;
  }

  const direction = enemy.movementDirection ?? -1;
  enemy.solarBombVelocityX = direction * enemy.baseStats.speed;
  enemy.solarBombVelocityY = 0;
}

function accelerateDepletedSolarBombTowardInvincibleBoss(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  time: number,
  seconds: number
) {
  if (!solarBombIsDepleted(enemy)) {
    return;
  }

  const target = nearestInvincibleBossPart(runtime, enemy, time);
  if (!target) {
    return;
  }

  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = vectorLength(dx, dy);
  if (distance <= 0.001) {
    return;
  }

  enemy.solarBombVelocityX =
    (enemy.solarBombVelocityX ?? 0) + (dx / distance) * SOLAR_BOMB_DEPLETED_BOSS_ACCELERATION * seconds;
  enemy.solarBombVelocityY =
    (enemy.solarBombVelocityY ?? 0) + (dy / distance) * SOLAR_BOMB_DEPLETED_BOSS_ACCELERATION * seconds;
}

function nearestInvincibleBossPart(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  let target: CubeBoss | undefined;
  let targetDistanceSq = Number.POSITIVE_INFINITY;
  forEachBossPart(runtime.boss, (part) => {
    if (part.invincibleUntil <= time) {
      return;
    }

    const distanceSq = pointDistanceSq(enemy.x, enemy.y, part.x, part.y);
    if (distanceSq < targetDistanceSq) {
      target = part;
      targetDistanceSq = distanceSq;
    }
  });
  return target;
}

function bounceSolarBombOffBoard(enemy: Enemy) {
  const left = BOARD_X + SOLAR_BOMB_RADIUS;
  const right = BOARD_X + BOARD_WIDTH - SOLAR_BOMB_RADIUS;
  const top = BOARD_Y + SOLAR_BOMB_RADIUS;
  const bottom = BOARD_Y + BOARD_HEIGHT - SOLAR_BOMB_RADIUS;
  let velocityX = enemy.solarBombVelocityX ?? 0;
  let velocityY = enemy.solarBombVelocityY ?? 0;

  if (enemy.x < left) {
    enemy.x = left;
    velocityX = Math.abs(velocityX || enemy.baseStats.speed);
  } else if (enemy.x > right) {
    enemy.x = right;
    velocityX = -Math.abs(velocityX || enemy.baseStats.speed);
  }

  if (enemy.y < top) {
    enemy.y = top;
    velocityY = Math.abs(velocityY || enemy.baseStats.speed);
  } else if (enemy.y > bottom) {
    enemy.y = bottom;
    velocityY = -Math.abs(velocityY || enemy.baseStats.speed);
  }

  enemy.solarBombVelocityX = velocityX;
  enemy.solarBombVelocityY = velocityY;
  enemy.movementDirection = velocityX >= 0 ? 1 : -1;
}

function syncSolarBombLane(runtime: EnemyAdvanceRuntime, enemy: Enemy) {
  enemy.lane = clamp(Math.round((enemy.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
  runtime.presentation.depth(enemy, 60 + enemy.lane);
}

function findSolarBombCollision(runtime: EnemyAdvanceRuntime, bomb: Enemy) {
  let collision: SolarBombCollision | undefined;
  let collisionDistanceSq = Number.POSITIVE_INFINITY;
  const bombX = bomb.x;
  const bombY = bomb.y;
  const radiusSq = SOLAR_BOMB_RADIUS * SOLAR_BOMB_RADIUS;

  for (const tower of runtime.towers) {
    if (tower.transient) {
      continue;
    }

    if (!circleIntersectsTowerBounds(bombX, bombY, radiusSq, tower)) {
      continue;
    }

    const distanceSq = pointDistanceSq(bombX, bombY, tower.x, tower.y);
    if (distanceSq < collisionDistanceSq) {
      collision = {
        kind: "tower",
        target: tower,
        x: tower.x,
        y: tower.y,
        distanceSq
      };
      collisionDistanceSq = distanceSq;
    }
  }

  forEachBossPart(runtime.boss, (part) => {
    const bounds = bossBounds(part);
    if (!circleIntersectsBounds(bombX, bombY, radiusSq, bounds)) {
      return;
    }

    const x = clamp(bombX, bounds.left, bounds.right);
    const y = clamp(bombY, bounds.top, bounds.bottom);
    const distanceSq = pointDistanceSq(bombX, bombY, x, y);
    if (distanceSq < collisionDistanceSq) {
      collision = {
        kind: "boss",
        target: part,
        x,
        y,
        distanceSq
      };
      collisionDistanceSq = distanceSq;
    }
  });

  return collision;
}

function insertEnemyByX(targets: Enemy[], enemy: Enemy) {
  let index = 0;
  while (index < targets.length && targets[index].x <= enemy.x) {
    index += 1;
  }
  targets.splice(index, 0, enemy);
}

function insertTowerInBeamOrder(targets: Tower[], tower: Tower, direction: number) {
  let index = 0;
  while (index < targets.length && towerComesBeforeOrTiesInBeam(targets[index], tower, direction)) {
    index += 1;
  }
  targets.splice(index, 0, tower);
}

function towerComesBeforeOrTiesInBeam(a: Tower, b: Tower, direction: number) {
  return direction < 0 ? a.x >= b.x : a.x <= b.x;
}

function towerIsBeforeBeamStop(tower: Tower, direction: number, stopX: number | undefined) {
  return stopX === undefined || (direction < 0 ? tower.x >= stopX : tower.x <= stopX);
}

function findLaserStoppingX(towers: Tower[], lane: number, fromX: number, direction: number) {
  let stoppingX: number | undefined;
  for (const tower of towers) {
    if (
      tower.lane !== lane ||
      (direction < 0 ? tower.x >= fromX : tower.x <= fromX) ||
      towerFinalStats(towerDamageReceiver(tower)).magicResistance <= 0
    ) {
      continue;
    }

    if (stoppingX === undefined || (direction < 0 ? tower.x > stoppingX : tower.x < stoppingX)) {
      stoppingX = tower.x;
    }
  }
  return stoppingX;
}

function beamHitTowers(
  towers: Tower[],
  lane: number,
  fromX: number,
  direction: number,
  stopX: number | undefined,
  output?: Tower[]
) {
  const targets = output ?? [];
  targets.length = 0;
  for (const tower of towerAreaTargets(towers)) {
    if (
      tower.lane !== lane ||
      (direction < 0 ? tower.x >= fromX : tower.x <= fromX) ||
      !towerIsBeforeBeamStop(tower, direction, stopX)
    ) {
      continue;
    }

    insertTowerInBeamOrder(targets, tower, direction);
  }
  return targets;
}

function loadTouchingBurrowCargo(runtime: EnemyAdvanceRuntime, carrier: Enemy) {
  const remainingCapacity = burrowCargoCapacity(carrier) - burrowCargoRank(carrier);
  if (remainingCapacity <= 0) {
    return;
  }

  const targets: Enemy[] = [];
  for (const enemy of runtime.enemies) {
    if (enemy !== carrier && canLoadBurrowCargo(enemy) && pointDistanceSq(enemy.x, enemy.y, carrier.x, carrier.y) < 34 * 34) {
      insertEnemyByX(targets, enemy);
    }
  }

  for (const target of targets) {
    const rank = enemyRank(target.kind);
    if (burrowCargoRank(carrier) + rank > burrowCargoCapacity(carrier)) {
      continue;
    }

    detachEnemyHealth(target);
    removeEnemyFromField(runtime.enemies, target);
    target.inPlay = false;
    carrier.burrowCargo ??= [];
    carrier.burrowCargo.push(target);
    target.blockedByTowerId = undefined;
    target.blockedSince = undefined;
    runtime.presentation.visible(target, false);
    runtime.presentation.shift(target.x, target.y, carrier.x, carrier.y);
  }
}

function canLoadBurrowCargo(enemy: Enemy) {
  return (
    enemyCanBeLoaded(enemy) &&
    !enemyIgnoresLeaderRestrictedMechanics(enemy) &&
    !enemyIsBossCompanion(enemy.kind) &&
    !enemyIsBurrowed(enemy) &&
    !enemyIsHighFlying(enemy)
  );
}

function detonateSolarBombShieldBreak(runtime: EnemyAdvanceRuntime, bomb: Enemy) {
  const radius = CELL_WIDTH * SOLAR_BOMB_SHIELD_BREAK_AOE_RADIUS_CELLS;
  const radiusSq = radius * radius;
  const bombX = bomb.x;
  const bombY = bomb.y;
  runtime.presentation.burst(bombX, bombY, radius, "true");
  runtime.presentation.pulse(bombX, bombY, radius, radius, "true");

  forEachSnapshot(towerAreaTargets(runtime.towers), (tower) => {
    if (!tower.transient && pointIsInCircle(tower.x, tower.y, bombX, bombY, radius, radiusSq)) {
      runtime.damageTower(tower, SOLAR_BOMB_SHIELD_BREAK_AOE_DAMAGE, "true");
    }
  });

  forEachSnapshot(runtime.enemies, (enemy) => {
    if (enemy !== bomb && pointIsInCircle(enemy.x, enemy.y, bombX, bombY, radius, radiusSq)) {
      runtime.damageEnemy(enemy, SOLAR_BOMB_SHIELD_BREAK_AOE_DAMAGE, "true");
    }
  });

  forEachBossPart(runtime.boss, (part) => {
    if (bossPartInSolarBombAoe(part, bombX, bombY, radiusSq)) {
      runtime.damageBoss(SOLAR_BOMB_SHIELD_BREAK_AOE_DAMAGE, "true", part);
    }
  });
}

function pointIsInCircle(x: number, y: number, centerX: number, centerY: number, radius: number, radiusSq: number) {
  return Math.abs(x - centerX) <= radius && Math.abs(y - centerY) <= radius && pointDistanceSq(x, y, centerX, centerY) <= radiusSq;
}

function bossPartInSolarBombAoe(part: CubeBoss, x: number, y: number, radiusSq: number) {
  const bounds = bossBounds(part);
  const closestX = clamp(x, bounds.left, bounds.right);
  const closestY = clamp(y, bounds.top, bounds.bottom);
  return pointDistanceSq(x, y, closestX, closestY) <= radiusSq;
}

function circleIntersectsTowerBounds(x: number, y: number, radiusSq: number, tower: Tower) {
  if (
    Math.abs(x - tower.x) > CELL_WIDTH / 2 + SOLAR_BOMB_RADIUS ||
    Math.abs(y - tower.y) > CELL_HEIGHT / 2 + SOLAR_BOMB_RADIUS
  ) {
    return false;
  }

  const closestX = clamp(x, tower.x - CELL_WIDTH / 2, tower.x + CELL_WIDTH / 2);
  const closestY = clamp(y, tower.y - CELL_HEIGHT / 2, tower.y + CELL_HEIGHT / 2);
  return pointDistanceSq(x, y, closestX, closestY) <= radiusSq;
}

function circleIntersectsBounds(x: number, y: number, radiusSq: number, bounds: RectBounds) {
  const closestX = clamp(x, bounds.left, bounds.right);
  const closestY = clamp(y, bounds.top, bounds.bottom);
  return pointDistanceSq(x, y, closestX, closestY) <= radiusSq;
}

function pointDistanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function advanceBurrowArrow(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  time: number,
  seconds: number,
  status: StatusMultipliers,
  supportSources: EnemySupportSources,
  slowSources: SlowAuraSources
) {
  if (enemyFamily(enemy.kind) !== "burrowArrow") {
    return false;
  }

  if (enemy.burrowed) {
    const speed = enemyMovementSpeed(
      enemy,
      { enemies: runtime.enemies, towers: runtime.towers, time, status, supportSources, slowAuraSources: slowSources },
      enemy.baseStats.speed * 4
    );
    enemy.x +=
      enemyMovementDirection(enemy) *
      speed *
      seconds;

    if (enemy.x <= BOARD_X + CELL_WIDTH / 2) {
      emergeBurrowArrow(runtime, enemy);
    } else {
      syncEnemyPosition(runtime, enemy);
    }
    return true;
  }

  if (!enemy.burrowUnloaded) {
    loadTouchingBurrowCargo(runtime, enemy);
    if (burrowCargoRank(enemy) >= burrowCargoCapacity(enemy) || time >= (enemy.burrowAt ?? Number.POSITIVE_INFINITY)) {
      startBurrow(runtime, enemy);
      return true;
    }
  }

  return false;
}

function startBurrow(runtime: EnemyAdvanceRuntime, enemy: Enemy) {
  enemy.burrowed = true;
  enemy.blockedByTowerId = undefined;
  enemy.blockedSince = undefined;
  runtime.presentation.alpha(enemy, 0.82);
  runtime.presentation.burrowTip(enemy, true);
  runtime.presentation.scale(enemy);
  runtime.presentation.burst(enemy.x, enemy.y, CELL_WIDTH * 0.6, "physical");
  syncEnemyPosition(runtime, enemy);
}

function emergeBurrowArrow(runtime: EnemyAdvanceRuntime, carrier: Enemy) {
  carrier.x = BOARD_X + CELL_WIDTH / 2;
  carrier.burrowed = false;
  carrier.burrowUnloaded = true;
  carrier.movementDirection = 1;
  runtime.presentation.alpha(carrier, 1);
  runtime.presentation.burrowTip(carrier, false);
  runtime.presentation.facing(carrier);
  runtime.presentation.scale(carrier);
  syncEnemyPosition(runtime, carrier);
  runtime.presentation.pulse(carrier.x, carrier.y, CELL_WIDTH * 0.72, CELL_HEIGHT * 0.72);

  releaseBurrowCargo(runtime, carrier, { reverseDirection: true });
}

function burrowCargoCapacity(enemy: Enemy) {
  return enemyRank(enemy.kind) * 5;
}

function burrowCargoRank(enemy: Enemy) {
  let total = 0;
  for (const cargo of enemy.burrowCargo ?? []) {
    total += enemyRank(cargo.kind);
  }
  return total;
}

function removeEscapedReverseEnemy(runtime: EnemyAdvanceRuntime, enemy: Enemy) {
  detachEnemyHealth(enemy);
  enemy.inPlay = false;
  removeEnemyFromField(runtime.enemies, enemy);
  destroyContainedEnemies(enemy, cargo => runtime.presentation.remove(cargo));
  runtime.presentation.remove(enemy);
}

function fireLeaderAreaAttack(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  const radius = HEART_ATTACK_RADIUS;
  const radiusSq = radius * radius;
  runtime.presentation.heartPulse(enemy.x, enemy.y, radius);
  for (const tower of towerAreaTargets(runtime.towers)) {
    const dx = tower.x - enemy.x;
    const dy = tower.y - enemy.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radiusSq) {
      continue;
    }

    const distance = battleMath.sqrt(distanceSq);
    const falloff = 1 - distance / radius;
    runtime.damageTower(tower, enemyAttackDamage(enemy, time) * falloff, enemy.damageType);
  }
}

function advanceHexMace(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  blocker: Tower,
  time: number,
  status: StatusMultipliers,
  supportSources: EnemySupportSources,
  slowSources: SlowAuraSources
) {
  if (!enemyUsesMaceMovement(enemy)) {
    return false;
  }

  const rawVelocity = enemy.maceVelocity ?? 0;
  const movementMultiplier = enemyMovementMultiplier(
    enemy,
    { enemies: runtime.enemies, towers: runtime.towers, time, status, supportSources, slowAuraSources: slowSources },
    Math.abs(rawVelocity)
  );
  const actualSpeed = Math.abs(rawVelocity) * movementMultiplier;
  const damage = enemyAttackDamage(enemy, time) * (actualSpeed / 10);
  runtime.presentation.burst(enemy.x, enemy.y, CELL_WIDTH * 0.85, enemy.damageType);
  runtime.presentation.pulse(enemy.x, enemy.y, CELL_WIDTH * 0.9, CELL_HEIGHT * 0.72);
  if (damage > 0) {
    runtime.damageTower(redirectOrientedTarget(runtime.towers, blocker, time)!, damage, enemy.damageType);
  }

  const bounceDirection = -Math.sign(rawVelocity) || -enemyFacingDirection(enemy);
  const bounceSpeed = Math.max(Math.abs(rawVelocity), hexMaceMaxSpeed(enemy) * 0.12);
  enemy.maceVelocity = bounceDirection * bounceSpeed;
  enemy.blockedByTowerId = undefined;
  enemy.blockedSince = undefined;
  enemy.x = blocker.x + bounceDirection * CELL_WIDTH * 0.56;
  syncEnemyPosition(runtime, enemy);
  return true;
}

function hexMaceMovementTargetX(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  seconds: number,
  time: number,
  status: StatusMultipliers,
  supportSources: EnemySupportSources,
  slowSources: SlowAuraSources
) {
  const velocity = enemy.maceVelocity ?? 0;
  const facingDirection = enemyFacingDirection(enemy);
  const nextVelocity = clamp(
    velocity + facingDirection * hexMaceAcceleration(enemy) * seconds,
    -hexMaceMaxSpeed(enemy),
    hexMaceMaxSpeed(enemy)
  );
  enemy.maceVelocity = nextVelocity;
  const speedMultiplier = enemyMovementMultiplier(
    enemy,
    { enemies: runtime.enemies, towers: runtime.towers, time, status, supportSources, slowAuraSources: slowSources },
    Math.abs(nextVelocity)
  );
  return enemy.x + nextVelocity * speedMultiplier * seconds;
}

function hexMaceAcceleration(enemy: Enemy) {
  const maxSpeed = hexMaceMaxSpeed(enemy);
  return (maxSpeed * maxSpeed) / (2 * 7 * CELL_WIDTH);
}

function hexMaceMaxSpeed(enemy: Enemy) {
  return enemy.baseStats.speed * 4;
}

function advanceSiegeRam(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  blocker: Tower | undefined,
  time: number
) {
  if (!blocker || !enemyIsSiegeRam(enemy.kind)) {
    return false;
  }

  if (enemyFamily(enemy.kind) === "angelPentagonRam" && !enemy.angelRamWingsTriggered) {
    enemy.angelRamWingsTriggered = true;
    enemy.blockedByTowerId = undefined;
    enemy.blockedSince = undefined;
    applyStatusEffect(enemy, "flying", 2_000, time, 1, true);
    runtime.presentation.wings(enemy.x, enemy.y);
    syncEnemyPosition(runtime, enemy);
    return true;
  }

  runtime.presentation.burst(enemy.x, enemy.y, CELL_WIDTH * 0.85, enemy.damageType);
  runtime.presentation.pulse(enemy.x, enemy.y, CELL_WIDTH * 0.82, CELL_HEIGHT * 0.62);
  runtime.damageTower(redirectOrientedTarget(runtime.towers, blocker, time)!, enemyAttackDamage(enemy, time), enemy.damageType);
  runtime.damageEnemy(enemy, enemyMaximumHp(enemy) * 10_000, "true");
  return true;
}

function advanceBlockedDetonator(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  blocker: Tower | undefined,
  time: number
) {
  const detonation = enemyBlockedDetonation(enemy.kind);
  if (!detonation) {
    return false;
  }

  if (enemy.blockedSince !== undefined && time >= enemy.blockedSince + detonation.delay) {
    const startedByTowerId = enemy.blockedByTowerId;
    resetBlockedDetonation(enemy);
    if (blocker && blocker.id === startedByTowerId) {
      runtime.presentation.burst(enemy.x, enemy.y, CELL_WIDTH, detonation.damageType);
      runtime.presentation.pulse(enemy.x, enemy.y, CELL_WIDTH * 0.72, CELL_HEIGHT * 0.72);
      runtime.damageTower(redirectOrientedTarget(runtime.towers, blocker, time)!, detonation.damage * enemyAttackMultiplier(enemy, time), detonation.damageType);
      runtime.damageEnemy(enemy, enemyMaximumHp(enemy) * 10_000, "true");
      return true;
    }

    if (!blocker) {
      return false;
    }

    enemy.blockedByTowerId = blocker.id;
    enemy.blockedSince = time;
    return true;
  }

  if (blocker) {
    if (enemy.blockedSince === undefined) {
      enemy.blockedByTowerId = blocker.id;
      enemy.blockedSince = time;
    }
    return true;
  }

  return false;
}

function resetBlockedDetonation(enemy: Enemy) {
  enemy.blockedByTowerId = undefined;
  enemy.blockedSince = undefined;
}

function fireEnemyVolley(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  const totalHits = enemyVolleyShotCount(enemy);
  const shots = volleyTimingCount(totalHits);
  const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    const hitCount = volleyHitsAt(totalHits, shotIndex);
    runtime.scheduleBattleAction(shotIndex * interval, { type: "enemyShot", enemy, time, hitCount });
  }
}

function fireEnemyShot(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number, hitCount: number) {
  if (!enemyIsActive(enemy)) {
    return;
  }

  if (enemyFamily(enemy.kind) === "minus") {
    for (const shot of createMinusProjectiles(enemy, runtime.towers, runtime.battleTime, hitCount)) {
      runtime.enemyProjectiles.push(runtime.createProjectile(shot));
    }
  } else {
    runtime.enemyProjectiles.push(runtime.createProjectile(createEnemyProjectileState(enemy, time, hitCount)));
  }
}

function fireEnemyLaserVolley(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  const totalHits = enemyVolleyShotCount(enemy);
  const shots = volleyTimingCount(totalHits);
  const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    const hitCount = volleyHitsAt(totalHits, shotIndex);
    runtime.scheduleBattleAction(shotIndex * interval, { type: "enemyLaser", enemy, time, hitCount });
  }
}

function fireEnemyLaser(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number, hitCount: number) {
  if (!enemyIsActive(enemy)) {
    return;
  }

  const direction = enemyMovementDirection(enemy);
  const stoppingX = findLaserStoppingX(runtime.towers, enemy.lane, enemy.x, direction);
  const hitTargets = beamHitTowers(runtime.towers, enemy.lane, enemy.x, direction, stoppingX, scratch(runtime).laserTargets);
  const endX = stoppingX ?? (direction < 0 ? BOARD_X : BOARD_X + BOARD_WIDTH);

  runtime.presentation.laser(enemy.x + direction * 24, enemy.y, endX);
  try {
    for (const tower of hitTargets) {
      runtime.presentation.hit(tower.x, tower.y);
      repeatHits(hitCount, () => runtime.damageTower(tower, enemyAttackDamage(enemy, time), enemy.damageType));
    }
  } finally {
    hitTargets.length = 0;
  }
}

function fireEnemyMortarVolley(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  if (!enemyIsActive(enemy)) {
    return false;
  }

  const target = redirectOrientedTarget(runtime.towers, findLockedAttackTarget(runtime, enemy), runtime.battleTime);
  if (!target) {
    return false;
  }

  const totalHits = enemyVolleyShotCount(enemy);
  const shots = volleyTimingCount(totalHits);
  const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    const hitCount = volleyHitsAt(totalHits, shotIndex);
    runtime.scheduleBattleAction(shotIndex * interval, { type: "enemyMortar", enemy, time, hitCount });
  }
  return true;
}

export function executeEnemyAttack(runtime: EnemyAdvanceRuntime, action: EnemyAttackAction) {
  if (action.type === "enemyShot") fireEnemyShot(runtime, action.enemy, action.time, action.hitCount);
  else if (action.type === "enemyLaser") fireEnemyLaser(runtime, action.enemy, action.time, action.hitCount);
  else fireEnemyMortarShot(runtime, action.enemy, action.time, action.hitCount);
}

function fireEnemyMortarShot(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number, hitCount: number) {
  if (!enemyIsActive(enemy)) {
    return;
  }

  const target = redirectOrientedTarget(runtime.towers, findLockedAttackTarget(runtime, enemy), runtime.battleTime);
  if (!target) {
    return;
  }

  runtime.mortarProjectiles.push(
    runtime.createMortar({
      owner: "enemy",
      hitCount,
      fromX: enemy.x,
      fromY: enemy.y,
      targetX: target.x,
      targetY: target.y,
      damage: enemyAttackDamage(enemy, time),
      damageType: enemy.damageType,
      rangeX: ENEMY_MORTAR_RANGE_X,
      rangeY: ENEMY_MORTAR_RANGE_Y,
      ...enemyMortarMarker(enemy.kind),
      sourceEnemy: enemy,
      targetTower: target
    })
  );
}

function enemyMortarMarker(kind: EnemyKind) {
  if (enemyFamily(kind) === "pentagon") {
    return {
      marker: "text" as const,
      markerText: "#",
      markerTextColor: "#ff6464"
    };
  }

  return {
    marker: "shell" as const
  };
}

function findLockedAttackTarget(runtime: EnemyAdvanceRuntime, attacker: Enemy) {
  const { towers, enemies, occupied } = runtime;
  if (towers.length === 0) {
    return undefined;
  }

  const blocker = getBlockingTowerFromOccupied(occupied, attacker.parenthesisCarrier ?? attacker);
  if (blocker) {
    return blocker;
  }

  if (enemyFamily(attacker.kind) === "pentagon") {
    return latestPlacedTower(towers);
  }

  const blockedCounts = scratch(runtime).blockedCounts;
  try {
    for (const enemy of enemies) {
      const enemyBlocker = getBlockingTowerFromOccupied(occupied, enemy);
      if (!enemyBlocker) {
        continue;
      }
      blockedCounts.set(enemyBlocker.id, (blockedCounts.get(enemyBlocker.id) ?? 0) + 1);
    }

    let target: Tower | undefined;
    let targetBlockedCount = Number.NEGATIVE_INFINITY;
    let targetPlacedOrder = Number.NEGATIVE_INFINITY;
    for (const tower of towers) {
      const blockedCount = blockedCounts.get(tower.id) ?? 0;
      if (blockedCount > targetBlockedCount || (blockedCount === targetBlockedCount && tower.placedOrder > targetPlacedOrder)) {
        target = tower;
        targetBlockedCount = blockedCount;
        targetPlacedOrder = tower.placedOrder;
      }
    }
    return target;
  } finally {
    blockedCounts.clear();
  }
}

function syncEnemyPosition(runtime: EnemyAdvanceRuntime, enemy: Enemy) {
  syncPassengerPositionState(enemy);
  runtime.presentation.position(enemy);
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
