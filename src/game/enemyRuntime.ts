import Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, LANES } from "../config";
import { getCardDefinition } from "../registry/cards";
import {
  allEnemyDefinitions,
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
import { createEnemyProjectile, createMortarProjectile } from "./projectiles";
import { enemyAttackDamage, enemyAttackMultiplier, enemyMovementMultiplier, enemyMovementSpeed } from "./combatStats";
import { chargingHexSpeedMultiplier, makeWingPulse, syncHexArmorAuras, updateEnemySkills } from "./enemySupport";
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
  syncSolarBombVisual
} from "./solarBomb";
import {
  applyStatusEffect,
  hasStatusEffect,
  syncEnemyBodyPosition
} from "./statusEffects";
import { bossParts, bossRect, getBlockingTower, towerRect } from "./targeting";
import { isTrapArmed, towerDamageType } from "./towers";
import { towerFinalStats } from "./unitStats";
import { volleyInterval } from "./upgrades";
import { buildWaveKinds, waveWeightLimit } from "./waves";

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

export function spawnEnemyAt(runtime: EnemySpawnRuntime, options: SpawnEnemyOptions) {
  runtime.enemies.push(createEnemy(runtime.scene, options));
  return options.waveWeight;
}

export function spawnWaveEnemies(runtime: EnemySpawnRuntime, options: SpawnWaveOptions): WaveTracker {
  const weightLimit = waveWeightLimit(options.levelConfig, options.difficultyConfig, options.waveNumber);
  const kinds = buildWaveKinds(
    options.levelConfig.enemyKinds,
    allEnemyDefinitions,
    weightLimit,
    options.waveNumber,
    options.levelConfig.wavesPerFlag,
    (length) => Phaser.Math.Between(0, length - 1)
  );
  let totalWeight = 0;

  kinds.forEach((kind, index) => {
    const lane = Phaser.Math.Between(0, LANES - 1);
    const x = BOARD_X + BOARD_WIDTH + 46 + Phaser.Math.Between(0, 18) + (index % 3) * 5;
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

  flagLeaderKinds(options.levelConfig.enemyKinds, options.waveNumber, options.levelConfig.wavesPerFlag).forEach((kind, index) => {
    const lane = Phaser.Math.Between(0, LANES - 1);
    const x = BOARD_X + BOARD_WIDTH + 58 + Phaser.Math.Between(0, 16) + index * 8;
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
  if (enemyFamily(enemy.kind) === "hexMace") {
    spawnHexMaceSplit(runtime, enemy, battleTime);
    return;
  }

  if (enemyFamily(enemy.kind) === "angelPentagonRam") {
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
  const spawnKind = triangleKindForRank(enemyRank(enemy.kind));
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
    { kind: angelPentagonKindForRank(rank), offset: direction * 18 },
    { kind: pentagonKindForRank(rank), offset: -direction * 18 }
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
    { kind: chargingHexagonKindForRank(rank), offset: direction * 18 },
    { kind: hexagonKindForRank(rank), offset: -direction * 18 }
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

function angelPentagonKindForRank(rank: number): EnemyKind {
  if (rank >= 3) {
    return "angelPentagon3";
  }

  return rank >= 2 ? "angelPentagon2" : "angelPentagon";
}

function pentagonKindForRank(rank: number): EnemyKind {
  if (rank >= 3) {
    return "pentagon3";
  }

  return rank >= 2 ? "pentagon2" : "pentagon";
}

function chargingHexagonKindForRank(rank: number): EnemyKind {
  if (rank >= 3) {
    return "chargingHexagon3";
  }

  return rank >= 2 ? "chargingHexagon2" : "chargingHexagon";
}

function hexagonKindForRank(rank: number): EnemyKind {
  if (rank >= 3) {
    return "hexagon3";
  }

  return rank >= 2 ? "hexagon2" : "hexagon";
}

function triangleKindForRank(rank: number): EnemyKind {
  if (rank === 2) {
    return "triangle2";
  }

  if (rank >= 3) {
    return "triangle3";
  }

  return "triangle";
}

export function advanceEnemies(runtime: EnemyAdvanceRuntime, time: number, seconds: number) {
  syncHexArmorAuras(runtime.enemies, time);
  updateEnemySkills(runtime, seconds, time);

  for (const enemy of [...runtime.enemies]) {
    if (!runtime.enemies.includes(enemy)) {
      continue;
    }

    if (hasStatusEffect(enemy, "frozen", time)) {
      continue;
    }

    if (advanceHighFlyingEnemy(enemy, time)) {
      continue;
    }

    if (advanceSolarBomb(runtime, enemy, time, seconds)) {
      continue;
    }

    const baseMovementSpeed = siegeRamSpeed(enemy);
    const movementSpeed = enemyMovementSpeed(
      enemy,
      { enemies: runtime.enemies, towers: runtime.towers, time },
      baseMovementSpeed
    );
    const chargingHexMultiplier = chargingHexSpeedMultiplier(runtime.enemies, enemy);
    if ((hasStatusEffect(enemy, "haste", time) || chargingHexMultiplier > 1) && time >= enemy.nextHasteTrailAt) {
      makeHasteTrail(runtime.scene, enemy.x, enemy.y);
      enemy.nextHasteTrailAt = time + 120;
    }

    if (advanceBurrowArrow(runtime, enemy, time, seconds)) {
      if (enemy.x < BOARD_X - 34 && runtime.onEnemyReachedBase(enemy)) {
        return;
      }

      if (enemy.x > BOARD_X + BOARD_WIDTH + 70) {
        removeEscapedReverseEnemy(runtime, enemy);
      }
      continue;
    }

    if (shouldEnemyShoot(enemy, time)) {
      const shots = enemyVolleyShotCount(enemy);
      const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
      if (enemyIsMortar(enemy.kind)) {
        enemy.attackAt = fireEnemyMortarVolley(runtime, enemy, time) ? time + enemy.finalStats.attackInterval + (shots - 1) * interval : time + 1_000;
      } else if (enemyIsLaser(enemy.kind)) {
        fireEnemyLaserVolley(runtime, enemy, time);
        enemy.attackAt = time + enemy.finalStats.attackInterval + (shots - 1) * interval;
      } else {
        fireEnemyVolley(runtime, enemy, time);
        enemy.attackAt = time + enemy.finalStats.attackInterval + (shots - 1) * volleyInterval(enemy.finalStats.attackInterval, shots);
      }
    }

    if (enemyFamily(enemy.kind) === "heart" && time >= enemy.attackAt) {
      fireLeaderAreaAttack(runtime, enemy, time);
      enemy.attackAt = time + enemy.finalStats.attackInterval;
    }

    const blocker = getBlockingTower(runtime.towers, enemy);

    if (blocker) {
      if (blocker.type === "G" && isTrapArmed(blocker, time)) {
        runtime.triggerTrapTower(blocker, enemy);
        continue;
      }

      if (blocker.type === "F" || blocker.type === "f" || blocker.type === "i" || blocker.type === "l") {
        runtime.triggerShockTower(blocker);
        continue;
      }

      if (advanceSlopeTriangle(runtime, enemy, blocker, time)) {
        continue;
      }

      if (advanceSiegeRam(runtime, enemy, blocker, time)) {
        continue;
      }

      if (advanceHexMace(runtime, enemy, blocker, time)) {
        continue;
      }

      if (canEnemyMelee(enemy) && time >= enemy.attackAt) {
        runtime.damageTower(blocker, enemyAttackDamage(enemy, time), enemy.damageType);
        const blockerDefinition = getCardDefinition(blocker.type);
        if (blockerDefinition.reflectDamage) {
          runtime.damageEnemy(
            enemy,
            blockerDefinition.reflectDamage,
            towerDamageType(blocker, blockerDefinition.reflectDamageType ?? "physical", time),
            blocker
          );
          makeReflectFlash(runtime.scene, blocker.x, blocker.y);
        }
        enemy.attackAt = time + enemy.finalStats.attackInterval;
      }
    }

    if (advanceSlopeTriangle(runtime, enemy, blocker, time)) {
      continue;
    }

    if (advanceBlockedDetonator(runtime, enemy, blocker, time)) {
      continue;
    }

    if (!blocker) {
      if (advanceHexMaceMovement(runtime, enemy, seconds, time)) {
        if (!runtime.enemies.includes(enemy)) {
          continue;
        }

        if (enemy.x < BOARD_X - 34 && runtime.onEnemyReachedBase(enemy)) {
          return;
        }
        continue;
      }

      enemy.x +=
        enemyMovementDirection(enemy) *
        movementSpeed *
        seconds;
      syncEnemyBodyPosition(enemy);
    }

    if (!runtime.enemies.includes(enemy)) {
      continue;
    }

    if (enemyIsBossCompanion(enemy.kind)) {
      continue;
    }

    if (enemyMovementDirection(enemy) < 0 && enemy.x < BOARD_X - 34 && runtime.onEnemyReachedBase(enemy)) {
      return;
    }

    if (enemyMovementDirection(enemy) > 0 && enemy.x > BOARD_X + BOARD_WIDTH + 70) {
      removeEscapedReverseEnemy(runtime, enemy);
    }
  }
}

type SolarBombCollision =
  | { kind: "tower"; target: Tower; x: number; y: number; distance: number }
  | { kind: "boss"; target: CubeBoss; x: number; y: number; distance: number };

function advanceSolarBomb(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number, seconds: number) {
  if (!enemyIsSolarBomb(enemy)) {
    return false;
  }

  initializeSolarBombVelocity(enemy);
  accelerateDepletedSolarBombTowardInvincibleBoss(runtime, enemy, time, seconds);
  const rawVelocityX = enemy.solarBombVelocityX ?? 0;
  const rawVelocityY = enemy.solarBombVelocityY ?? 0;
  const baseSpeed = Math.max(Math.hypot(rawVelocityX, rawVelocityY), enemy.baseStats.speed || 1);
  const movementMultiplier = enemyMovementMultiplier(
    enemy,
    { enemies: runtime.enemies, towers: runtime.towers, time },
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
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.001) {
    return;
  }

  enemy.solarBombVelocityX =
    (enemy.solarBombVelocityX ?? 0) + (dx / distance) * SOLAR_BOMB_DEPLETED_BOSS_ACCELERATION * seconds;
  enemy.solarBombVelocityY =
    (enemy.solarBombVelocityY ?? 0) + (dy / distance) * SOLAR_BOMB_DEPLETED_BOSS_ACCELERATION * seconds;
}

function nearestInvincibleBossPart(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  return bossParts(runtime.boss)
    .filter((part) => part.invincibleUntil > time)
    .sort((a, b) => Math.hypot(enemy.x - a.x, enemy.y - a.y) - Math.hypot(enemy.x - b.x, enemy.y - b.y))[0];
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
  const collisions: SolarBombCollision[] = [];

  for (const tower of runtime.towers) {
    if (tower.transient) {
      continue;
    }

    const rect = towerRect(tower);
    if (!circleIntersectsRect(bomb.x, bomb.y, SOLAR_BOMB_RADIUS, rect)) {
      continue;
    }

    collisions.push({
      kind: "tower",
      target: tower,
      x: tower.x,
      y: tower.y,
      distance: Math.hypot(bomb.x - tower.x, bomb.y - tower.y)
    });
  }

  for (const part of bossParts(runtime.boss)) {
    const rect = bossRect(part);
    if (!circleIntersectsRect(bomb.x, bomb.y, SOLAR_BOMB_RADIUS, rect)) {
      continue;
    }

    const x = Phaser.Math.Clamp(bomb.x, rect.left, rect.right);
    const y = Phaser.Math.Clamp(bomb.y, rect.top, rect.bottom);
    collisions.push({
      kind: "boss",
      target: part,
      x,
      y,
      distance: Math.hypot(bomb.x - x, bomb.y - y)
    });
  }

  return collisions.sort((a, b) => a.distance - b.distance)[0];
}

function detonateSolarBombShieldBreak(runtime: EnemyAdvanceRuntime, bomb: Enemy) {
  const radius = CELL_WIDTH * SOLAR_BOMB_SHIELD_BREAK_AOE_RADIUS_CELLS;
  makeShellBurst(runtime.scene, bomb.x, bomb.y, radius, "true");
  makeShockPulse(runtime.scene, bomb.x, bomb.y, radius, radius, "true");

  for (const tower of [...runtime.towers]) {
    if (!tower.transient && Math.hypot(tower.x - bomb.x, tower.y - bomb.y) <= radius) {
      runtime.damageTower(tower, SOLAR_BOMB_SHIELD_BREAK_AOE_DAMAGE, "true");
    }
  }

  for (const enemy of [...runtime.enemies]) {
    if (enemy !== bomb && Math.hypot(enemy.x - bomb.x, enemy.y - bomb.y) <= radius) {
      runtime.damageEnemy(enemy, SOLAR_BOMB_SHIELD_BREAK_AOE_DAMAGE, "true");
    }
  }

  for (const part of bossParts(runtime.boss)) {
    if (bossPartInSolarBombAoe(part, bomb.x, bomb.y, radius)) {
      runtime.damageBoss(SOLAR_BOMB_SHIELD_BREAK_AOE_DAMAGE, "true", part);
    }
  }
}

function bossPartInSolarBombAoe(part: CubeBoss, x: number, y: number, radius: number) {
  const rect = bossRect(part);
  const closestX = Phaser.Math.Clamp(x, rect.left, rect.right);
  const closestY = Phaser.Math.Clamp(y, rect.top, rect.bottom);
  return Math.hypot(x - closestX, y - closestY) <= radius;
}

function circleIntersectsRect(x: number, y: number, radius: number, rect: Phaser.Geom.Rectangle) {
  const closestX = Phaser.Math.Clamp(x, rect.left, rect.right);
  const closestY = Phaser.Math.Clamp(y, rect.top, rect.bottom);
  return Math.hypot(x - closestX, y - closestY) <= radius;
}

function advanceBurrowArrow(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  time: number,
  seconds: number
) {
  if (enemyFamily(enemy.kind) !== "burrowArrow") {
    return false;
  }

  if (enemy.burrowed) {
    const speed = enemyMovementSpeed(
      enemy,
      { enemies: runtime.enemies, towers: runtime.towers, time },
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

function loadTouchingBurrowCargo(runtime: EnemyAdvanceRuntime, carrier: Enemy) {
  const remainingCapacity = burrowCargoCapacity(carrier) - burrowCargoRank(carrier);
  if (remainingCapacity <= 0) {
    return;
  }

  const targets = runtime.enemies
    .filter((enemy) => enemy !== carrier && canLoadBurrowCargo(enemy) && Math.hypot(enemy.x - carrier.x, enemy.y - carrier.y) < 34)
    .sort((a, b) => a.x - b.x);

  for (const target of targets) {
    const rank = enemyRank(target.kind);
    if (burrowCargoRank(carrier) + rank > burrowCargoCapacity(carrier)) {
      continue;
    }

    Phaser.Utils.Array.Remove(runtime.enemies, target);
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
    !enemyIgnoresLeaderRestrictedMechanics(enemy) &&
    !enemyIsBossCompanion(enemy.kind) &&
    !enemyIsBurrowed(enemy) &&
    !enemyIsHighFlying(enemy)
  );
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
    if (runtime.enemies.includes(enemy)) {
      return;
    }

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
  return (enemy.burrowCargo ?? []).reduce((total, cargo) => total + enemyRank(cargo.kind), 0);
}

function enemyMovementDirection(enemy: Enemy) {
  return enemy.movementDirection ?? -1;
}

function enemyFacingDirection(enemy: Enemy) {
  return enemy.maceFacingDirection ?? enemyMovementDirection(enemy);
}

function removeEscapedReverseEnemy(runtime: EnemyAdvanceRuntime, enemy: Enemy) {
  Phaser.Utils.Array.Remove(runtime.enemies, enemy);
  enemy.body.destroy();
}

function fireLeaderAreaAttack(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  const radius = CELL_WIDTH * 1.75;
  makeHeartPulse(runtime.scene, enemy.x, enemy.y, radius);
  for (const tower of runtime.towers) {
    const distance = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
    if (distance > radius) {
      continue;
    }

    const falloff = 1 - distance / radius;
    runtime.damageTower(tower, enemyAttackDamage(enemy, time) * falloff, enemy.damageType);
  }
}

function advanceHexMace(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  blocker: Tower,
  time: number
) {
  if (!enemyIsMace(enemy.kind)) {
    return false;
  }

  const rawVelocity = enemy.maceVelocity ?? 0;
  const movementMultiplier = enemyMovementMultiplier(
    enemy,
    { enemies: runtime.enemies, towers: runtime.towers, time },
    Math.abs(rawVelocity)
  );
  const actualSpeed = Math.abs(rawVelocity) * movementMultiplier;
  const damage = enemyAttackDamage(enemy, time) * (actualSpeed / 10);
  makeShellBurst(runtime.scene, enemy.x, enemy.y, CELL_WIDTH * 0.85, enemy.damageType);
  makeShockPulse(runtime.scene, enemy.x, enemy.y, CELL_WIDTH * 0.9, CELL_HEIGHT * 0.72);
  if (damage > 0) {
    runtime.damageTower(blocker, damage, enemy.damageType);
  }

  const bounceDirection = -Math.sign(rawVelocity) || -(enemy.maceFacingDirection ?? -1);
  const bounceSpeed = Math.max(Math.abs(rawVelocity), hexMaceMaxSpeed(enemy) * 0.12);
  enemy.maceVelocity = bounceDirection * bounceSpeed;
  enemy.blockedByTowerId = undefined;
  enemy.blockedSince = undefined;
  enemy.x = blocker.x + bounceDirection * CELL_WIDTH * 0.56;
  syncEnemyBodyPosition(enemy);
  return true;
}

function advanceHexMaceMovement(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  seconds: number,
  time: number
) {
  if (!enemyIsMace(enemy.kind)) {
    return false;
  }

  const velocity = enemy.maceVelocity ?? 0;
  const facingDirection = enemy.maceFacingDirection ?? -1;
  const nextVelocity = Phaser.Math.Clamp(
    velocity + facingDirection * hexMaceAcceleration(enemy) * seconds,
    -hexMaceMaxSpeed(enemy),
    hexMaceMaxSpeed(enemy)
  );
  enemy.maceVelocity = nextVelocity;
  const speedMultiplier = enemyMovementMultiplier(
    enemy,
    { enemies: runtime.enemies, towers: runtime.towers, time },
    Math.abs(nextVelocity)
  );
  enemy.x +=
    nextVelocity *
    speedMultiplier *
    seconds;
  syncEnemyBodyPosition(enemy);
  return true;
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
  runtime.damageTower(blocker, enemyAttackDamage(enemy, time), enemy.damageType);
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
      runtime.damageTower(blocker, detonation.damage * enemyAttackMultiplier(enemy, time), detonation.damageType);
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
  const shots = enemyVolleyShotCount(enemy);
  const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireEnemyShot(runtime, enemy, time));
    });
  }
}

function fireEnemyShot(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  if (!runtime.enemies.includes(enemy)) {
    return;
  }

  runtime.enemyProjectiles.push(createEnemyProjectile(runtime.scene, enemy, time));
}

function fireEnemyLaserVolley(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  const shots = enemyVolleyShotCount(enemy);
  const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireEnemyLaser(runtime, enemy, time));
    });
  }
}

function fireEnemyLaser(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  if (!runtime.enemies.includes(enemy)) {
    return;
  }

  const direction = enemyMovementDirection(enemy);
  const targets = runtime.towers
    .filter((tower) => tower.lane === enemy.lane && (direction < 0 ? tower.x < enemy.x : tower.x > enemy.x))
    .sort((a, b) => (direction < 0 ? b.x - a.x : a.x - b.x));
  const stoppingTarget = targets.find((tower) => towerFinalStats(tower).magicResistance > 0);
  const hitTargets = stoppingTarget
    ? targets.filter((tower) => (direction < 0 ? tower.x >= stoppingTarget.x : tower.x <= stoppingTarget.x))
    : targets;
  const endX = stoppingTarget?.x ?? (direction < 0 ? BOARD_X : BOARD_X + BOARD_WIDTH);

  makeEnemyLaserEffect(runtime.scene, enemy.x + direction * 24, enemy.y, endX);
  for (const tower of hitTargets) {
    makeEnemyHitShards(runtime.scene, tower.x, tower.y);
    runtime.damageTower(tower, enemyAttackDamage(enemy, time), enemy.damageType);
  }
}

function fireEnemyMortarVolley(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  if (!runtime.enemies.includes(enemy)) {
    return false;
  }

  const target = findLockedAttackTarget(runtime.towers, runtime.enemies, enemy);
  if (!target) {
    return false;
  }

  const shots = enemyVolleyShotCount(enemy);
  const interval = volleyInterval(enemy.finalStats.attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireEnemyMortarShot(runtime, enemy, time));
    });
  }
  return true;
}

