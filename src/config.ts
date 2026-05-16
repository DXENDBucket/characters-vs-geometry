import type { BossKind, DifficultyConfig } from "./types";

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 760;
export const LANES = 7;
export const COLUMNS = 13;
export const CELL_SIZE = 78;
export const CELL_WIDTH = CELL_SIZE;
export const CELL_HEIGHT = CELL_SIZE;
export const BOARD_X = 240;
export const BOARD_Y = 138;
export const BOARD_WIDTH = COLUMNS * CELL_WIDTH;
export const BOARD_HEIGHT = LANES * CELL_HEIGHT;
export const FIRST_SPAWN_AT = 20_000;
export const STARTING_CHARS = 200;
export const BASE_INTEGRITY = 6;
export const ENEMY_SPEED = 10;
export const ENEMY_SPEED_VARIANCE = 0.1;
export const ATTACK_INTERVAL = 1_000;
export const NEXT_WAVE_DELAY = 20_000;
export const NATURAL_PRODUCE_INTERVAL = 5_000;
export const NATURAL_PRODUCE_AMOUNT = 25;
export const TOTAL_WAVES = 10;
export const WAVES_PER_FLAG = 10;
export const FIRST_WAVE_WEIGHT = 10;
export const WAVE_WEIGHT_INCREMENT = 4;
export const CARD_WIDTH = 166;
export const CARD_HEIGHT = 68;
export const CARD_BAR_WIDTH = 132;
export const PROGRESS_BAR_WIDTH = 160;
export const LEVEL_NODE_WIDTH = 150;
export const LEVEL_NODE_HEIGHT = 72;
export const CARD_SLOT_COUNT = 8;
export const DEFAULT_DIFFICULTY = 3;
export const DIFFICULTY_MIN = 0;
export const DIFFICULTY_MAX = 8;
export const BOSS_HITBOX_WIDTH = CELL_WIDTH * 2.95;
export const BOSS_HITBOX_HEIGHT = CELL_HEIGHT * 2.95;
export const CUBE_BOSS_STATS: Record<BossKind, { hp: number; armor: number; magicResistance: number }> = {
  cube: { hp: 150_000, armor: 300, magicResistance: 20 },
  cube2: { hp: 200_000, armor: 600, magicResistance: 20 }
};
export const CUBE_BOSS_PROMOTION_SKILL_MAX = 90;
export const CUBE_BOSS_PROMOTION_SKILL_COST = 30;
export const CUBE_BOSS_PROMOTION2_SKILL_MAX = 180;
export const CUBE_BOSS_PROMOTION2_SKILL_COST = 40;
export const CUBE_BOSS_ADVANCE_SKILL_MAX = 120;
export const CUBE_BOSS_ADVANCE_SKILL_COST = 120;
export const CUBE_BOSS_WAVE_CAP = 600;
export const CUBE_BOSS_CONTACT_DAMAGE = 2_000;
export const CUBE_BOSS_CONTACT_INTERVAL = 0.5;

export const palette = {
  black: 0x050505,
  nearBlack: 0x101010,
  panel: 0x161616,
  white: 0xf5f5f5,
  softWhite: 0xd8d8d8,
  mid: 0x8c8c8c,
  dim: 0x454545,
  magic: 0x9fdcff,
  green: 0x48ff88,
  time: 0x5b2a91,
  enemyShot: 0xff6464
};

export const difficultyConfigs: Record<number, DifficultyConfig> = {
  0: { weightMultiplier: 0.1, finalDamageReduction: 0 },
  1: { weightMultiplier: 0.4, finalDamageReduction: 0 },
  2: { weightMultiplier: 0.7, finalDamageReduction: 0 },
  3: { weightMultiplier: 1, finalDamageReduction: 0 },
  4: { weightMultiplier: 1.4, finalDamageReduction: 0 },
  5: { weightMultiplier: 1.8, finalDamageReduction: 0.3 },
  6: { weightMultiplier: 2.2, finalDamageReduction: 0.6 },
  7: { weightMultiplier: 3, finalDamageReduction: 0.75 },
  8: { weightMultiplier: 5, finalDamageReduction: 0.85 }
};

export function clampDifficulty(difficulty?: number) {
  if (typeof difficulty !== "number" || Number.isNaN(difficulty)) {
    return DEFAULT_DIFFICULTY;
  }

  return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, Math.round(difficulty)));
}

export function getDifficultyConfig(difficulty: number) {
  return difficultyConfigs[clampDifficulty(difficulty)] ?? difficultyConfigs[DEFAULT_DIFFICULTY];
}
