import type { BossKind, DifficultyConfig } from "./types";
import { TOWER_SKILLS } from "./data/towerAbilities";
import { BOSS_SKILLS } from "./data/bossAbilities";

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 760;
export const BATTLE_STATUS_Y = 92;
export const BATTLE_PROGRESS_Y = GAME_HEIGHT - 50;
export const FLYING_DISPLAY_OFFSET_Y = -14;
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
export const AIR_PATROL_INITIAL_SP = TOWER_SKILLS.w.initialSp;
export const AIR_PATROL_SKILL_MAX = TOWER_SKILLS.w.maxSp;
export const AIR_PATROL_SKILL_COST = TOWER_SKILLS.w.cost;
export const AIR_PATROL_SKILL_DURATION = TOWER_SKILLS.w.duration;
export const NEXT_WAVE_DELAY = 30_000;
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
export const CARD_SLOT_COUNT = 10;
export const DEFAULT_DIFFICULTY = 3;
export const DIFFICULTY_MIN = 0;
export const DIFFICULTY_MAX = 9;
export const DIFFICULTY_VERSION = 2;
export const DEFAULT_GAME_SPEED = 1;
export const GAME_SPEED_MIN = 0.5;
export const GAME_SPEED_MAX = 4;
export const BOSS_HITBOX_WIDTH = CELL_WIDTH * 2.95;
export const BOSS_HITBOX_HEIGHT = CELL_HEIGHT * 2.95;
export const BOSS_COPY_WARNING_DURATION = 4_000;
export const CUBE_BOSS_STATS: Record<
  BossKind,
  { hp: number; armor: number; magicResistance: number; speed: number; hitboxCells?: number }
> = {
  del: { hp: 500_000, armor: 150, magicResistance: 20, speed: 0, hitboxCells: 2.95 },
  cube: { hp: 150_000, armor: 300, magicResistance: 20, speed: 0.6 },
  cube2: { hp: 200_000, armor: 600, magicResistance: 20, speed: 0.6 },
  tetrahedron: { hp: 120_000, armor: 150, magicResistance: 20, speed: 1.2 },
  tetrahedron2: { hp: 120_000, armor: 150, magicResistance: 20, speed: 1.2 },
  dodecahedron: { hp: 100_000, armor: 200, magicResistance: 90, speed: 0.6 },
  dodecahedron2: { hp: 100_000, armor: 200, magicResistance: 90, speed: 0.6 },
  smallStellatedDodecahedron: { hp: 100_000, armor: 200, magicResistance: 90, speed: 0.6 },
  octahedron: { hp: 120_000, armor: 200, magicResistance: 60, speed: 0.6 },
  octahedron2: { hp: 170_000, armor: 200, magicResistance: 60, speed: 0.6 },
  icosahedron: { hp: 1_000_000, armor: 0, magicResistance: 0, speed: 0.5, hitboxCells: 4.95 }
};
export const CUBE_BOSS_PROMOTION_SKILL_MAX = BOSS_SKILLS.promotion.maxSp;
export const CUBE_BOSS_PROMOTION_SKILL_COST = BOSS_SKILLS.promotion.cost;
export const CUBE_BOSS_ADVANCE_SKILL_MAX = BOSS_SKILLS.advance.maxSp;
export const CUBE_BOSS_ADVANCE_SKILL_COST = BOSS_SKILLS.advance.cost;
export const DODECAHEDRON_BOSS_ENDLESS_WINGS_SKILL_MAX = BOSS_SKILLS.endlessWings.maxSp;
export const DODECAHEDRON_BOSS_ENDLESS_WINGS_SKILL_COST = BOSS_SKILLS.endlessWings.cost;
export const ICOSAHEDRON_BOSS_ULTIMATE_ADVANCE_SKILL_MAX = BOSS_SKILLS.ultimateAdvance.maxSp;
export const ICOSAHEDRON_BOSS_ULTIMATE_ADVANCE_SKILL_COST = BOSS_SKILLS.ultimateAdvance.cost;
export const ICOSAHEDRON_BOSS_ULTIMATE_ADVANCE_INITIAL_SP = BOSS_SKILLS.ultimateAdvance.initialSp;
export const ICOSAHEDRON_BOSS_HEARTBEAT_ALPHA_SKILL_MAX = BOSS_SKILLS.heartbeatAlpha.maxSp;
export const ICOSAHEDRON_BOSS_HEARTBEAT_ALPHA_SKILL_COST = BOSS_SKILLS.heartbeatAlpha.cost;
export const ICOSAHEDRON_BOSS_HEARTBEAT_ALPHA_INITIAL_SP = BOSS_SKILLS.heartbeatAlpha.initialSp;
export const ICOSAHEDRON_BOSS_HEARTBEAT_BETA_SKILL_MAX = BOSS_SKILLS.heartbeatBeta.maxSp;
export const ICOSAHEDRON_BOSS_HEARTBEAT_BETA_SKILL_COST = BOSS_SKILLS.heartbeatBeta.cost;
export const ICOSAHEDRON_BOSS_HEARTBEAT_BETA_INITIAL_SP = BOSS_SKILLS.heartbeatBeta.initialSp;
export const ICOSAHEDRON_BOSS_LEAP_SKILL_MAX = BOSS_SKILLS.leap.maxSp;
export const ICOSAHEDRON_BOSS_LEAP_SKILL_COST = BOSS_SKILLS.leap.cost;
export const ICOSAHEDRON_BOSS_LEAP_INITIAL_SP = BOSS_SKILLS.leap.initialSp;
export const TETRAHEDRON_BOSS_CHARGE_SKILL_MAX = BOSS_SKILLS.charge.maxSp;
export const TETRAHEDRON_BOSS_CHARGE_SKILL_COST = BOSS_SKILLS.charge.cost;
export const TETRAHEDRON_BOSS_CHARGE_DURATION = BOSS_SKILLS.charge.duration;
export const TETRAHEDRON_BOSS_CHARGE_SUPPRESSION_SP_GAIN = BOSS_SKILLS.charge.grantsSp.amount;
export const TETRAHEDRON_BOSS_IMPACT_SKILL_MAX = BOSS_SKILLS.impact.maxSp;
export const TETRAHEDRON_BOSS_IMPACT_SKILL_COST = BOSS_SKILLS.impact.cost;
export const TETRAHEDRON_BOSS_IMPACT_CHARGE_SP_GAIN = BOSS_SKILLS.impact.grantsSp.amount;
export const TETRAHEDRON_BOSS_SUPPRESSION_SKILL_MAX = BOSS_SKILLS.suppression.maxSp;
export const TETRAHEDRON_BOSS_SUPPRESSION_SKILL_COST = BOSS_SKILLS.suppression.cost;
export const TETRAHEDRON_BOSS_SUPPRESSION_IMPACT_SP_GAIN = BOSS_SKILLS.suppression.grantsSp.amount;
export const TETRAHEDRON_BOSS_DESPERATION_SKILL_MAX = BOSS_SKILLS.desperation.maxSp;
export const TETRAHEDRON_BOSS_DESPERATION_SKILL_COST = BOSS_SKILLS.desperation.cost;
export const TETRAHEDRON_BOSS_DESPERATION_CHARGE_SP_GAIN = BOSS_SKILLS.desperation.grantsSp.amount;
export const TETRAHEDRON_BOSS_INVINCIBLE_DURATION = 15_000;
export const TETRAHEDRON_BOSS_HASTE_DURATION = 60_000;
export const TETRAHEDRON_BOSS_HASTE_MULTIPLIER = 3;
export const CLOCK_TOWER_SKILL_MAX = TOWER_SKILLS.c.maxSp;
export const CLOCK_TOWER_SKILL_DURATION = TOWER_SKILLS.c.duration;
export const GUARDIAN_TOWER_SKILL_MAX = TOWER_SKILLS.h.maxSp;
export const GUARDIAN_TOWER_SKILL_COST = TOWER_SKILLS.h.cost;
export const GUARDIAN_TOWER_HEAL_RATIO = TOWER_SKILLS.h.healRatio;
export const SPELL_MORTAR_SKILL_MAX = TOWER_SKILLS.S.maxSp;
export const SPELL_MORTAR_SKILL_COST = TOWER_SKILLS.S.cost;
export const SPELL_MORTAR_SHOT_COUNT = TOWER_SKILLS.S.shotCount;
export const SPELL_MORTAR_SHOT_INTERVAL = TOWER_SKILLS.S.shotInterval;
export const SPELL_MORTAR_AOE_RANGE_X = CELL_WIDTH * TOWER_SKILLS.S.impact.shape.halfWidth;
export const SPELL_MORTAR_AOE_RANGE_Y = CELL_HEIGHT * TOWER_SKILLS.S.impact.shape.halfHeight;
export const CUBE_BOSS_WAVE_CAP = 600;
export const CUBE_BOSS_CONTACT_DAMAGE = 2_000;
export const CUBE_BOSS_CONTACT_INTERVAL = 0.5;

