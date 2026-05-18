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
  randomIndex: (length: number) => number
) {
  const kinds: EnemyKind[] = [];
  let remainingWeight = weightLimit;
  const currentFlag = Math.floor(waveNumber / wavesPerFlag);
  const enemyPool = enemyKinds
    .map((kind) => enemies[kind])
    .filter((enemy) => currentFlag >= (enemy.minFlag ?? 0));
  if (enemyPool.length === 0) {
    return kinds;
  }

  const minWeight = Math.min(...enemyPool.map((enemy) => enemy.weight));

  while (remainingWeight >= minWeight) {
    const candidates = enemyPool.filter((enemy) => enemy.weight <= remainingWeight);
    const candidate = candidates[randomIndex(candidates.length)];
    kinds.push(candidate.kind);
    remainingWeight -= candidate.weight;
  }

  return kinds;
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
