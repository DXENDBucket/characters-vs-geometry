import { FIRST_SPAWN_AT, NEXT_WAVE_DELAY } from "../config";
import type { DifficultyConfig, EnemyDefinition, EnemyKind, LevelConfig, WaveTracker } from "../types";

export function waveWeightLimit(levelConfig: LevelConfig, difficultyConfig: DifficultyConfig, waveNumber: number) {
  const baseWeight = levelConfig.firstWaveWeight + (waveNumber - 1) * levelConfig.waveWeightIncrement;
  const flagWeight = waveNumber % levelConfig.wavesPerFlag === 0 ? baseWeight * 2 : baseWeight;
  const cappedWeight = levelConfig.waveWeightCap ? Math.min(flagWeight, levelConfig.waveWeightCap) : flagWeight;
  return Math.max(10, Math.floor(cappedWeight * difficultyConfig.weightMultiplier));
}

export function buildWaveKinds(
  enemyKinds: EnemyKind[],
  enemies: Record<EnemyKind, EnemyDefinition>,
  weightLimit: number,
  randomIndex: (length: number) => number
) {
  const kinds: EnemyKind[] = [];
  let remainingWeight = weightLimit;
  const enemyPool = enemyKinds.map((kind) => enemies[kind]);
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
