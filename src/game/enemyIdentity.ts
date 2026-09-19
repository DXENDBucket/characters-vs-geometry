import { enemyArchetypes } from "../data/enemyArchetypes";
import type { EnemyFamily, EnemyKind } from "../types";

export interface EnemyIdentity {
  family: EnemyFamily;
  rank: number;
}

export function enemyKindAtRank(family: EnemyFamily, rank: number = 1): EnemyKind {
  if (!Object.hasOwn(enemyArchetypes, family) || !Number.isSafeInteger(rank) || rank < 1 ||
    (family === "solarBomb" && rank !== 1)) {
    throw new RangeError(`Invalid enemy identity: ${family} rank ${rank}`);
  }
  return rank === 1 ? family : `${family}${rank}` as EnemyKind;
}

export function parseEnemyKind(kind: unknown): EnemyIdentity | undefined {
  if (typeof kind !== "string") return undefined;
  if (Object.hasOwn(enemyArchetypes, kind)) return { family: kind as EnemyFamily, rank: 1 };
  const match = /^([A-Za-z]+)([1-9]\d*)$/.exec(kind);
  if (!match || !Object.hasOwn(enemyArchetypes, match[1]) || match[1] === "solarBomb") return undefined;
  const rank = Number(match[2]);
  // Rank one keeps the historical bare family id; reject aliases and unsafe save values.
  return Number.isSafeInteger(rank) && rank >= 2 ? { family: match[1] as EnemyFamily, rank } : undefined;
}

export function isEnemyKind(kind: unknown): kind is EnemyKind {
  return parseEnemyKind(kind) !== undefined;
}
