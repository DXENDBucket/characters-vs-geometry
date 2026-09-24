import { LEVEL_GROWTH_FIRST_BAND, LEVEL_GROWTH_SECOND_BAND, LEVEL_GROWTH_BAND_FACTOR } from "./levelGrowth";

export function enemyWeightUpgradeCount(rank: number) {
  if (!Number.isSafeInteger(rank) || rank < 1) throw new RangeError("Invalid enemy rank");
  let remaining = rank - 1, bandSize = LEVEL_GROWTH_FIRST_BAND, multiplier = 1, total = 0;
  let nextBandSize = LEVEL_GROWTH_SECOND_BAND;
  while (remaining > 0) {
    const count = Math.min(remaining, bandSize);
    total += count * multiplier;
    remaining -= count;
    bandSize = nextBandSize;
    nextBandSize *= LEVEL_GROWTH_BAND_FACTOR;
    multiplier *= 2;
  }
  return total;
}

export function enemyWeightAtRank(baseWeight: number, growth: number, rank: number) {
  return baseWeight + growth * enemyWeightUpgradeCount(rank);
}

/** Invert the same bands without enumerating every affordable rank. Growth must be positive. */
export function affordableEnemyRank(baseWeight: number, growth: number, budget: number) {
  if (!Number.isFinite(baseWeight) || baseWeight < 0 || !Number.isFinite(growth) || growth <= 0 || !Number.isFinite(budget)) {
    throw new RangeError("Invalid enemy weight budget");
  }
  if (budget < baseWeight) return 0;
  let remaining = budget - baseWeight, bandSize = LEVEL_GROWTH_FIRST_BAND, stepCost = growth, rank = 1;
  let nextBandSize = LEVEL_GROWTH_SECOND_BAND;
  while (rank < Number.MAX_SAFE_INTEGER) {
    const count = Math.min(bandSize, Math.floor(remaining / stepCost), Number.MAX_SAFE_INTEGER - rank);
    rank += count;
    remaining -= count * stepCost;
    if (count < bandSize) break;
    bandSize = nextBandSize;
    nextBandSize *= LEVEL_GROWTH_BAND_FACTOR;
    stepCost *= 2;
  }
  return rank;
}
