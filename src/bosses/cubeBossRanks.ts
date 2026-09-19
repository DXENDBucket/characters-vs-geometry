import { CUBE_BOSS_STATS } from "../config";
import { enemyArchetypes } from "../data/enemyArchetypes";
import { enemyKindAtRank, parseEnemyKind } from "../game/enemyIdentity";
import type { EnemyKind } from "../types";

export function cubeStatsAtRank(rank: number) {
  if (!Number.isSafeInteger(rank) || rank < 1) throw new RangeError("Invalid cube rank");
  const one = CUBE_BOSS_STATS.cube;
  const two = CUBE_BOSS_STATS.cube2;
  return {
    ...one,
    hp: one.hp + (two.hp - one.hp) * (rank - 1),
    armor: one.armor + (two.armor - one.armor) * (rank - 1)
  };
}

export function cubePromotionKind(kind: EnemyKind, bossRank: number): EnemyKind | undefined {
  const { family, rank } = parseEnemyKind(kind)!;
  const archetype = enemyArchetypes[family];
  if (!archetype.promotionMaxRank || rank > bossRank || rank >= (archetype.spawnRankCap ?? Infinity)) return;
  return enemyKindAtRank(family, rank + 1);
}
