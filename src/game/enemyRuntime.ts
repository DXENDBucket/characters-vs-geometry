import Phaser from "phaser";
import { BOARD_WIDTH, BOARD_X, CELL_HEIGHT, CELL_WIDTH, LANES } from "../config";
import { getCardDefinition } from "../registry/cards";
import {
  allEnemyDefinitions,
  enemyBlockedDetonation,
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
  makeShellBurst,
  makeShiftEffect,
  makeShockPulse
} from "../render/combatEffects";
import type { DifficultyConfig, Enemy, EnemyKind, LevelConfig, Tower, WaveTracker } from "../types";
import type { EnemyAdvanceRuntime, EnemySpawnRuntime } from "./combatRuntime";
import {
  canEnemyMelee,
  enemyIsBurrowed,
  enemyIsHighFlying,
  enemyVolleyShotCount,
  shouldEnemyShoot,
  siegeRamSpeed,
  splitSpawnKind,
  splitSpawnLanes,
  syncEnemyVisualScale
} from "./enemyBehaviors";
import { createEnemy } from "./enemyFactory";
import { createEnemyProjectile, createMortarProjectile } from "./projectiles";
import { chargingHexSpeedMultiplier, makeWingPulse, syncHexArmorAuras, updateEnemySkills } from "./enemySupport";
import { movementSpeedMultiplier } from "./slowAura";
import { advanceHighFlyingEnemy, advanceSlopeTriangle } from "./slopeTriangle";
import {
  applyStatusEffect,
  hasStatusEffect,
  statusAttackMultiplier,
  statusSpeedMultiplier,
  syncEnemyBodyPosition
} from "./statusEffects";
import { getBlockingTower } from "./targeting";
import { isTrapArmed, towerDamageType } from "./towers";
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
  if (enemy.kind === "hexMace") {
    spawnHexMaceSplit(runtime, enemy, battleTime);
    return;
  }

  if (enemy.kind === "angelPentagonRam") {
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
      finalDamageReduction: enemy.finalDamageReduction,
      movementDirection: direction
    });
  }
}

function spawnAngelPentagonRamSplit(runtime: EnemySpawnRuntime, enemy: Enemy, time: number) {
  if (!enemy.angelRamWingsTriggered) {
    return;
  }

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
      finalDamageReduction: enemy.finalDamageReduction,
      movementDirection: direction
    });
  }
}

function spawnHexMaceSplit(runtime: EnemySpawnRuntime, enemy: Enemy, time: number) {
  const direction = enemyFacingDirection(enemy);
  const spawns: Array<{ kind: EnemyKind; offset: number }> = [
    { kind: "chargingHexagon", offset: direction * 18 },
    { kind: "hexagon", offset: -direction * 18 }
  ];
  for (const spawn of spawns) {
    spawnEnemyAt(runtime, {
      kind: spawn.kind,
      waveNumber: enemy.waveNumber,
      time,
      lane: enemy.lane,
      x: enemy.x + spawn.offset,
      waveWeight: 0,
      finalDamageReduction: enemy.finalDamageReduction,
      movementDirection: direction
    });
  }
}

function angelPentagonKindForRank(_rank: number): EnemyKind {
  return "angelPentagon";
}

