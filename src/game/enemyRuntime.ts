import Phaser from "phaser";
import { BOARD_WIDTH, BOARD_X, LANES } from "../config";
import { getCardDefinition } from "../data/cards";
import { enemyDefinitions } from "../data/enemies";
import { makeReflectFlash } from "../render/combatEffects";
import type {
  DamageType,
  DifficultyConfig,
  Enemy,
  EnemyKind,
  EnemyProjectile,
  LevelConfig,
  Tower,
  WaveTracker
} from "../types";
import { createEnemy, splitSpawnKind, splitSpawnLanes } from "./enemyFactory";
import { createEnemyProjectile } from "./projectiles";
import { towerRect } from "./targeting";
import { isTrapArmed } from "./towers";
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

interface AdvanceEnemiesOptions {
  enemies: Enemy[];
  towers: Tower[];
  enemyProjectiles: EnemyProjectile[];
  time: number;
  seconds: number;
  triggerTrapTower: (tower: Tower, target: Enemy) => void;
  triggerShockTower: (tower: Tower) => void;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType) => void;
  onEnemyReachedBase: (enemy: Enemy) => boolean;
}

export function spawnEnemyAt(scene: Phaser.Scene, enemies: Enemy[], options: SpawnEnemyOptions) {
  enemies.push(createEnemy(scene, options));
  return options.waveWeight;
}

export function spawnWaveEnemies(scene: Phaser.Scene, enemies: Enemy[], options: SpawnWaveOptions): WaveTracker {
  const weightLimit = waveWeightLimit(options.levelConfig, options.difficultyConfig, options.waveNumber);
  const kinds = buildWaveKinds(options.levelConfig.enemyKinds, enemyDefinitions, weightLimit, (length) =>
    Phaser.Math.Between(0, length - 1)
  );
  let totalWeight = 0;

  kinds.forEach((kind, index) => {
    const lane = Phaser.Math.Between(0, LANES - 1);
    const x = BOARD_X + BOARD_WIDTH + 46 + Phaser.Math.Between(0, 18) + (index % 3) * 5;
    totalWeight += spawnEnemyAt(scene, enemies, {
      kind,
      waveNumber: options.waveNumber,
      time: options.gameTime,
      lane,
      x,
      waveWeight: enemyDefinitions[kind].weight,
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
  scene: Phaser.Scene,
  enemies: Enemy[],
  enemy: Enemy,
  battleTime: number,
  finalDamageReduction: number
) {
  const spawnKind = splitSpawnKind(enemy.kind);
  if (!spawnKind) {
    return;
  }

  for (const lane of splitSpawnLanes(enemy.lane)) {
    spawnEnemyAt(scene, enemies, {
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

export function advanceEnemies(scene: Phaser.Scene, options: AdvanceEnemiesOptions) {
  for (const enemy of [...options.enemies]) {
    if (enemy.kind === "shootingTriangle" && options.time >= enemy.attackAt) {
      fireEnemyShot(scene, options.enemies, options.enemyProjectiles, enemy);
      enemy.attackAt = options.time + enemy.attackInterval;
    }

    const blocker = findBlocker(options.towers, enemy);

    if (blocker) {
      if (blocker.type === "G" && isTrapArmed(blocker, options.time)) {
        options.triggerTrapTower(blocker, enemy);
        continue;
      }

      if (blocker.type === "F") {
        options.triggerShockTower(blocker);
        continue;
      }

      if (enemy.kind !== "shootingTriangle" && options.time >= enemy.attackAt) {
        options.damageTower(blocker, enemy.damage, enemy.damageType);
        if (blocker.type === "B") {
          const definition = getCardDefinition(blocker.type);
          options.damageEnemy(enemy, definition.reflectDamage ?? 20, definition.reflectDamageType ?? "physical");
          makeReflectFlash(scene, blocker.x, blocker.y);
        }
        enemy.attackAt = options.time + enemy.attackInterval;
      }
    } else {
      enemy.x -= enemy.speed * options.seconds;
      enemy.body.setPosition(enemy.x, enemy.y);
    }

    if (!options.enemies.includes(enemy)) {
      continue;
    }

    if (enemy.x < BOARD_X - 34 && options.onEnemyReachedBase(enemy)) {
      return;
    }
  }
}

function fireEnemyShot(scene: Phaser.Scene, enemies: Enemy[], enemyProjectiles: EnemyProjectile[], enemy: Enemy) {
  if (!enemies.includes(enemy)) {
    return;
  }

  enemyProjectiles.push(createEnemyProjectile(scene, enemy));
}

function findBlocker(towers: Tower[], enemy: Enemy) {
  return towers
    .filter((tower) => tower.lane === enemy.lane && Math.abs(enemy.x - tower.x) < 38)
    .sort((a, b) => b.x - a.x)[0];
}
