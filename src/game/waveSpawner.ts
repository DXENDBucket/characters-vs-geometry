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
    if (spawn.wave !== undefined && spawn.wave !== options.waveNumber) continue;
    const lanes = spawn.lane === "all" ? Array.from({ length: LANES }, (_, lane) => lane)
      : [spawn.lane ?? random.between(0, LANES - (enemyFamily(spawn.kind) === "tilde" ? 2 : 1))];
    for (const lane of lanes) {
      spawnEnemy({
        kind: spawn.kind,
        lane,
        waveNumber: options.waveNumber,
        time: options.gameTime,
        x: BOARD_X + BOARD_WIDTH + 58 + index * 8,
        waveWeight: 0,
        finalDamageReduction: options.difficultyConfig.finalDamageReduction
      });
    }
  }

  return {
    number: options.waveNumber,
    totalWeight,
    defeatedWeight: 0,
    spawnedAt: options.levelElapsed
  };
}

// Battle-clock boundaries need no additional timer state in snapshots or replays.
export function spawnPeriodicEnemies(level: LevelConfig, previousTime: number, time: number,
  waveNumber: number, finalDamageReduction: number, spawnEnemy: (options: EnemySpawnOptions) => number) {
  for (const [index, spawn] of (level.periodicEnemySpawns ?? []).entries()) {
    // Fixed steps are fractional milliseconds; tolerate rounding at exact boundaries.
    const first = Math.floor((previousTime + 1e-6) / spawn.intervalMs) + 1;
    const last = Math.floor((time + 1e-6) / spawn.intervalMs);
    for (let occurrence = first; occurrence <= last; occurrence++) {
      spawnEnemy({ kind: spawn.kind, lane: spawn.lane, waveNumber, time,
        x: BOARD_X + BOARD_WIDTH + 58 + index * 8, waveWeight: 0, finalDamageReduction });
    }
  }
}

function flagLeaderKinds(enemyKinds: EnemyKind[], waveNumber: number, wavesPerFlag: number) {
  if (waveNumber % wavesPerFlag !== 0) {
    return [];
  }

  return enemyKinds.filter(enemyIsLeader);
}