export const uiTextColors = {
  primary: "#ffffff",
  body: "#e8e8e8",
  secondary: "#bcbcbc",
  completed: "#9fdcff"
};

export const palette = {
  black: 0x050505,
  nearBlack: 0x101010,
  panel: 0x161616,
  white: 0xf5f5f5,
  softWhite: 0xd8d8d8,
  mid: 0x8c8c8c,
  dim: 0x454545,
  magic: 0x9fdcff,
  completed: 0x9fdcff,
  green: 0x48ff88,
  gold: 0xffd75a,
  heart: 0xff7eb6,
  unyielding: 0xffaaaa,
  time: 0x5b2a91,
  enemyShot: 0xff6464
};

export const difficultyConfigs: Record<number, DifficultyConfig> = {
  0: { weightMultiplier: 0.5, finalDamageReduction: 0 },
  1: { weightMultiplier: 1, finalDamageReduction: 0 },
  2: { weightMultiplier: 1.4, finalDamageReduction: 0.1 },
  3: { weightMultiplier: 1.8, finalDamageReduction: 0.3 },
  4: { weightMultiplier: 2.2, finalDamageReduction: 0.5 },
  5: { weightMultiplier: 2.6, finalDamageReduction: 0.65 },
  6: { weightMultiplier: 3, finalDamageReduction: 0.75 },
  7: { weightMultiplier: 4, finalDamageReduction: 0.8 },
  8: { weightMultiplier: 5.2, finalDamageReduction: 0.85 },
  9: { weightMultiplier: 6.66, finalDamageReduction: 0.9 }
};

export function validStoredDifficulty(difficulty: number, version = 1) {
  return (version === 1 || version === DIFFICULTY_VERSION) && Number.isInteger(difficulty) &&
    difficulty >= DIFFICULTY_MIN && difficulty <= (version === 1 ? 9 : DIFFICULTY_MAX);
}

export function migrateDifficulty(difficulty: number, version = 1) {
  return version === 1 ? Math.max(DIFFICULTY_MIN, difficulty - 1) : difficulty;
}

export function clampDifficulty(difficulty?: number) {
  if (typeof difficulty !== "number" || Number.isNaN(difficulty)) {
    return DEFAULT_DIFFICULTY;
  }

  return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, Math.round(difficulty)));
}

export function getDifficultyConfig(difficulty: number) {
  return difficultyConfigs[clampDifficulty(difficulty)] ?? difficultyConfigs[DEFAULT_DIFFICULTY];
}
