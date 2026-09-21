import Phaser from "phaser";
import { collectParenthesisPassengers, passengerMovementStatus } from "./parenthesisEnemies";
import { destroyContainedEnemies, enemyCanBeLoaded, enemyIsActive, syncPassengerPositions } from "./enemyContainers";
import { towerBehaviorType } from "./towerIdentity";
import { battleRandom } from "./battleSimulation";
import type { BattleAction } from "./battleActions";
import { enemyFacingDirection, enemyMovementDirection } from "./rules/reversal";
import { isShockTower } from "./triggerTowers";
import { redirectOrientedTarget } from "./orientation";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, LANES } from "../config";
import { getCardDefinition } from "../registry/cards";
import {
  enemyKindAtRank,
  enemyBlockedDetonation,
  enemyFamily,
  enemyIsBossCompanion,
  enemyIsLaser,
  enemyIsLeader,
  enemyIsMace,
  enemyIsMortar,
  enemyIsSiegeRam,
  enemyRank,
  getEnemyDefinition
} from "../registry/enemies";
import {
  makeEnemyHitShards,
  makeEnemyLaserEffect,
  makeHasteTrail,
  makeHeartPulse,
  makeReflectFlash,
  makeSolarBombCollisionEffect,
  makeShellBurst,
  makeShiftEffect,
  makeShockPulse
} from "../render/combatEffects";
import type { CubeBoss, DifficultyConfig, Enemy, EnemyKind, LevelConfig, Tower, WaveTracker } from "../types";
import type { EnemyAdvanceRuntime, EnemySpawnRuntime } from "./combatRuntime";
import {
  canEnemyMelee,
  enemyIgnoresLeaderRestrictedMechanics,
  enemyIsBurrowed,
  enemyIsHighFlying,
  enemyVolleyShotCount,
  shouldEnemyShoot,
  siegeRamSpeed,
  splitSpawnKind,
  splitSpawnLanes,
  syncEnemyFacingVisual,
  syncEnemyVisualScale
} from "./enemyBehaviors";
import { createEnemy } from "./enemyFactory";
import { detachEnemyHealth, initializeEnemyHealthLinks } from "./enemyHealth";
import { createEnemyProjectile, createMortarProjectile } from "./projectiles";
import { enemyAttackDamage, enemyAttackMultiplier, enemyMovementMultiplier, enemyMovementSpeed } from "./combatStats";
import {
  enemySupportBonuses,
  enemySupportSources,
  makeWingPulse,
  syncHexArmorAuras,
  updateEnemySkills,
  type EnemySupportSources
} from "./enemySupport";
import { forEachInitial, forEachSnapshot } from "./iteration";
import { advanceHighFlyingEnemy, advanceSlopeTriangle } from "./slopeTriangle";
import {
  SOLAR_BOMB_BOUNCE_COOLDOWN,
  SOLAR_BOMB_COLLISION_DAMAGE,
  SOLAR_BOMB_DEPLETED_BOSS_ACCELERATION,
  SOLAR_BOMB_RADIUS,
  SOLAR_BOMB_SHIELD_BREAK_AOE_DAMAGE,
  SOLAR_BOMB_SHIELD_BREAK_AOE_RADIUS_CELLS,
  bounceSolarBombFromPoint,
  enemyIsSolarBomb,
  rotateSolarBombVisual,
  solarBombIsDepleted,
  syncSolarBombVisual,
  vectorLength
} from "./solarBomb";
import { slowAuraSources, type SlowAuraSources } from "./slowAura";
import {
  applyStatusEffect,
  hasStatusEffectName,
  hasUnexpiredStatusEffect,
  statusMultipliers,
  type StatusMultipliers,
  syncEnemyBodyPosition
} from "./statusEffects";
import {
  bossBounds,
  forEachBossPart,
  getBlockingTowerFromOccupied,
  getSweptBlockingTowerFromOccupied,
  latestPlacedTower,
  type RectBounds
} from "./targeting";
import { isTrapArmed, towerDamageType } from "./towers";
import { towerAttackAmount, towerFinalStats } from "./unitStats";
import { volleyInterval } from "./upgrades";
import { repeatHits, volleyHitsAt, volleyTimingCount } from "./volley";
import { buildWaveKinds, waveWeightLimit } from "./waves";
import { buildInfiniteWaveKinds, infiniteLeaderKinds } from "./infiniteWaves";
import { oscillationTarget, commitOscillation } from "./oscillatingMovement";