function fireEnemyMortarShot(runtime: EnemyAdvanceRuntime, enemy: Enemy, time: number) {
  if (!runtime.enemies.includes(enemy)) {
    return;
  }

  const target = findLockedAttackTarget(runtime.towers, runtime.enemies, enemy);
  if (!target) {
    return;
  }

  runtime.mortarProjectiles.push(
    createMortarProjectile(runtime.scene, {
      owner: "enemy",
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

function findLockedAttackTarget(towers: Tower[], enemies: Enemy[], attacker: Enemy) {
  if (towers.length === 0) {
    return undefined;
  }

  const blocker = getBlockingTower(towers, attacker);
  if (blocker) {
    return blocker;
  }

  if (enemyFamily(attacker.kind) === "pentagon") {
    return [...towers].sort((a, b) => b.level - a.level || b.placedOrder - a.placedOrder)[0];
  }

  const blockedCounts = new Map<string, number>();
  for (const enemy of enemies) {
    const enemyBlocker = getBlockingTower(towers, enemy);
    if (!enemyBlocker) {
      continue;
    }
    blockedCounts.set(enemyBlocker.id, (blockedCounts.get(enemyBlocker.id) ?? 0) + 1);
  }

  return [...towers].sort((a, b) => {
    const blockedDelta = (blockedCounts.get(b.id) ?? 0) - (blockedCounts.get(a.id) ?? 0);
    return blockedDelta || b.placedOrder - a.placedOrder;
  })[0];
}
