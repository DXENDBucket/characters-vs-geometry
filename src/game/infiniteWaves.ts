import { enemyArchetypes } from "../data/enemyArchetypes";
import { enemyKindAtRank, parseEnemyKind } from "./enemyIdentity";
import type { EnemyFamily, EnemyKind } from "../types";
import { enemyAvailableInWave } from "./waves";

export function infiniteLeaderKinds(leaderKinds: readonly EnemyKind[], waveNumber: number, wavesPerFlag: number): EnemyKind[] {
  if (waveNumber < wavesPerFlag || waveNumber % wavesPerFlag !== 0) return [];
  const rank = waveNumber / wavesPerFlag;
  const families = new Set(leaderKinds.map(kind => parseEnemyKind(kind)!.family));
  return [...families].map(family => enemyKindAtRank(family, rank));
}

export function buildInfiniteWaveKinds(
  families: readonly EnemyFamily[],
  weightLimit: number,
  waveNumber: number,
  wavesPerFlag: number,
  randomIndex: (length: number) => number
): EnemyKind[] {
  if (!Number.isFinite(weightLimit) || weightLimit < 0) throw new RangeError("Invalid wave weight");
  const pool = [...new Set(families)].map(family => ({ family, ...enemyArchetypes[family] }))
    .filter(entry => enemyAvailableInWave(entry.base, waveNumber, wavesPerFlag));
  for (const entry of pool) {
    if (!Number.isFinite(entry.growth.weight) || entry.growth.weight! <= 0) {
      throw new RangeError(`Unlimited ranks require positive weight growth: ${entry.family}`);
    }
  }
  const kinds: EnemyKind[] = [];
  let remaining = weightLimit;
  while (true) {
    // Count affordable ranks arithmetically; never materialize an unbounded catalog.
    const counts = pool.map(entry => Math.min(entry.spawnRankCap ?? Infinity, Math.max(0,
      Math.floor((remaining - entry.base.weight) / entry.growth.weight!) + 1)));
    const count = counts.reduce((sum, value) => sum + value, 0);
    if (count === 0) return kinds;
    let index = randomIndex(count);
    if (!Number.isSafeInteger(index) || index < 0 || index >= count) throw new RangeError("Invalid random wave index");
    for (let i = 0; i < pool.length; i++) {
      if (index >= counts[i]) {
        index -= counts[i];
        continue;
      }
      const entry = pool[i];
      kinds.push(enemyKindAtRank(entry.family, index + 1));
      remaining -= entry.base.weight + entry.growth.weight! * index;
      break;
    }
  }
}
