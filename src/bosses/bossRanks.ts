import { CUBE_BOSS_STATS } from "../config";
import { enemyArchetypes } from "../data/enemyArchetypes";
import { enemyKindAtRank, parseEnemyKind } from "../game/enemyIdentity";
import type { BossKind, EnemyKind } from "../types";

export function rankedBossFamily(kind: unknown) {
  if (kind === "cube" || kind === "cube2") return "cube";
  if (kind === "tetrahedron" || kind === "tetrahedron2") return "tetrahedron";
  if (kind === "dodecahedron" || kind === "dodecahedron2") return "dodecahedron";
  return undefined;
}

export function bossStatsAtRank(kind: BossKind, rank: number) {
  const family = rankedBossFamily(kind);
  if (!family || !Number.isSafeInteger(rank) || rank < 1) throw new RangeError("Invalid ranked boss");
  const one = CUBE_BOSS_STATS[family];
  const two = CUBE_BOSS_STATS[`${family}2`];
  return {
    ...one,
    hp: one.hp + (two.hp - one.hp) * (rank - 1),
    armor: one.armor + (two.armor - one.armor) * (rank - 1),
    magicResistance: one.magicResistance + (two.magicResistance - one.magicResistance) * (rank - 1),
    speed: one.speed + (two.speed - one.speed) * (rank - 1)
  };
}

export function tetrahedronChargeSpeedAtRank(rank: number) {
  if (!Number.isSafeInteger(rank) || rank < 1) throw new RangeError("Invalid tetrahedron rank");
  return 2 + 0.5 * (rank - 1);
}

export function dodecahedronAttacksAtRank(rank: number) {
  if (!Number.isSafeInteger(rank) || rank < 1) throw new RangeError("Invalid dodecahedron rank");
  return { companionLaserHits: 4 * rank, companionMortarHits: 2 * rank,
    deathLaserHits: 7 * rank, deathMortarTargets: 2 * rank + 2 };
}

export function cubePromotionKind(kind: EnemyKind, bossRank: number): EnemyKind | undefined {
  const { family, rank } = parseEnemyKind(kind)!;
  const archetype = enemyArchetypes[family];
  if (!archetype.promotionMaxRank || rank > bossRank || rank >= (archetype.spawnRankCap ?? Infinity)) return;
  return enemyKindAtRank(family, rank + 1);
}
