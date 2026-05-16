import Phaser from "phaser";
import { BOARD_WIDTH, BOARD_X, CELL_HEIGHT, CELL_WIDTH, LANES } from "../config";
import { getCardDefinition } from "../registry/cards";
import { allEnemyDefinitions, enemyBlockedDetonation, getEnemyDefinition } from "../registry/enemies";
import { makeReflectFlash, makeShellBurst, makeShockPulse } from "../render/combatEffects";
import type { DifficultyConfig, Enemy, EnemyKind, LevelConfig, Tower, WaveTracker } from "../types";
import type { EnemyAdvanceRuntime, EnemySpawnRuntime } from "./combatRuntime";
import { canEnemyMelee, enemyVolleyShotCount, shouldEnemyShoot, splitSpawnKind, splitSpawnLanes } from "./enemyBehaviors";
import { createEnemy } from "./enemyFactory";
import { createEnemyProjectile } from "./projectiles";
import { movementSpeedMultiplier } from "./slowAura";
import { statusSpeedMultiplier } from "./statusEffects";
import { getBlockingTower, towerRect } from "./targeting";
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
  const kinds = buildWaveKinds(options.levelConfig.enemyKinds, allEnemyDefinitions, weightLimit, (length) =>
    Phaser.Math.Between(0, length - 1)
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

export function advanceEnemies(runtime: EnemyAdvanceRuntime, time: number, seconds: number) {
  for (const enemy of [...runtime.enemies]) {
    if (shouldEnemyShoot(enemy, time)) {
      fireEnemyVolley(runtime, enemy);
      const shots = enemyVolleyShotCount(enemy);
      enemy.attackAt = time + enemy.attackInterval + (shots - 1) * volleyInterval(enemy.attackInterval, shots);
    }

    const blocker = getBlockingTower(runtime.towers, enemy);

    if (blocker) {
      if (blocker.type === "G" && isTrapArmed(blocker, time)) {
        runtime.triggerTrapTower(blocker, enemy);
        continue;
      }

      if (blocker.type === "F") {
        runtime.triggerShockTower(blocker);
        continue;
      }

      if (canEnemyMelee(enemy) && time >= enemy.attackAt) {
        runtime.damageTower(blocker, enemy.damage, enemy.damageType);
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
        enemy.speed *
        seconds *
        movementSpeedMultiplier(runtime.towers, enemy.x, enemy.y) *
        statusSpeedMultiplier(enemy, time);
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
      runtime.damageTower(blocker, detonation.damage, detonation.damageType);
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

function fireEnemyVolley(runtime: EnemyAdvanceRuntime, enemy: Enemy) {
  const shots = enemyVolleyShotCount(enemy);
  const interval = volleyInterval(enemy.attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireEnemyShot(runtime, enemy));
    });
  }
}

function fireEnemyShot(runtime: EnemyAdvanceRuntime, enemy: Enemy) {
  if (!runtime.enemies.includes(enemy)) {
    return;
  }

  runtime.enemyProjectiles.push(createEnemyProjectile(runtime.scene, enemy));
}