interface SpawnEnemyOptions {
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

interface SpawnWaveOptions {
  levelConfig: LevelConfig;
  difficultyConfig: DifficultyConfig;
  waveNumber: number;
  levelElapsed: number;
  gameTime: number;
}

const lockedAttackBlockedCountsBuffer = new Map<string, number>();
const enemyLaserHitTowersBuffer: Tower[] = [];

export function spawnEnemyAt(runtime: EnemySpawnRuntime, options: SpawnEnemyOptions) {
  const enemy = createEnemy(runtime.scene, options);
  runtime.enemies.push(enemy);
  initializeEnemyHealthLinks(enemy, runtime.enemies);
  for (const member of enemy.healthPool?.members ?? []) syncEnemyVisualScale(member);
  return options.waveWeight;
}

export function spawnWaveEnemies(runtime: EnemySpawnRuntime, options: SpawnWaveOptions): WaveTracker {
  const random = battleRandom(runtime.scene);
  const weightLimit = waveWeightLimit(options.levelConfig, options.difficultyConfig, options.waveNumber);
  const kinds = options.levelConfig.unlimitedRankFamilies
    ? buildInfiniteWaveKinds(options.levelConfig.unlimitedRankFamilies, weightLimit, options.waveNumber,
      options.levelConfig.wavesPerFlag, length => random.between(0, length - 1))
    : buildWaveKinds(
    options.levelConfig.enemyKinds,
    getEnemyDefinition,
    weightLimit,
    options.waveNumber,
    options.levelConfig.wavesPerFlag,
    (length) => random.between(0, length - 1),
    options.levelConfig.ignoreEnemyMinFlag
  );
  let totalWeight = 0;

  kinds.forEach((kind, index) => {
    const lane = random.between(0, LANES - (enemyFamily(kind) === "tilde" ? 2 : 1));
    const x = BOARD_X + BOARD_WIDTH + 46 + random.between(0, 18) + (index % 3) * 5;
    totalWeight += spawnEnemyAt(runtime, {
      kind,
      waveNumber: options.waveNumber,
      time: options.gameTime,
      lane,
      x,
      waveWeight: getEnemyDefinition(kind).weight,
      finalDamageReduction: options.difficultyConfig.finalDamageReduction
    });
  });

  const leaders = options.levelConfig.unlimitedRankFamilies
    ? infiniteLeaderKinds(options.levelConfig.enemyKinds.filter(enemyIsLeader), options.waveNumber, options.levelConfig.wavesPerFlag)
    : flagLeaderKinds(options.levelConfig.enemyKinds, options.waveNumber, options.levelConfig.wavesPerFlag);
  leaders.forEach((kind, index) => {
    const lane = random.between(0, LANES - 1);
    const x = BOARD_X + BOARD_WIDTH + 58 + random.between(0, 16) + index * 8;
    spawnEnemyAt(runtime, {
      kind,
      waveNumber: options.waveNumber,
      time: options.gameTime,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: options.difficultyConfig.finalDamageReduction
    });
  });

  return {
    number: options.waveNumber,
    totalWeight,
    defeatedWeight: 0,
    spawnedAt: options.levelElapsed
  };
}

function flagLeaderKinds(enemyKinds: EnemyKind[], waveNumber: number, wavesPerFlag: number) {
  if (waveNumber % wavesPerFlag !== 0) {
    return [];
  }

  return enemyKinds.filter(enemyIsLeader);
}

export function spawnSplitEnemies(
  runtime: EnemySpawnRuntime,
  enemy: Enemy,
  battleTime: number,
  finalDamageReduction: number
) {
  const family = enemyFamily(enemy.kind);
  if (family === "hexMace") {
    spawnHexMaceSplit(runtime, enemy, battleTime);
    return;
  }

  if (family === "angelPentagonRam") {
    spawnAngelPentagonRamSplit(runtime, enemy, battleTime);
    return;
  }

  if (enemyIsSiegeRam(enemy.kind)) {
    spawnSiegeRamTriangles(runtime, enemy, battleTime);
    return;
  }

  const spawnKind = splitSpawnKind(enemy.kind);
  if (!spawnKind) {
    return;
  }

  for (const lane of splitSpawnLanes(enemy.lane)) {
    spawnEnemyAt(runtime, {
      kind: spawnKind,
      waveNumber: enemy.waveNumber,
      time: battleTime,
      lane,
      x: enemy.x,
      waveWeight: 0,
      finalDamageReduction
    });
  }
}

function spawnSiegeRamTriangles(runtime: EnemySpawnRuntime, enemy: Enemy, time: number) {
  const spawnKind = enemyKindAtRank("triangle", enemyRank(enemy.kind));
  const direction = enemyFacingDirection(enemy);
  const offsets = [-18, 18];
  for (const offset of offsets) {
    spawnEnemyAt(runtime, {
      kind: spawnKind,
      waveNumber: enemy.waveNumber,
      time,
      lane: enemy.lane,
      x: enemy.x + offset,
      waveWeight: 0,
      finalDamageReduction: enemy.baseStats.finalDamageReduction,
      movementDirection: direction
    });
  }
}

function spawnAngelPentagonRamSplit(runtime: EnemySpawnRuntime, enemy: Enemy, time: number) {
  const rank = enemyRank(enemy.kind);
  const direction = enemyFacingDirection(enemy);
  const spawns: Array<{ kind: EnemyKind; offset: number }> = [
    { kind: enemyKindAtRank("angelPentagon", rank), offset: direction * 18 },
    { kind: enemyKindAtRank("pentagon", rank), offset: -direction * 18 }
  ];
  for (const spawn of spawns) {
    spawnEnemyAt(runtime, {
      kind: spawn.kind,
      waveNumber: enemy.waveNumber,
      time,
      lane: enemy.lane,
      x: enemy.x + spawn.offset,
      waveWeight: 0,
      finalDamageReduction: enemy.baseStats.finalDamageReduction,
      movementDirection: direction
    });
  }
}

function spawnHexMaceSplit(runtime: EnemySpawnRuntime, enemy: Enemy, time: number) {
  const rank = enemyRank(enemy.kind);
  const direction = enemyFacingDirection(enemy);
  const spawns: Array<{ kind: EnemyKind; offset: number }> = [
    { kind: enemyKindAtRank("chargingHexagon", rank), offset: direction * 18 },
    { kind: enemyKindAtRank("hexagon", rank), offset: -direction * 18 }
  ];
  for (const spawn of spawns) {
    spawnEnemyAt(runtime, {
      kind: spawn.kind,
      waveNumber: enemy.waveNumber,
      time,
      lane: enemy.lane,
      x: enemy.x + spawn.offset,
      waveWeight: 0,
      finalDamageReduction: enemy.baseStats.finalDamageReduction,
      movementDirection: direction
    });
  }
}

export function advanceEnemies(runtime: EnemyAdvanceRuntime, time: number, seconds: number) {
  if (runtime.enemies.length === 0) {
    return;
  }

  forEachSnapshot(runtime.enemies, enemy => collectParenthesisPassengers(enemy, runtime.enemies, time));
  const passengerPositions = runtime.enemies.some(enemy => enemyFamily(enemy.kind) === "parentheses" &&
    (enemy.parenthesisCargo?.length ?? 0) < enemyRank(enemy.kind) + 1)
    ? new Map(runtime.enemies.map(enemy => [enemy, { x: enemy.x, y: enemy.y }])) : undefined;
  updateEnemySkills(runtime, seconds, time);
  const supportSources = enemySupportSources(runtime.enemies);
  syncHexArmorAuras(runtime.enemies, time, supportSources);
  const slowSources = slowAuraSources(runtime.towers);

  forEachInitial(runtime.enemies, (enemy) => {
    if (!enemy.inPlay) {
      return;
    }

    const status = statusMultipliers(enemy, time);
    if (hasStatusEffectName(enemy, "frozen")) {
      return;
    }

    if (advanceHighFlyingEnemy(enemy, time)) {
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
      const speed = enemyIsMace(passenger.kind)
        ? Math.abs(hexMaceMovementTargetX(runtime, passenger, seconds, time, inherited, supportSources, slowSources) - passenger.x) / Math.max(seconds, 1e-9)
        : enemyMovementSpeed(passenger, { enemies: runtime.enemies, towers: runtime.towers, time,
          status: inherited, supportSources, slowAuraSources: slowSources }, siegeRamSpeed(passenger));
      movementSpeed = Math.max(movementSpeed, speed);
      if (!enemyIsHighFlying(passenger) && !hasStatusEffectName(passenger, "frozen")) updateEnemyRangedAttack(runtime, passenger, time);
    }
    enemy.finalStats.speed = movementSpeed;
    if ((hasStatusEffectName(enemy, "haste") || support.speedMultiplier > 1) && time >= enemy.nextHasteTrailAt) {
      makeHasteTrail(runtime.scene, enemy.x, enemy.y);
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

    if (enemyFamily(enemy.kind) === "heart" && time >= enemy.attackAt) {
      fireLeaderAreaAttack(runtime, enemy, time);
      enemy.attackAt = time + enemy.finalStats.attackInterval;
    }

    let blocker = getBlockingTowerFromOccupied(runtime.occupied, enemy);
    let nextX = enemy.x;
    let nextY = enemy.y;
    let nextPhase = enemy.oscillationPhase ?? 0;
    if (!blocker) {
      nextX = enemyIsMace(enemy.kind)
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
        syncEnemyBodyPosition(enemy);
        blocker = contact.tower;
      }
    }

    if (blocker) {
      const wingedPassenger = enemy.parenthesisCargo?.find(passenger => enemyFamily(passenger.kind) === "angelPentagonRam" &&
        !passenger.angelRamWingsTriggered && !hasUnexpiredStatusEffect(passenger, "frozen", time));
      if (wingedPassenger) {
        wingedPassenger.angelRamWingsTriggered = true;
        applyStatusEffect(enemy, "flying", 2_000, time, 1, true);
        makeWingPulse(runtime.scene, enemy.x, enemy.y);
        syncEnemyBodyPosition(enemy);
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
        const target = redirectOrientedTarget(runtime.towers, blocker, time)!;
        runtime.damageTower(target, enemyAttackDamage(enemy, time), enemy.damageType);
        const blockerDefinition = getCardDefinition(towerBehaviorType(target));
        if (blockerDefinition.reflectAttackMultiplier && !runtime.onTowerAction?.(target, { kind: "retaliation", target: enemy })) {
          runtime.damageEnemy(
            enemy,
            towerAttackAmount(target, blockerDefinition, blockerDefinition.reflectAttackMultiplier),
            towerDamageType(target, blockerDefinition.damageType ?? "physical", time),
            target
          );
          makeReflectFlash(runtime.scene, target.x, target.y);
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

    const movementDirection = enemyIsMace(enemy.kind) ? Math.sign(enemy.maceVelocity ?? 0) : enemyMovementDirection(enemy);
    if (!blocker) {
      enemy.x = nextX;
      if (enemy.oscillationCenterY !== undefined) commitOscillation(enemy, nextY, nextPhase);
      syncEnemyBodyPosition(enemy);
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
    forEachSnapshot(runtime.enemies, enemy => collectParenthesisPassengers(enemy, runtime.enemies, time, passengerPositions));
  }
  for (const enemy of runtime.enemies) syncPassengerPositions(enemy);
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
  syncSolarBombLane(enemy);
  rotateSolarBombVisual(enemy, seconds);
  syncSolarBombVisual(enemy);
  syncEnemyBodyPosition(enemy);

  if (time < (enemy.solarBombLastCollisionAt ?? 0) + SOLAR_BOMB_BOUNCE_COOLDOWN) {
    return true;
  }

  const collision = findSolarBombCollision(runtime, enemy);
  if (!collision) {
    return true;
  }

  enemy.solarBombLastCollisionAt = time;
  bounceSolarBombFromPoint(enemy, collision.x, collision.y);
  syncSolarBombLane(enemy);
  syncEnemyBodyPosition(enemy);
  makeSolarBombCollisionEffect(runtime.scene, collision.x, collision.y);

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
  Phaser.Utils.Array.Remove(runtime.enemies, enemy);
  enemy.body.destroy();
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

function syncSolarBombLane(enemy: Enemy) {
  enemy.lane = Phaser.Math.Clamp(Math.round((enemy.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
  enemy.body.setDepth(60 + enemy.lane);
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

    const x = Phaser.Math.Clamp(bombX, bounds.left, bounds.right);
    const y = Phaser.Math.Clamp(bombY, bounds.top, bounds.bottom);
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
      towerFinalStats(tower).magicResistance <= 0
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
  for (const tower of towers) {
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
    Phaser.Utils.Array.Remove(runtime.enemies, target);
    target.inPlay = false;
    carrier.burrowCargo ??= [];
    carrier.burrowCargo.push(target);
    target.blockedByTowerId = undefined;
    target.blockedSince = undefined;
    target.body.setVisible(false);
    makeShiftEffect(runtime.scene, target.x, target.y, carrier.x, carrier.y);
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
  makeShellBurst(runtime.scene, bombX, bombY, radius, "true");
  makeShockPulse(runtime.scene, bombX, bombY, radius, radius, "true");

  forEachSnapshot(runtime.towers, (tower) => {
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
  const closestX = Phaser.Math.Clamp(x, bounds.left, bounds.right);
  const closestY = Phaser.Math.Clamp(y, bounds.top, bounds.bottom);
  return pointDistanceSq(x, y, closestX, closestY) <= radiusSq;
}

function circleIntersectsTowerBounds(x: number, y: number, radiusSq: number, tower: Tower) {
  if (
    Math.abs(x - tower.x) > CELL_WIDTH / 2 + SOLAR_BOMB_RADIUS ||
    Math.abs(y - tower.y) > CELL_HEIGHT / 2 + SOLAR_BOMB_RADIUS
  ) {
    return false;
  }

  const closestX = Phaser.Math.Clamp(x, tower.x - CELL_WIDTH / 2, tower.x + CELL_WIDTH / 2);
  const closestY = Phaser.Math.Clamp(y, tower.y - CELL_HEIGHT / 2, tower.y + CELL_HEIGHT / 2);
  return pointDistanceSq(x, y, closestX, closestY) <= radiusSq;
}

function circleIntersectsBounds(x: number, y: number, radiusSq: number, bounds: RectBounds) {
  const closestX = Phaser.Math.Clamp(x, bounds.left, bounds.right);
  const closestY = Phaser.Math.Clamp(y, bounds.top, bounds.bottom);
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
      syncEnemyBodyPosition(enemy);
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
  enemy.body.setAlpha(0.82);
  setBurrowArrowTipVisible(enemy, true);
  syncEnemyVisualScale(enemy);
  makeShellBurst(runtime.scene, enemy.x, enemy.y, CELL_WIDTH * 0.6, "physical");
  syncEnemyBodyPosition(enemy);
}

function emergeBurrowArrow(runtime: EnemyAdvanceRuntime, carrier: Enemy) {
  carrier.x = BOARD_X + CELL_WIDTH / 2;
  carrier.burrowed = false;
  carrier.burrowUnloaded = true;
  carrier.movementDirection = 1;
  carrier.body.setAlpha(1);
  setBurrowArrowTipVisible(carrier, false);
  syncEnemyFacingVisual(carrier);
  syncEnemyVisualScale(carrier);
  syncEnemyBodyPosition(carrier);
  makeShockPulse(runtime.scene, carrier.x, carrier.y, CELL_WIDTH * 0.72, CELL_HEIGHT * 0.72);

  releaseBurrowCargo(runtime, carrier, { reverseDirection: true });
}

export function releaseBurrowCargo(
  runtime: EnemySpawnRuntime,
  carrier: Enemy,
  options: { reverseDirection?: boolean } = {}
) {
  const cargo = carrier.burrowCargo ?? [];
  carrier.burrowCargo = [];
  cargo.forEach((enemy, index) => {
    if (enemy.inPlay) {
      return;
    }

    enemy.inPlay = true;
    enemy.lane = carrier.lane;
    enemy.y = carrier.y;
    enemy.x = carrier.x + 22 + index * 10;
    if (options.reverseDirection) {
      enemy.movementDirection = 1;
    }
    syncEnemyFacingVisual(enemy);
    enemy.blockedByTowerId = undefined;
    enemy.blockedSince = undefined;
    enemy.body.setVisible(true);
    enemy.body.setAlpha(1);
    enemy.body.setDepth(60 + enemy.lane);
    syncEnemyBodyPosition(enemy);
    runtime.enemies.push(enemy);
    makeShiftEffect(runtime.scene, carrier.x, carrier.y, enemy.x, enemy.y);
  });
}

function burrowCargoCapacity(enemy: Enemy) {
  return enemyRank(enemy.kind) * 5;
}

function setBurrowArrowTipVisible(enemy: Enemy, visible: boolean) {
  const fullShape = enemy.shape.getData("burrowFull") as Phaser.GameObjects.GameObject[] | undefined;
  const tip = enemy.shape.getData("burrowTip") as Phaser.GameObjects.GameObject | undefined;
  fullShape?.forEach((part) => {
    const visiblePart = part as Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };
    visiblePart.setVisible(!visible);
  });
  const visibleTip = tip as (Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown }) | undefined;
  visibleTip?.setVisible(visible);
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
  Phaser.Utils.Array.Remove(runtime.enemies, enemy);
  destroyContainedEnemies(enemy);
  enemy.body.destroy();
}

function fireLeaderAreaAttack(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  const radius = CELL_WIDTH * 1.75;
  const radiusSq = radius * radius;
  makeHeartPulse(runtime.scene, enemy.x, enemy.y, radius);
  for (const tower of runtime.towers) {
    const dx = tower.x - enemy.x;
    const dy = tower.y - enemy.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radiusSq) {
      continue;
    }

    const distance = Math.sqrt(distanceSq);
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
  if (!enemyIsMace(enemy.kind)) {
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
  makeShellBurst(runtime.scene, enemy.x, enemy.y, CELL_WIDTH * 0.85, enemy.damageType);
  makeShockPulse(runtime.scene, enemy.x, enemy.y, CELL_WIDTH * 0.9, CELL_HEIGHT * 0.72);
  if (damage > 0) {
    runtime.damageTower(redirectOrientedTarget(runtime.towers, blocker, time)!, damage, enemy.damageType);
  }

  const bounceDirection = -Math.sign(rawVelocity) || -enemyFacingDirection(enemy);
  const bounceSpeed = Math.max(Math.abs(rawVelocity), hexMaceMaxSpeed(enemy) * 0.12);
  enemy.maceVelocity = bounceDirection * bounceSpeed;
  enemy.blockedByTowerId = undefined;
  enemy.blockedSince = undefined;
  enemy.x = blocker.x + bounceDirection * CELL_WIDTH * 0.56;
  syncEnemyBodyPosition(enemy);
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
  const nextVelocity = Phaser.Math.Clamp(
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
    makeWingPulse(runtime.scene, enemy.x, enemy.y);
    syncEnemyBodyPosition(enemy);
    return true;
  }

  makeShellBurst(runtime.scene, enemy.x, enemy.y, CELL_WIDTH * 0.85, enemy.damageType);
  makeShockPulse(runtime.scene, enemy.x, enemy.y, CELL_WIDTH * 0.82, CELL_HEIGHT * 0.62);
  runtime.damageTower(redirectOrientedTarget(runtime.towers, blocker, time)!, enemyAttackDamage(enemy, time), enemy.damageType);
  runtime.damageEnemy(enemy, enemy.baseStats.maxHp * 10_000, "true");
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
      makeShellBurst(runtime.scene, enemy.x, enemy.y, CELL_WIDTH, detonation.damageType);
      makeShockPulse(runtime.scene, enemy.x, enemy.y, CELL_WIDTH * 0.72, CELL_HEIGHT * 0.72);
      runtime.damageTower(redirectOrientedTarget(runtime.towers, blocker, time)!, detonation.damage * enemyAttackMultiplier(enemy, time), detonation.damageType);
      runtime.damageEnemy(enemy, enemy.baseStats.maxHp * 10_000, "true");
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
    if (runtime.scheduleBattleAction) {
      runtime.scheduleBattleAction(shotIndex * interval, { type: "enemyShot", enemy, time, hitCount });
      continue;
    }
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireEnemyShot(runtime, enemy, time, hitCount));
    });
  }
}

function fireEnemyShot(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number, hitCount: number) {
  if (!enemyIsActive(enemy)) {
    return;
  }

  runtime.enemyProjectiles.push(createEnemyProjectile(runtime.scene, enemy, time, hitCount));
}

function fireEnemyLaserVolley(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  const totalHits = enemyVolleyShotCount(enemy);
  const shots = volleyTimingCount(totalHits);
  const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    const hitCount = volleyHitsAt(totalHits, shotIndex);
    if (runtime.scheduleBattleAction) {
      runtime.scheduleBattleAction(shotIndex * interval, { type: "enemyLaser", enemy, time, hitCount });
      continue;
    }
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireEnemyLaser(runtime, enemy, time, hitCount));
    });
  }
}

function fireEnemyLaser(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number, hitCount: number) {
  if (!enemyIsActive(enemy)) {
    return;
  }

  const direction = enemyMovementDirection(enemy);
  const stoppingX = findLaserStoppingX(runtime.towers, enemy.lane, enemy.x, direction);
  const hitTargets = beamHitTowers(runtime.towers, enemy.lane, enemy.x, direction, stoppingX, enemyLaserHitTowersBuffer);
  const endX = stoppingX ?? (direction < 0 ? BOARD_X : BOARD_X + BOARD_WIDTH);

  makeEnemyLaserEffect(runtime.scene, enemy.x + direction * 24, enemy.y, endX);
  try {
    for (const tower of hitTargets) {
      makeEnemyHitShards(runtime.scene, tower.x, tower.y);
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

  const target = redirectOrientedTarget(runtime.towers, findLockedAttackTarget(runtime.towers, runtime.enemies, runtime.occupied, enemy), runtime.battleTime);
  if (!target) {
    return false;
  }

  const totalHits = enemyVolleyShotCount(enemy);
  const shots = volleyTimingCount(totalHits);
  const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    const hitCount = volleyHitsAt(totalHits, shotIndex);
    if (runtime.scheduleBattleAction) {
      runtime.scheduleBattleAction(shotIndex * interval, { type: "enemyMortar", enemy, time, hitCount });
      continue;
    }
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireEnemyMortarShot(runtime, enemy, time, hitCount));
    });
  }
  return true;
}

export function executeEnemyAttack(runtime: EnemyAdvanceRuntime, action: Extract<BattleAction, { enemy: Enemy }>) {
  if (action.type === "enemyShot") fireEnemyShot(runtime, action.enemy, action.time, action.hitCount);
  else if (action.type === "enemyLaser") fireEnemyLaser(runtime, action.enemy, action.time, action.hitCount);
  else fireEnemyMortarShot(runtime, action.enemy, action.time, action.hitCount);
}

function fireEnemyMortarShot(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number, hitCount: number) {
  if (!enemyIsActive(enemy)) {
    return;
  }

  const target = redirectOrientedTarget(runtime.towers, findLockedAttackTarget(runtime.towers, runtime.enemies, runtime.occupied, enemy), runtime.battleTime);
  if (!target) {
    return;
  }

  runtime.mortarProjectiles.push(
    createMortarProjectile(runtime.scene, {
      owner: "enemy",
      hitCount,
      fromX: enemy.x,
      fromY: enemy.y,
      targetX: target.x,
      targetY: target.y,
      damage: enemyAttackDamage(enemy, time),
      damageType: enemy.damageType,
      rangeX: CELL_WIDTH * 1.5,
      rangeY: CELL_HEIGHT * 1.5,
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

function findLockedAttackTarget(towers: Tower[], enemies: Enemy[], occupied: Map<string, Tower>, attacker: Enemy) {
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

  const blockedCounts = lockedAttackBlockedCountsBuffer;
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
