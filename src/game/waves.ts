import { FIRST_SPAWN_AT, NEXT_WAVE_DELAY } from "../config";
import type { DifficultyConfig, EnemyDefinition, EnemyKind, LevelConfig, WaveTracker } from "../types";

export function waveWeightLimit(levelConfig: LevelConfig, difficultyConfig: DifficultyConfig, waveNumber: number) {
  const increments = waveNumber - 1;
  const incrementGrowth = levelConfig.waveWeightIncrementGrowth ?? 0;
  const baseWeight =
    levelConfig.firstWaveWeight +
    increments * levelConfig.waveWeightIncrement +
    (incrementGrowth * increments * (increments - 1)) / 2;
  const flagWeight = waveNumber % levelConfig.wavesPerFlag === 0 ? baseWeight * 2 : baseWeight;
  const cappedWeight = levelConfig.waveWeightCap ? Math.min(flagWeight, levelConfig.waveWeightCap) : flagWeight;
  return Math.max(10, Math.floor(cappedWeight * difficultyConfig.weightMultiplier));
}

export function buildWaveKinds(
  enemyKinds: EnemyKind[],
  enemies: Record<EnemyKind, EnemyDefinition>,
  weightLimit: number,
  waveNumber: number,
  wavesPerFlag: number,
  randomIndex: (length: number) => number,
  ignoreMinFlag = false
) {
  const kinds: EnemyKind[] = [];
  let remainingWeight = weightLimit;
  const currentFlag = Math.floor(waveNumber / wavesPerFlag);
  const enemyPool: EnemyDefinition[] = [];
  let minWeight = Number.POSITIVE_INFINITY;
  for (const kind of enemyKinds) {
    const enemy = enemies[kind];
    if (enemy.weight <= 0 || (!ignoreMinFlag && currentFlag < (enemy.minFlag ?? 0))) {
      continue;
    }

    enemyPool.push(enemy);
    minWeight = Math.min(minWeight, enemy.weight);
  }
  if (enemyPool.length === 0) {
    return kinds;
  }

  while (remainingWeight >= minWeight) {
    const affordableCount = affordableEnemyCount(enemyPool, remainingWeight);
    const candidate = affordableEnemyAt(enemyPool, remainingWeight, randomIndex(affordableCount));
    kinds.push(candidate.kind);
    remainingWeight -= candidate.weight;
  }

  return kinds;
}

function affordableEnemyCount(enemyPool: EnemyDefinition[], remainingWeight: number) {
  let count = 0;
  for (const enemy of enemyPool) {
    if (enemy.weight <= remainingWeight) {
      count += 1;
    }
  }
  return count;
}

function affordableEnemyAt(enemyPool: EnemyDefinition[], remainingWeight: number, targetIndex: number) {
  let index = 0;
  for (const enemy of enemyPool) {
    if (enemy.weight > remainingWeight) {
      continue;
    }

    if (index === targetIndex) {
      return enemy;
    }
    index += 1;
  }

  return enemyPool[0];
}

export function waveScheduleAction(
  levelConfig: LevelConfig,
  wave: number,
  waveTracker: WaveTracker | null,
  enemyCount: number,
  levelElapsed: number
) {
  if (levelConfig.enemyKinds.length === 0) {
    return "wait";
  }

  if (!levelConfig.endless && levelConfig.totalWaves && wave >= levelConfig.totalWaves) {
    return enemyCount === 0 ? "complete" : "wait";
  }

  if (!waveTracker) {
    return levelElapsed >= FIRST_SPAWN_AT ? "spawn" : "wait";
  }

  const halfDefeated = waveTracker.defeatedWeight >= waveTracker.totalWeight / 2;
  const timedOut = levelElapsed - waveTracker.spawnedAt >= NEXT_WAVE_DELAY;
  return halfDefeated || timedOut ? "spawn" : "wait";
}
