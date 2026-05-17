import Phaser from "phaser";
import { BOARD_WIDTH, BOARD_X, CELL_HEIGHT, CELL_WIDTH, LANES } from "../config";
import { getCardDefinition } from "../registry/cards";
import {
  allEnemyDefinitions,
  enemyBlockedDetonation,
  enemyIsMortar,
  enemyIsSiegeRam,
  enemyRank,
  getEnemyDefinition
} from "../registry/enemies";
import { makeHasteTrail, makeReflectFlash, makeShellBurst, makeShockPulse } from "../render/combatEffects";
import type { DifficultyConfig, Enemy, EnemyKind, LevelConfig, Tower, WaveTracker } from "../types";
import type { EnemyAdvanceRuntime, EnemySpawnRuntime } from "./combatRuntime";
import {
  canEnemyMelee,
  enemyVolleyShotCount,
  shouldEnemyShoot,
  siegeRamSpeed,
  splitSpawnKind,
  splitSpawnLanes
} from "./enemyBehaviors";
import { createEnemy } from "./enemyFactory";
import { createEnemyProjectile, createMortarProjectile } from "./projectiles";
import { syncHexArmorAuras, updateHexHealers } from "./enemySupport";
import { movementSpeedMultiplier } from "./slowAura";
import { hasStatusEffect, statusAttackMultiplier, statusSpeedMultiplier } from "./statusEffects";
import { getBlockingTower } from "./targeting";
import { isTrapArmed } from "./towers";
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

  return {
    number: options.waveNumber,
    totalWeight,
    defeatedWeight: 0,
    spawnedAt: options.levelElapsed
  };
}

export function spawnSplitEnemies(
  runtime: EnemySpawnRuntime,
  enemy: Enemy,
  battleTime: number,
  finalDamageReduction: number
) {
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
  const offsets = [-18, 18];
  for (const offset of offsets) {
    spawnEnemyAt(runtime, {
      kind: spawnKind,
      waveNumber: enemy.waveNumber,
      time,
      lane: enemy.lane,
      x: enemy.x + offset,
      waveWeight: 0,
      finalDamageReduction: enemy.finalDamageReduction
    });
  }
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
  updateHexHealers(runtime.scene, runtime.enemies, seconds);

  for (const enemy of [...runtime.enemies]) {
    const statusMultiplier = statusSpeedMultiplier(enemy, time);
    if (hasStatusEffect(enemy, "haste", time) && time >= enemy.nextHasteTrailAt) {
      makeHasteTrail(runtime.scene, enemy.x, enemy.y);
      enemy.nextHasteTrailAt = time + 120;
    }

    if (shouldEnemyShoot(enemy, time)) {
      const shots = enemyVolleyShotCount(enemy);
      const interval = volleyInterval(enemy.attackInterval, shots);
      if (enemyIsMortar(enemy.kind)) {
        enemy.attackAt = fireEnemyMortarVolley(runtime, enemy, time) ? time + enemy.attackInterval + (shots - 1) * interval : time + 1_000;
      } else {
        fireEnemyVolley(runtime, enemy, time);
        enemy.attackAt = time + enemy.attackInterval + (shots - 1) * volleyInterval(enemy.attackInterval, shots);
      }
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

      if (advanceSiegeRam(runtime, enemy, blocker, time)) {
        continue;
      }

      if (canEnemyMelee(enemy) && time >= enemy.attackAt) {
        runtime.damageTower(blocker, enemy.damage * statusAttackMultiplier(enemy, time), enemy.damageType);
        if (blocker.type === "B") {
          const definition = getCardDefinition(blocker.type);
          runtime.damageEnemy(enemy, definition.reflectDamage ?? 20, definition.reflectDamageType ?? "physical");
          makeReflectFlash(runtime.scene, blocker.x, blocker.y);
        }
        enemy.attackAt = time + enemy.attackInterval;
      }
    }

    if (advanceBlockedDetonator(runtime, enemy, blocker, time)) {
      continue;
    }

    if (!blocker) {
      enemy.x -=
        siegeRamSpeed(enemy) *
        seconds *
        movementSpeedMultiplier(runtime.towers, enemy.x, enemy.y) *
        statusMultiplier;
      enemy.body.setPosition(enemy.x, enemy.y);
    }

    if (!runtime.enemies.includes(enemy)) {
      continue;
    }

    if (enemy.x < BOARD_X - 34 && runtime.onEnemyReachedBase(enemy)) {
      return;
    }
  }
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
      sourceEnemy: enemy,
      targetTower: target
    })
  );
}

function findLockedAttackTarget(towers: Tower[], enemies: Enemy[], attacker: Enemy) {
  if (towers.length === 0) {
    return undefined;
  }

  const blocker = getBlockingTower(towers, attacker);
  if (blocker) {
    return blocker;
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