function pentagonKindForRank(_rank: number): EnemyKind {
  return "pentagon";
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

    if (advanceHighFlyingEnemy(enemy, time)) {
      continue;
    }

    const statusMultiplier = statusSpeedMultiplier(enemy, time);
    const chargingHexMultiplier = chargingHexSpeedMultiplier(runtime.enemies, enemy);
    if ((hasStatusEffect(enemy, "haste", time) || chargingHexMultiplier > 1) && time >= enemy.nextHasteTrailAt) {
      makeHasteTrail(runtime.scene, enemy.x, enemy.y);
      enemy.nextHasteTrailAt = time + 120;
    }

    if (advanceBurrowArrow(runtime, enemy, time, seconds, statusMultiplier, chargingHexMultiplier)) {
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
      const interval = volleyInterval(enemy.attackInterval, shots);
      if (enemyIsMortar(enemy.kind)) {
        enemy.attackAt = fireEnemyMortarVolley(runtime, enemy, time) ? time + enemy.attackInterval + (shots - 1) * interval : time + 1_000;
      } else if (enemyIsLaser(enemy.kind)) {
        fireEnemyLaserVolley(runtime, enemy, time);
        enemy.attackAt = time + enemy.attackInterval + (shots - 1) * interval;
      } else {
        fireEnemyVolley(runtime, enemy, time);
        enemy.attackAt = time + enemy.attackInterval + (shots - 1) * volleyInterval(enemy.attackInterval, shots);
      }
    }

    if (enemy.kind === "heart" && time >= enemy.attackAt) {
      fireLeaderAreaAttack(runtime, enemy, time);
      enemy.attackAt = time + enemy.attackInterval;
    }

    const blocker = getBlockingTower(runtime.towers, enemy);

    if (blocker) {
      if (blocker.type === "G" && isTrapArmed(blocker, time)) {
        runtime.triggerTrapTower(blocker, enemy);
        continue;
      }

      if (blocker.type === "F" || blocker.type === "f" || blocker.type === "l") {
        runtime.triggerShockTower(blocker);
        continue;
      }

      if (advanceSlopeTriangle(runtime, enemy, blocker, time)) {
        continue;
      }

      if (advanceSiegeRam(runtime, enemy, blocker, time)) {
        continue;
      }

      if (advanceHexMace(runtime, enemy, blocker, time, statusMultiplier, chargingHexMultiplier)) {
        continue;
      }

      if (canEnemyMelee(enemy) && time >= enemy.attackAt) {
        runtime.damageTower(blocker, enemy.damage * statusAttackMultiplier(enemy, time), enemy.damageType);
        if (blocker.type === "B") {
          const definition = getCardDefinition(blocker.type);
          runtime.damageEnemy(
            enemy,
            definition.reflectDamage ?? 20,
            towerDamageType(blocker, definition.reflectDamageType ?? "physical", time)
          );
          makeReflectFlash(runtime.scene, blocker.x, blocker.y);
        }
        enemy.attackAt = time + enemy.attackInterval;
      }
    }

    if (advanceSlopeTriangle(runtime, enemy, blocker, time)) {
      continue;
    }

    if (advanceBlockedDetonator(runtime, enemy, blocker, time)) {
      continue;
    }

    if (!blocker) {
      if (advanceHexMaceMovement(runtime, enemy, seconds, statusMultiplier, chargingHexMultiplier)) {
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
        siegeRamSpeed(enemy) *
        seconds *
        movementSpeedMultiplier(runtime.towers, enemy.x, enemy.y) *
        statusMultiplier *
        chargingHexMultiplier;
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

function advanceBurrowArrow(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  time: number,
  seconds: number,
  statusMultiplier: number,
  supportMultiplier: number
) {
  if (enemy.kind !== "burrowArrow") {
    return false;
  }

  if (enemy.burrowed) {
    enemy.x +=
      enemyMovementDirection(enemy) *
      enemy.speed *
      4 *
      seconds *
      movementSpeedMultiplier(runtime.towers, enemy.x, enemy.y) *
      statusMultiplier *
      supportMultiplier;

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
  return !enemyIsLeader(enemy.kind) && !enemyIsBossCompanion(enemy.kind) && !enemyIsBurrowed(enemy) && !enemyIsHighFlying(enemy);
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
  syncBurrowArrowFacing(carrier);
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

function syncBurrowArrowFacing(enemy: Enemy) {
  const frame = enemy.shape.getData("burrowFrame") as
    | (Phaser.GameObjects.GameObject & { setScale(x: number, y?: number): unknown })
    | undefined;
  frame?.setScale(enemyMovementDirection(enemy) > 0 ? -1 : 1, 1);
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
    runtime.damageTower(tower, enemy.damage * statusAttackMultiplier(enemy, time) * falloff, enemy.damageType);
  }
}

function advanceHexMace(
  runtime: EnemyAdvanceRuntime,
  enemy: Enemy,
  blocker: Tower,
  time: number,
  statusMultiplier: number,
  supportMultiplier: number
) {
  if (!enemyIsMace(enemy.kind)) {
    return false;
  }

  const movementMultiplier = movementSpeedMultiplier(runtime.towers, enemy.x, enemy.y) * statusMultiplier * supportMultiplier;
  const rawVelocity = enemy.maceVelocity ?? 0;
  const actualSpeed = Math.abs(rawVelocity) * movementMultiplier;
  const damage = enemy.damage * (actualSpeed / 10) * statusAttackMultiplier(enemy, time);
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
  statusMultiplier: number,
  supportMultiplier: number
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
  enemy.x +=
    nextVelocity *
    seconds *
    movementSpeedMultiplier(runtime.towers, enemy.x, enemy.y) *
    statusMultiplier *
    supportMultiplier;
  syncEnemyBodyPosition(enemy);
  return true;
}

function hexMaceAcceleration(enemy: Enemy) {
  const maxSpeed = hexMaceMaxSpeed(enemy);
  return (maxSpeed * maxSpeed) / (2 * 7 * CELL_WIDTH);
}

function hexMaceMaxSpeed(enemy: Enemy) {
  return enemy.speed * 4;
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

  if (enemy.kind === "angelPentagonRam" && !enemy.angelRamWingsTriggered) {
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
  runtime.damageTower(blocker, enemy.damage * statusAttackMultiplier(enemy, time), enemy.damageType);
  runtime.damageEnemy(enemy, enemy.maxHp * 10_000, "true");
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
      runtime.damageTower(blocker, detonation.damage * statusAttackMultiplier(enemy, time), detonation.damageType);
      runtime.damageEnemy(enemy, enemy.maxHp * 10_000, "true");
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
  const interval = volleyInterval(enemy.attackInterval, shots);
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
  const interval = volleyInterval(enemy.attackInterval, shots);
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
  const stoppingTarget = targets.find((tower) => tower.magicResistance > 0);
  const hitTargets = stoppingTarget
    ? targets.filter((tower) => (direction < 0 ? tower.x >= stoppingTarget.x : tower.x <= stoppingTarget.x))
    : targets;
  const endX = stoppingTarget?.x ?? (direction < 0 ? BOARD_X : BOARD_X + BOARD_WIDTH);

  makeEnemyLaserEffect(runtime.scene, enemy.x + direction * 24, enemy.y, endX);
  for (const tower of hitTargets) {
    makeEnemyHitShards(runtime.scene, tower.x, tower.y);
    runtime.damageTower(tower, enemy.damage * statusAttackMultiplier(enemy, time), enemy.damageType);
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
  const interval = volleyInterval(enemy.attackInterval, shots);
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
      damage: enemy.damage * statusAttackMultiplier(enemy, time),
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
  if (kind === "pentagon") {
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

  if (attacker.kind === "pentagon") {
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
