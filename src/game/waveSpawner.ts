import { BOARD_X, BOARD_WIDTH, LANES } from "../config";
import type { DifficultyConfig, EnemyKind, LevelConfig, WaveTracker } from "../types";
import type { BattleRandom } from "./battleSimulation";
import { enemyFamily, enemyIsLeader, getEnemyDefinition } from "../registry/enemies";
import { buildWaveKinds, waveWeightLimit } from "./waves";
import { buildInfiniteWaveKinds, infiniteLeaderKinds } from "./infiniteWaves";

export interface EnemySpawnOptions {
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

export interface WaveSpawnRequest {
  levelConfig: LevelConfig;
  difficultyConfig: DifficultyConfig;
  waveNumber: number;
  levelElapsed: number;
  gameTime: number;
}

// Spawn callbacks run in sequence: enemy initialization consumes the same battle RNG between placements.
export function spawnBattleWave(options: WaveSpawnRequest, random: BattleRandom,
  spawnEnemy: (options: EnemySpawnOptions) => number): WaveTracker {
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
    const lanes = options.levelConfig.spawnLanes;
    const lane = lanes?.length ? lanes[random.between(0, lanes.length - 1)]
      : random.between(0, LANES - (enemyFamily(kind) === "tilde" ? 2 : 1));
    const x = BOARD_X + BOARD_WIDTH + 46 + random.between(0, 18) + (index % 3) * 5;
    totalWeight += spawnEnemy({
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
    const lanes = options.levelConfig.spawnLanes;
    const lane = lanes?.length ? lanes[random.between(0, lanes.length - 1)] : random.between(0, LANES - 1);
    const x = BOARD_X + BOARD_WIDTH + 58 + random.between(0, 16) + index * 8;
    spawnEnemy({
      kind,
      waveNumber: options.waveNumber,
      time: options.gameTime,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: options.difficultyConfig.finalDamageReduction
    });
  });

  for (const [index, spawn] of (options.levelConfig.extraWaveSpawns ?? []).entries()) {
    spawnEnemy({
      ...spawn,
      lane: spawn.lane ?? random.between(0, LANES - (enemyFamily(spawn.kind) === "tilde" ? 2 : 1)),
      waveNumber: options.waveNumber,
      time: options.gameTime,
      x: BOARD_X + BOARD_WIDTH + 58 + index * 8,
      waveWeight: 0,
      finalDamageReduction: options.difficultyConfig.finalDamageReduction
    });
  }

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
