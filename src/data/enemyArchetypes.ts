import type { EnemyDefinition, EnemyFamily } from "../types";

export type EnemyAttackMode = "melee" | "ranged" | "chargedRanged" | "mortar" | "laser" | "blockedDetonator" | "siegeRam" | "mace" | "special" | "leader" | "companion";
type EnemyPanel = Omit<EnemyDefinition, "kind" | "label">;
type GrowthField = "hp" | "armor" | "magicResistance" | "damage" | "speedMultiplier" | "weight" | "healthLinkCapacity";

export interface EnemyArchetype {
  base: EnemyPanel;
  growth: Partial<Record<GrowthField, number>>;
  catalogRanks: number;
  spawnRankCap?: number;
  attackMode: EnemyAttackMode;
  leader?: boolean;
  promotionMaxRank?: number;
  splitToPreviousRank?: boolean;
  blockedDetonationDelay?: number;
}

// Only the finite catalog is enumerated. Runtime ranks are resolved on demand.
export const enemyArchetypes: Record<EnemyFamily, EnemyArchetype> = {
  chevronLeader: {
    base: { hp: 32000, armor: 100, magicResistance: 50, damage: 450, damageType: "magic", speedMultiplier: 1.5, weight: 0 },
    growth: { hp: 16000 },
    catalogRanks: 3,
    attackMode: "chargedRanged",
    leader: true
  },
  dollar: {
    base: { hp: 20000, armor: 200, magicResistance: 50, damage: 800, damageType: "physical", speedMultiplier: 1, weight: 240 },
    growth: { weight: 200 },
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3
  },
  parentheses: {
    base: { hp: 5000, armor: 100, magicResistance: 40, damage: 600, damageType: "physical", speedMultiplier: 1.5, weight: 80 },
    growth: { weight: 120 },
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3
  },
  equals: {
    base: { hp: 12000, armor: 100, magicResistance: 25, damage: 400, damageType: "physical", speedMultiplier: 1.5, weight: 80, minFlag: 1, healthLinkCapacity: 1 },
    growth: { weight: 120, healthLinkCapacity: 1 },
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3
  },
  tilde: {
    base: { hp: 5000, armor: 100, magicResistance: 0, damage: 600, damageType: "physical", speedMultiplier: 1.5, weight: 30 },
    growth: { speedMultiplier: 0.5, weight: 60 },
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3
  },
  circle: {
    base: { hp: 3000, armor: 100, magicResistance: 0, damage: 400, damageType: "physical", weight: 10 },
    growth: { weight: 40 },
    spawnRankCap: 4,
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3,
    splitToPreviousRank: true
  },
  triangle: {
    base: { hp: 5000, armor: 100, magicResistance: 0, damage: 600, damageType: "physical", speedMultiplier: 1.5, weight: 30 },
    growth: { speedMultiplier: 0.5, weight: 60 },
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3
  },
  triangleRam: {
    base: { hp: 5000, armor: 200, magicResistance: 0, damage: 1400, damageType: "physical", speedMultiplier: 1.5, weight: 75, minWave: 5 },
    growth: { speedMultiplier: 0.5, weight: 150 },
    catalogRanks: 3,
    attackMode: "siegeRam",
    promotionMaxRank: 3
  },
  angelPentagonRam: {
    base: { hp: 5000, armor: 200, magicResistance: 40, damage: 1400, damageType: "magic", speedMultiplier: 1.5, weight: 320, minFlag: 1 },
    growth: { speedMultiplier: 0.5, weight: 320 },
    catalogRanks: 3,
    attackMode: "siegeRam",
    promotionMaxRank: 3
  },
  mortarTriangle: {
    base: { hp: 1500, armor: 70, magicResistance: 0, damage: 1150, damageType: "physical", speedMultiplier: 0.55, weight: 90, minFlag: 1 },
    growth: { weight: 90 },
    catalogRanks: 3,
    attackMode: "mortar",
    promotionMaxRank: 3
  },
  pentagon: {
    base: { hp: 1500, armor: 70, magicResistance: 40, damage: 800, damageType: "magic", speedMultiplier: 0.55, weight: 120, minFlag: 1 },
    growth: { weight: 120 },
    catalogRanks: 3,
    attackMode: "mortar",
    promotionMaxRank: 3
  },
  angelPentagon: {
    base: { hp: 1200, armor: 50, magicResistance: 20, damage: 300, damageType: "physical", speedMultiplier: 2, weight: 200, minFlag: 1 },
    growth: { weight: 50 },
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3
  },
  archangelHeptagon: {
    base: { hp: 4000, armor: 50, magicResistance: 20, damage: 1400, damageType: "magic", speedMultiplier: 3, weight: 0 },
    growth: { hp: 2000 },
    catalogRanks: 3,
    attackMode: "melee",
    leader: true
  },
  shootingPentagon: {
    base: { hp: 2000, armor: 70, magicResistance: 40, damage: 150, damageType: "magic", speedMultiplier: 0.4, weight: 125, minFlag: 1 },
    growth: { weight: 125 },
    catalogRanks: 3,
    attackMode: "laser",
    promotionMaxRank: 3
  },
  diamond: {
    base: { hp: 2000, armor: 70, magicResistance: 40, damage: 400, damageType: "magic", speedMultiplier: 0.4, weight: 100, minFlag: 1 },
    growth: { weight: 100 },
    catalogRanks: 3,
    attackMode: "ranged",
    promotionMaxRank: 3
  },
  hexagon: {
    base: { hp: 18000, armor: 150, magicResistance: 20, damage: 400, damageType: "physical", speedMultiplier: 0.5, weight: 160 },
    growth: { weight: 80 },
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3
  },
  chargingHexagon: {
    base: { hp: 12000, armor: 150, magicResistance: 40, damage: 500, damageType: "magic", speedMultiplier: 2.5, weight: 150 },
    growth: { weight: 150 },
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3
  },
  hexMace: {
    base: { hp: 9000, armor: 150, magicResistance: 0, damage: 400, damageType: "physical", speedMultiplier: 2, weight: 375, minFlag: 1 },
    growth: { damage: 60, weight: 125 },
    catalogRanks: 3,
    attackMode: "mace",
    promotionMaxRank: 3
  },
  hexSpellBulwark: {
    base: { hp: 24000, armor: 100, magicResistance: 80, damage: 1200, damageType: "magic", speedMultiplier: 1.5, weight: 0 },
    growth: {},
    catalogRanks: 3,
    attackMode: "melee",
    leader: true
  },
  heart: {
    base: { hp: 9999, armor: 299, magicResistance: 60, damage: 2100, damageType: "true", speedMultiplier: 3, weight: 0 },
    growth: { damage: 900 },
    catalogRanks: 3,
    attackMode: "leader",
    leader: true
  },
  burrowArrow: {
    base: { hp: 16500, armor: 250, magicResistance: 0, damage: 400, damageType: "physical", speedMultiplier: 2, weight: 0 },
    growth: {},
    catalogRanks: 3,
    attackMode: "melee",
    leader: true
  },
  slopeTriangle: {
    base: { hp: 21000, armor: 500, magicResistance: 0, damage: 0, damageType: "physical", speedMultiplier: 1, weight: 0 },
    growth: { speedMultiplier: 0.5 },
    catalogRanks: 3,
    attackMode: "leader",
    leader: true
  },
  invertedTriangle: {
    base: { hp: 1000, armor: 70, magicResistance: 60, damage: 2000, damageType: "magic", speedMultiplier: 4, weight: 50 },
    growth: { damage: 600, speedMultiplier: 0.5, weight: 50 },
    catalogRanks: 3,
    attackMode: "blockedDetonator",
    promotionMaxRank: 3,
    blockedDetonationDelay: 2000
  },
  shootingTriangle: {
    base: { hp: 2000, armor: 70, magicResistance: 0, damage: 400, damageType: "physical", speedMultiplier: 0.4, weight: 50 },
    growth: { weight: 50 },
    catalogRanks: 3,
    attackMode: "ranged"
  },
  dodecahedronCompanion: {
    base: { hp: 32000, armor: 2000, magicResistance: 40, damage: 0, damageType: "physical", speedMultiplier: 0, weight: 1 },
    growth: { hp: 8000 },
    catalogRanks: 2,
    attackMode: "companion"
  },
  trapezoid: {
    base: { hp: 12000, armor: 100, magicResistance: 80, damage: 400, damageType: "physical", weight: 70 },
    growth: { magicResistance: 10, weight: 50 },
    catalogRanks: 3,
    attackMode: "melee"
  },
  solarBomb: {
    base: { hp: 12000, armor: 0, magicResistance: 0, damage: 900, damageType: "true", speedMultiplier: 9, weight: 0 },
    growth: {},
    catalogRanks: 1,
    attackMode: "special"
  },
  square: {
    base: { hp: 12000, armor: 300, magicResistance: 0, damage: 400, damageType: "physical", speedMultiplier: 0.6, weight: 50 },
    growth: { armor: 300, weight: 100 },
    catalogRanks: 3,
    attackMode: "melee",
    promotionMaxRank: 3
  }
};
