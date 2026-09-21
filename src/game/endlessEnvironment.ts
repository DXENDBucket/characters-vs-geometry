import type { LevelConfig } from "../types";

export const ENDLESS_HP_PER_FLAG = 0.35;

export function endlessEnemyHpMultiplier(level: Pick<LevelConfig, "survival" | "wavesPerFlag">, wave: number) {
  if (!level.survival) return 1;
  return 1 + Math.floor(Math.max(0, wave - 1) / level.wavesPerFlag) * ENDLESS_HP_PER_FLAG;
}
