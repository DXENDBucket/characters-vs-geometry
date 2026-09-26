import { CUBE_BOSS_STATS, CUBE_BOSS_WAVE_CAP, TOTAL_WAVES, WAVES_PER_FLAG } from "../config";
import type { LevelConfig, LevelNode } from "../types";
import { parseEnemyKind } from "../game/enemyIdentity";

const CHAPTER_THREE_STARTING_CHARS = 350;
const CHAPTER_FOUR_STARTING_CHARS = 500;
const CHAPTER_FOUR_FIRST_WAVE_WEIGHT = 25;
const CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT = 18;
const CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH = 3;
const CHAPTER_FIVE_STARTING_CHARS = 5000;
const CHAPTER_FIVE_FIRST_WAVE_WEIGHT = 50;
const CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT = 50;
const CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH = 7;

export const EX_LEVEL_DEFAULTS = {
  firstWaveWeight: 30,
  waveWeightIncrement: 35,
  waveWeightIncrementGrowth: 5,
  startingChars: 2000,
  wavesPerFlag: WAVES_PER_FLAG
} as const;

export const levelNodes: LevelNode[] = [
  { id: "0-1", x: 500, y: 410 },
  { id: "0-2", x: 820, y: 320 },
  { id: "0-3", x: 1140, y: 410 },
  { id: "0-4", x: 1460, y: 320 },
  { id: "0-5", x: 1780, y: 410 },
  { id: "0-6", x: 2100, y: 320 },
  { id: "1-1", x: 230, y: 405 },
  { id: "1-2", x: 450, y: 310 },
  { id: "1-3", x: 670, y: 430 },
  { id: "1-4", x: 890, y: 330 },
  { id: "1-5", x: 1110, y: 440 },
  { id: "1-6", x: 1410, y: 255 },
  { id: "1-7", x: 1710, y: 385 },
  { id: "1-8", x: 2010, y: 265 },
  { id: "1-9", x: 2310, y: 405 },
  { id: "1-10", x: 2610, y: 300 },
  { id: "2-1", x: 230, y: 405 },
  { id: "2-2", x: 450, y: 310 },
  { id: "2-3", x: 670, y: 430 },
  { id: "2-4", x: 890, y: 330 },
  { id: "2-5", x: 1110, y: 440 },
  { id: "2-6", x: 1410, y: 330 },
  { id: "2-7", x: 1710, y: 430 },
  { id: "2-8", x: 2010, y: 330 },
  { id: "2-9", x: 2310, y: 430 },
  { id: "2-10", x: 2610, y: 300 },
  { id: "3-1", x: 230, y: 405 },
  { id: "3-2", x: 450, y: 310 },
  { id: "3-3", x: 670, y: 430 },
  { id: "3-4", x: 890, y: 330 },
  { id: "3-5", x: 1110, y: 430 },
  { id: "3-6", x: 1330, y: 330 },
  { id: "3-7", x: 1550, y: 430 },
  { id: "3-8", x: 1770, y: 330 },
  { id: "3-9", x: 1990, y: 430 },
  { id: "3-10", x: 2210, y: 330 },
  { id: "4-1", x: 230, y: 405 },
  { id: "4-2", x: 450, y: 310 },
  { id: "4-3", x: 670, y: 430 },
  { id: "4-4", x: 890, y: 330 },
  { id: "4-5", x: 1110, y: 430 },
  { id: "4-6", x: 1330, y: 330 },
  { id: "4-7", x: 1550, y: 430 },
  { id: "4-8", x: 1770, y: 330 },
  { id: "4-9", x: 1990, y: 430 },
  { id: "4-10", x: 2210, y: 330 },
  { id: "5-1", x: 230, y: 405 },
  { id: "5-2", x: 450, y: 310 },
  { id: "5-3", x: 670, y: 430 },
  { id: "5-4", x: 890, y: 330 },
  { id: "5-5", x: 1110, y: 430 },
  { id: "5-6", x: 1330, y: 330 },
  { id: "5-7", x: 1550, y: 430 },
  { id: "5-8", x: 1770, y: 330 },
  { id: "5-9", x: 1990, y: 430 },
  { id: "5-10", x: 2210, y: 330 },
  { id: "IF-1", x: 500, y: 380 },
  { id: "IF-2", x: 820, y: 320 },
  { id: "IF-3", x: 1160, y: 430 },
  { id: "IF-4", x: 1500, y: 320 },
  { id: "IF-BE-1", x: 500, y: 380 },
  { id: "IF-BE-2", x: 820, y: 320 },
  { id: "IF-BE-3", x: 1160, y: 430 },
  { id: "IF-BE-4", x: 1500, y: 320 },
  { id: "AE-1", x: 500, y: 380 },
  { id: "AE-2", x: 820, y: 320 },
  { id: "AE-3", x: 1140, y: 380 },
  { id: "AE-4", x: 1460, y: 380 },
  { id: "AE-5", x: 1780, y: 320 },
  { id: "AE-6", x: 2100, y: 380 },
  { id: "AE-7", x: 2420, y: 320 },
  { id: "AE-8", x: 2740, y: 380 },
  { id: "AE-9", x: 3060, y: 320 },
  { id: "AE-10", x: 3380, y: 380 },
  { id: "AE-EX-1", x: 500, y: 380 },
  { id: "AE-EX-2", x: 820, y: 320 },
  { id: "AE-EX-3", x: 1140, y: 380 },
  { id: "AE-EX-4", x: 1460, y: 320 },
  { id: "AE-EX-5", x: 1780, y: 380 },
  { id: "AE-EX-6", x: 2100, y: 320 },
  { id: "AE-EX-7", x: 2420, y: 380 },
  { id: "AE-EX-8", x: 2740, y: 320 },
  { id: "AE-T-1", x: 500, y: 380 },
  { id: "AE-T-2", x: 820, y: 320 },
  { id: "AE-T-3", x: 1140, y: 380 },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `IF-${index + 5}`, x: 1840 + index * 340, y: index % 2 === 0 ? 430 : 320
  }))
];

export const levelConfigs: Record<string, LevelConfig> = {
  "AE-T-3": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-T-3", unlockAfter: "AE-T-2", totalWaves: 20, startingChars: 5000,
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "invertedTriangle", "invertedTriangle2",
      "invertedTriangle3", "equals", "equals2", "equals3", "hexMace", "dollar"],
    periodicEnemySpawns: [{ kind: "archangelHeptagon", lane: 3, intervalMs: 15_000 }]
  },
  "AE-T-2": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-T-2", unlockAfter: "AE-T-1", totalWaves: 20,
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "parentheses",
      "invertedTriangle", "invertedTriangle2", "invertedTriangle3", "dollar", "chevronLeader"],
    periodicTowerNullification: { intervalMs: 60_000, initialDelayMs: 30_000, durationMs: 30_000 }
  },
  "AE-T-1": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-T-1", unlockAfter: "AE-EX-8", totalWaves: 10,
    enemyKinds: ["circle", "circle2", "circle3", "tilde", "tilde2", "tilde3", "dollar"],
    extraWaveSpawns: [{ kind: "chevronLeader", lane: "all", wave: 1 }]
  },
  "AE-EX-8": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-EX-8", unlockAfter: "AE-EX-7",
    bossKind: "del", endless: true,
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "invertedTriangle", "invertedTriangle2", "invertedTriangle3",
      "parentheses", "parentheses2", "parentheses3", "dollar", "dollar2", "plus", "plus2", "minus", "minus2",
      "chevronLeader3", "hexMace", "hexMace2", "hexMace3"],
    periodicTowerNullification: { intervalMs: 60_000, durationMs: 10_000 }
  },
  "AE-EX-7": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-EX-7", unlockAfter: "AE-EX-6", totalWaves: 20,
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "equals3", "dollar", "plus", "minus"]
  },
  "AE-EX-6": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-EX-6", unlockAfter: "AE-EX-5", totalWaves: 20,
    enemyKinds: ["circle", "parentheses", "parentheses2", "equals", "equals2",
      "dollar", "dollar2", "plus", "plus2", "invertedTriangle", "invertedTriangle2", "invertedTriangle3",
      "invertedTriangle4", "invertedTriangle5", "chevronLeader", "archangelHeptagon3"],
    periodicTowerNullification: { intervalMs: 60_000, durationMs: 10_000 }
  },
  "AE-EX-5": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-EX-5", unlockAfter: "AE-EX-4", totalWaves: 20,
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "tilde4", "tilde5",
      "equals", "equals2", "equals3", "dollar", "plus",
      "triangleRam", "triangleRam2", "triangleRam3", "triangleRam4", "triangleRam5",
      "angelPentagonRam", "angelPentagonRam2", "angelPentagonRam3", "hexMace", "hexMace2", "hexMace3"]
  },
  "AE-EX-4": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-EX-4", unlockAfter: "AE-EX-3", totalWaves: 30,
    enemyKinds: ["circle", "tilde", "equals", "equals2", "equals3",
      "parentheses", "parentheses2", "parentheses3", "hexMace", "hexMace2", "hexMace3",
      "shootingTriangle", "shootingTriangle2", "shootingTriangle3", "diamond", "diamond2", "diamond3",
      "shootingPentagon", "shootingPentagon2", "shootingPentagon3", "mortarTriangle", "mortarTriangle2", "mortarTriangle3",
      "pentagon", "pentagon2", "pentagon3", "chevronLeader3"]
  },
  "AE-EX-3": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-EX-3", unlockAfter: "AE-EX-2", totalWaves: 30,
    enemyKinds: ["circle", "tilde3", "tilde4", "tilde5", "triangleRam3", "triangleRam4", "triangleRam5",
      "angelPentagon3", "chevronLeader"],
    extraWaveSpawns: [{ kind: "archangelHeptagon" }]
  },
  "AE-EX-2": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-EX-2", unlockAfter: "AE-EX-1", totalWaves: 20,
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "equals", "dollar",
      "angelPentagonRam", "angelPentagonRam2", "angelPentagonRam3", "hexMace", "hexMace2", "hexMace3"],
    periodicTowerNullification: { intervalMs: 60_000, durationMs: 10_000 }
  },
  "AE-EX-1": {
    ...EX_LEVEL_DEFAULTS,
    id: "AE-EX-1", unlockAfter: "AE-10", totalWaves: 10,
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "triangleRam", "triangleRam2", "triangleRam3"],
    extraWaveSpawns: [{ kind: "chevronLeader", lane: 3 }]
  },
  "AE-10": {
    id: "AE-10", unlockAfter: "AE-9",
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3",
      "parentheses", "parentheses2", "parentheses3", "dollar", "chevronLeader",
      "mortarTriangle", "pentagon", "diamond", "diamond2", "diamond3"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: 2000,
    wavesPerFlag: WAVES_PER_FLAG, waveWeightCap: 800,
    bossKind: "del", endless: true
  },
  "AE-9": {
    id: "AE-9", unlockAfter: "AE-8",
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3",
      "parentheses", "parentheses2", "parentheses3", "dollar", "chevronLeader"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: CHAPTER_FOUR_STARTING_CHARS,
    totalWaves: 20, wavesPerFlag: WAVES_PER_FLAG
  },
  "AE-8": {
    id: "AE-8", unlockAfter: "AE-7",
    enemyKinds: ["circle", "tilde", "tilde2", "parentheses", "parentheses2", "parentheses3",
      "dollar", "square2", "trapezoid2", "mortarTriangle", "mortarTriangle2", "mortarTriangle3",
      "pentagon", "pentagon2", "pentagon3", "hexSpellBulwark"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: CHAPTER_FOUR_STARTING_CHARS,
    totalWaves: 30, wavesPerFlag: WAVES_PER_FLAG
  },
  "AE-7": {
    id: "AE-7", unlockAfter: "AE-6",
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3",
      "triangleRam", "triangleRam2", "triangleRam3", "hexMace", "dollar", "heart"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: CHAPTER_FOUR_STARTING_CHARS,
    totalWaves: 20, wavesPerFlag: WAVES_PER_FLAG
  },
  "AE-6": {
    id: "AE-6", unlockAfter: "AE-5",
    enemyKinds: ["circle", "circle2", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3",
      "parentheses", "parentheses2", "parentheses3", "mortarTriangle", "mortarTriangle2", "mortarTriangle3"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: CHAPTER_FOUR_STARTING_CHARS,
    totalWaves: 20, wavesPerFlag: WAVES_PER_FLAG
  },
  "AE-5": {
    id: "AE-5", unlockAfter: "AE-4",
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3",
      "triangleRam", "triangleRam2", "triangleRam3", "hexMace", "hexMace2",
      "parentheses", "parentheses2", "parentheses3", "slopeTriangle3"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: CHAPTER_FOUR_STARTING_CHARS,
    totalWaves: 30, wavesPerFlag: WAVES_PER_FLAG
  },
  "AE-4": {
    id: "AE-4", unlockAfter: "AE-3",
    enemyKinds: ["circle", "triangle", "triangle2", "triangle3", "equals", "equals2", "equals3", "mortarTriangle", "pentagon"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: CHAPTER_FOUR_STARTING_CHARS,
    totalWaves: 20, wavesPerFlag: WAVES_PER_FLAG
  },
  "AE-3": {
    id: "AE-3", unlockAfter: "AE-2",
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "equals", "equals2", "equals3", "shootingPentagon", "shootingTriangle", "diamond", "heart"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: CHAPTER_FOUR_STARTING_CHARS,
    totalWaves: 20, wavesPerFlag: WAVES_PER_FLAG
  },
  "AE-2": {
    id: "AE-2", unlockAfter: "AE-1",
    enemyKinds: ["circle", "tilde", "tilde2", "tilde3", "angelPentagon", "angelPentagon2",
      "angelPentagonRam", "archangelHeptagon", "slopeTriangle", "hexagon", "hexSpellBulwark"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: CHAPTER_FOUR_STARTING_CHARS,
    totalWaves: 20, wavesPerFlag: WAVES_PER_FLAG
  },
  "AE-1": {
    id: "AE-1", unlockAfter: "4-10",
    enemyKinds: ["circle", "triangle", "triangle2", "triangle3", "triangleRam", "triangleRam2", "triangleRam3", "tilde", "tilde2", "tilde3"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    startingChars: CHAPTER_FOUR_STARTING_CHARS,
    totalWaves: 20, wavesPerFlag: WAVES_PER_FLAG
  },
  "IF-3": {
    id: "IF-3",
    unlockAfter: "2-9",
    survival: true,
    endless: true,
    enemyKinds: ["circle", "triangle", "shootingTriangle", "triangleRam", "mortarTriangle", "mortarTriangle2", "triangleRam3"],
    unlimitedRankFamilies: ["circle", "triangle", "shootingTriangle", "triangleRam", "mortarTriangle"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "IF-4": {
    id: "IF-4",
    unlockAfter: "3-9",
    survival: true,
    endless: true,
    enemyKinds: ["circle", "triangleRam", "triangle3", "pentagon", "angelPentagon", "shootingPentagon", "diamond2", "hexagon", "chargingHexagon"],
    unlimitedRankFamilies: ["circle", "triangleRam", "triangle", "pentagon", "angelPentagon", "shootingPentagon", "diamond", "hexagon", "chargingHexagon"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "IF-2": {
    id: "IF-2",
    unlockAfter: "2-4",
    survival: true,
    endless: true,
    enemyKinds: ["circle", "triangle", "shootingTriangle", "shootingTriangle2", "invertedTriangle", "invertedTriangle2", "square"],
    unlimitedRankFamilies: ["circle", "triangle", "shootingTriangle", "invertedTriangle", "square"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "IF-1": {
    id: "IF-1",
    unlockAfter: "1-9",
    survival: true,
    endless: true,
    enemyKinds: ["circle", "circle2", "circle3", "triangle", "triangle2", "triangle3", "square", "square2", "square3"],
    unlimitedRankFamilies: ["circle", "triangle", "square"],
    firstWaveWeight: 19,
    waveWeightIncrement: 10,
    waveWeightIncrementGrowth: 1,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "0-1": {
    id: "0-1",
    enemyKinds: ["circle"],
    firstWaveWeight: 10,
    waveWeightIncrement: 0,
    totalWaves: 3,
    wavesPerFlag: 3,
    startingChars: 350,
    specialMechanic: "tutorialBasics"
  },
  "0-2": {
    id: "0-2",
    enemyKinds: ["circle", "triangle"],
    spawnLanes: [3],
    deployableLanes: [3],
    firstWaveWeight: 10,
    waveWeightIncrement: 5,
    flagWeightMultiplier: 1,
    totalWaves: 5,
    wavesPerFlag: 5,
    startingChars: 350,
    specialMechanic: "tutorialPractice"
  },
  "0-3": {
    id: "0-3",
    enemyKinds: ["circle"],
    firstWaveWeight: 10,
    waveWeightIncrement: 0,
    totalWaves: 2,
    wavesPerFlag: 2,
    startingChars: 500,
    specialMechanic: "tutorialTowerTypes"
  },
  "0-4": {
    id: "0-4",
    enemyKinds: ["circle"],
    firstWaveWeight: 10,
    waveWeightIncrement: 0,
    totalWaves: 1,
    wavesPerFlag: 1,
    startingChars: 150,
    specialMechanic: "tutorialAutoUpgrade"
  },
  "0-5": {
    id: "0-5",
    enemyKinds: ["circle"],
    firstWaveWeight: 10,
    waveWeightIncrement: 0,
    totalWaves: 1,
    wavesPerFlag: 1,
    startingChars: 500,
    specialMechanic: "tutorialShifter"
  },
  "0-6": {
    id: "0-6",
    enemyKinds: [],
    firstWaveWeight: 10,
    waveWeightIncrement: 0,
    totalWaves: 1,
    wavesPerFlag: 1,
    startingChars: 0,
    specialMechanic: "tutorialDamage"
  },
  "1-1": {
    id: "1-1",
    enemyKinds: ["circle", "triangle"],
    firstWaveWeight: 10,
    waveWeightIncrement: 4,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "1-2": {
    id: "1-2",
    enemyKinds: ["circle", "circle2", "triangle"],
    firstWaveWeight: 13,
    waveWeightIncrement: 6,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "1-3": {
    id: "1-3",
    enemyKinds: ["circle", "circle2", "triangle", "triangle2"],
    firstWaveWeight: 16,
    waveWeightIncrement: 8,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "1-4": {
    id: "1-4",
    enemyKinds: ["circle", "triangle", "triangle2", "square"],
    firstWaveWeight: 16,
    waveWeightIncrement: 8,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "1-5": {
    id: "1-5",
    enemyKinds: ["circle", "circle2", "triangle", "triangle2", "square", "square2"],
    firstWaveWeight: 16,
    waveWeightIncrement: 8,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: CUBE_BOSS_WAVE_CAP,
    bossKind: "cube",
    endless: true
  },
  "1-6": {
    id: "1-6",
    enemyKinds: ["circle", "circle2", "circle3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 9,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "1-7": {
    id: "1-7",
    enemyKinds: ["circle", "triangle", "triangle2", "triangle3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 9,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "1-8": {
    id: "1-8",
    enemyKinds: ["circle", "square", "square2", "square3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 9,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "1-9": {
    id: "1-9",
    enemyKinds: ["circle", "circle2", "circle3", "triangle", "triangle2", "triangle3", "square", "square2", "square3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 10,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "1-10": {
    id: "1-10",
    enemyKinds: ["circle", "circle2", "circle3", "triangle", "triangle2", "triangle3", "square", "square2", "square3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 10,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: CUBE_BOSS_WAVE_CAP,
    bossKind: "cube2",
    endless: true
  },
  "2-1": {
    id: "2-1",
    enemyKinds: ["circle", "triangle", "triangle2", "shootingTriangle"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "2-2": {
    id: "2-2",
    enemyKinds: ["circle", "triangle", "shootingTriangle", "shootingTriangle2"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "2-3": {
    id: "2-3",
    enemyKinds: ["circle", "triangle", "shootingTriangle", "shootingTriangle2", "invertedTriangle"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "2-4": {
    id: "2-4",
    enemyKinds: ["circle", "triangle", "shootingTriangle", "shootingTriangle2", "invertedTriangle", "invertedTriangle2", "square"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "2-5": {
    id: "2-5",
    enemyKinds: [
      "circle",
      "triangle",
      "triangle2",
      "triangle3",
      "invertedTriangle",
      "invertedTriangle2",
      "shootingTriangle",
      "shootingTriangle2"
    ],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: 800,
    startingChars: 500,
    bossKind: "tetrahedron",
    endless: true
  },
  "2-6": {
    id: "2-6",
    enemyKinds: ["circle", "triangle", "triangle2", "triangle3", "shootingTriangle", "triangleRam"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "2-7": {
    id: "2-7",
    enemyKinds: ["circle", "triangle", "triangle3", "triangleRam", "triangleRam2", "shootingTriangle", "invertedTriangle"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: 40,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "2-8": {
    id: "2-8",
    enemyKinds: ["circle", "triangle", "triangle3", "mortarTriangle", "triangleRam"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "2-9": {
    id: "2-9",
    enemyKinds: [
      "circle",
      "triangle",
      "shootingTriangle",
      "triangleRam",
      "mortarTriangle",
      "mortarTriangle2",
      "triangleRam3"
    ],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "2-10": {
    id: "2-10",
    enemyKinds: [
      "circle",
      "triangle",
      "shootingTriangle",
      "triangleRam",
      "mortarTriangle",
      "mortarTriangle2",
      "triangleRam3"
    ],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: 800,
    startingChars: 500,
    bossKind: "tetrahedron2",
    endless: true
  },
  "3-1": {
    id: "3-1",
    enemyKinds: ["circle", "triangle", "square", "diamond"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    totalWaves: 10,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "3-2": {
    id: "3-2",
    enemyKinds: ["circle", "square", "triangleRam", "diamond"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "3-3": {
    id: "3-3",
    enemyKinds: ["circle", "square", "triangle3", "hexagon", "diamond"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "3-4": {
    id: "3-4",
    enemyKinds: ["circle", "circle3", "triangleRam3", "hexagon", "diamond", "diamond2"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "3-5": {
    id: "3-5",
    enemyKinds: ["circle", "square", "hexagon", "pentagon"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "3-6": {
    id: "3-6",
    enemyKinds: ["circle", "square2", "triangleRam", "hexagon", "shootingPentagon"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "3-7": {
    id: "3-7",
    enemyKinds: ["circle", "chargingHexagon", "hexagon", "pentagon", "shootingPentagon"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "3-8": {
    id: "3-8",
    enemyKinds: ["circle", "triangle3", "angelPentagon", "hexagon", "chargingHexagon"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "3-9": {
    id: "3-9",
    enemyKinds: [
      "circle",
      "triangleRam",
      "triangle3",
      "pentagon",
      "angelPentagon",
      "shootingPentagon",
      "diamond2",
      "hexagon",
      "chargingHexagon"
    ],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_THREE_STARTING_CHARS
  },
  "3-10": {
    id: "3-10",
    enemyKinds: ["circle", "square", "pentagon", "angelPentagon", "shootingPentagon", "hexagon", "chargingHexagon", "triangleRam3"],
    firstWaveWeight: 25,
    waveWeightIncrement: 16,
    waveWeightIncrementGrowth: 2,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: 800,
    startingChars: 500,
    bossKind: "dodecahedron",
    endless: true
  },
  "4-1": {
    id: "4-1",
    enemyKinds: ["circle", "triangle", "angelPentagon", "heart"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 10,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FOUR_STARTING_CHARS
  },
  "4-2": {
    id: "4-2",
    enemyKinds: ["circle", "triangleRam", "triangleRam2", "triangleRam3", "hexMace"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FOUR_STARTING_CHARS
  },
  "4-3": {
    id: "4-3",
    enemyKinds: ["circle", "triangle", "triangle3", "square", "burrowArrow"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 10,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FOUR_STARTING_CHARS
  },
  "4-4": {
    id: "4-4",
    enemyKinds: ["circle", "triangle", "triangleRam", "angelPentagonRam", "hexMace", "slopeTriangle"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FOUR_STARTING_CHARS
  },
  "4-5": {
    id: "4-5",
    enemyKinds: ["circle", "triangle", "triangle2", "triangle3", "angelPentagon", "slopeTriangle", "burrowArrow"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FOUR_STARTING_CHARS
  },
  "4-6": {
    id: "4-6",
    enemyKinds: ["circle", "triangle", "triangle2", "triangle3", "angelPentagon", "hexMace", "archangelHeptagon"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FOUR_STARTING_CHARS
  },
  "4-7": {
    id: "4-7",
    enemyKinds: [
      "circle",
      "triangle",
      "triangle2",
      "shootingTriangle",
      "diamond",
      "shootingPentagon",
      "triangleRam3",
      "square",
      "angelPentagonRam",
      "hexMace",
      "hexSpellBulwark",
      "heart",
      "archangelHeptagon",
      "slopeTriangle",
      "burrowArrow"
    ],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FOUR_STARTING_CHARS
  },
  "4-8": {
    id: "4-8",
    enemyKinds: ["circle", "triangle", "triangle2", "triangle3", "trapezoid", "diamond", "angelPentagon", "pentagon", "hexSpellBulwark"],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FOUR_STARTING_CHARS
  },
  "4-9": {
    id: "4-9",
    enemyKinds: [
      "circle",
      "circle2",
      "circle3",
      "triangle",
      "triangle2",
      "triangle3",
      "square",
      "trapezoid",
      "mortarTriangle",
      "pentagon",
      "burrowArrow"
    ],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FOUR_STARTING_CHARS
  },
  "4-10": {
    id: "4-10",
    enemyKinds: [
      "circle",
      "circle3",
      "triangle",
      "triangle2",
      "triangle3",
      "square",
      "trapezoid",
      "triangleRam3",
      "angelPentagonRam",
      "hexMace",
      "shootingTriangle",
      "diamond",
      "angelPentagon",
      "heart",
      "burrowArrow",
      "slopeTriangle",
      "hexSpellBulwark",
      "archangelHeptagon"
    ],
    firstWaveWeight: CHAPTER_FOUR_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FOUR_WAVE_WEIGHT_INCREMENT_GROWTH,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: 1000,
    startingChars: 5000,
    bossKind: "octahedron",
    endless: true
  },
  "5-1": {
    id: "5-1",
    enemyKinds: [
      "circle",
      "circle2",
      "circle3",
      "triangle",
      "triangle2",
      "triangle3",
      "square",
      "square2",
      "square3",
      "trapezoid",
      "trapezoid2",
      "trapezoid3",
      "heart2"
    ],
    firstWaveWeight: CHAPTER_FIVE_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FIVE_STARTING_CHARS
  },
  "5-2": {
    id: "5-2",
    enemyKinds: [
      "circle",
      "triangle",
      "triangle2",
      "triangle3",
      "triangleRam",
      "triangleRam3",
      "invertedTriangle",
      "invertedTriangle2",
      "invertedTriangle3",
      "shootingTriangle",
      "shootingTriangle2",
      "shootingTriangle3",
      "mortarTriangle",
      "mortarTriangle2",
      "mortarTriangle3",
      "burrowArrow2"
    ],
    firstWaveWeight: CHAPTER_FIVE_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FIVE_STARTING_CHARS
  },
  "5-3": {
    id: "5-3",
    enemyKinds: [
      "circle",
      "square",
      "trapezoid",
      "triangle3",
      "triangleRam3",
      "angelPentagon",
      "angelPentagon2",
      "archangelHeptagon2"
    ],
    firstWaveWeight: CHAPTER_FIVE_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FIVE_STARTING_CHARS
  },
  "5-4": {
    id: "5-4",
    enemyKinds: ["circle", "triangle", "hexagon", "hexagon2", "trapezoid", "hexMace", "hexMace2", "hexSpellBulwark2"],
    firstWaveWeight: CHAPTER_FIVE_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FIVE_STARTING_CHARS
  },
  "5-5": {
    id: "5-5",
    enemyKinds: [
      "circle",
      "square",
      "angelPentagonRam",
      "angelPentagonRam2",
      "pentagon2",
      "angelPentagon2",
      "shootingPentagon2",
      "hexMace2",
      "archangelHeptagon2"
    ],
    firstWaveWeight: CHAPTER_FIVE_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: 3500,
    startingChars: 10_000,
    bossKind: "dodecahedron2",
    endless: true
  },
  "5-6": {
    id: "5-6",
    enemyKinds: [
      "circle",
      "triangle",
      "triangle2",
      "triangle3",
      "invertedTriangle",
      "invertedTriangle2",
      "angelPentagon2",
      "angelPentagonRam2",
      "burrowArrow2",
      "archangelHeptagon2",
      "slopeTriangle2"
    ],
    firstWaveWeight: CHAPTER_FIVE_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FIVE_STARTING_CHARS
  },
  "5-7": {
    id: "5-7",
    enemyKinds: [
      "circle",
      "circle2",
      "circle3",
      "triangle",
      "triangle2",
      "triangle3",
      "triangleRam",
      "triangleRam2",
      "triangleRam3",
      "angelPentagonRam",
      "angelPentagonRam2",
      "angelPentagonRam3",
      "mortarTriangle",
      "mortarTriangle2",
      "mortarTriangle3",
      "pentagon",
      "pentagon2",
      "pentagon3",
      "angelPentagon",
      "angelPentagon2",
      "angelPentagon3",
      "shootingPentagon",
      "shootingPentagon2",
      "shootingPentagon3",
      "diamond",
      "diamond2",
      "diamond3",
      "hexagon",
      "hexagon2",
      "hexagon3",
      "chargingHexagon",
      "chargingHexagon2",
      "chargingHexagon3",
      "hexMace",
      "hexMace2",
      "hexMace3",
      "invertedTriangle",
      "invertedTriangle2",
      "invertedTriangle3",
      "shootingTriangle",
      "shootingTriangle2",
      "shootingTriangle3",
      "trapezoid",
      "trapezoid2",
      "trapezoid3",
      "square",
      "square2",
      "square3",
      "heart2",
      "burrowArrow2",
      "slopeTriangle2",
      "archangelHeptagon2",
      "hexSpellBulwark2"
    ],
    firstWaveWeight: CHAPTER_FIVE_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FIVE_STARTING_CHARS
  },
  "5-8": {
    id: "5-8",
    enemyKinds: [
      "circle",
      "circle3",
      "triangle",
      "triangle2",
      "triangle3",
      "square",
      "trapezoid",
      "triangleRam3",
      "angelPentagonRam3",
      "hexMace3",
      "shootingTriangle3",
      "diamond3",
      "angelPentagon3",
      "heart2",
      "burrowArrow2",
      "slopeTriangle2",
      "hexSpellBulwark2",
      "archangelHeptagon2"
    ],
    firstWaveWeight: CHAPTER_FIVE_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: 3500,
    startingChars: 10_000,
    bossKind: "octahedron2",
    endless: true
  },
  "5-9": {
    id: "5-9",
    enemyKinds: [
      "circle",
      "circle2",
      "circle3",
      "triangle",
      "triangle2",
      "triangle3",
      "square",
      "square2",
      "square3",
      "burrowArrow3"
    ],
    firstWaveWeight: CHAPTER_FIVE_FIRST_WAVE_WEIGHT,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    totalWaves: 40,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: CHAPTER_FIVE_STARTING_CHARS,
    specialMechanic: "rightColumnSeal"
  },
  "5-10": {
    id: "5-10",
    enemyKinds: [
      "circle",
      "circle2",
      "circle3",
      "triangle",
      "triangle2",
      "triangle3",
      "square",
      "square2",
      "square3",
      "heart3"
    ],
    firstWaveWeight: 260,
    waveWeightIncrement: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT,
    waveWeightIncrementGrowth: CHAPTER_FIVE_WAVE_WEIGHT_INCREMENT_GROWTH,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: 9000,
    startingChars: 50_000,
    bossKind: "icosahedron",
    ignoreEnemyMinFlag: true,
    bossPhases: [
      {
        maxHp: 300_000,
        armor: CUBE_BOSS_STATS.cube.armor,
        magicResistance: CUBE_BOSS_STATS.cube.magicResistance,
        finalDamageReduction: 0.7,
        waveWeightCap: 9000,
        enemyKinds: [
          "circle",
          "circle2",
          "circle3",
          "triangle",
          "triangle2",
          "triangle3",
          "square",
          "square2",
          "square3",
          "heart3"
        ]
      },
      {
        maxHp: 200_000,
        armor: CUBE_BOSS_STATS.tetrahedron.armor,
        magicResistance: CUBE_BOSS_STATS.tetrahedron.magicResistance,
        finalDamageReduction: 0.5,
        waveWeightCap: 9000,
        enemyKinds: [
          "circle",
          "triangle",
          "triangle2",
          "triangle3",
          "shootingTriangle",
          "shootingTriangle2",
          "shootingTriangle3",
          "triangleRam",
          "triangleRam2",
          "triangleRam3",
          "mortarTriangle",
          "mortarTriangle2",
          "mortarTriangle3",
          "slopeTriangle3"
        ]
      },
      {
        maxHp: 300_000,
        armor: CUBE_BOSS_STATS.dodecahedron.armor,
        magicResistance: CUBE_BOSS_STATS.dodecahedron.magicResistance,
        finalDamageReduction: 0.7,
        waveWeightCap: 9000,
        enemyKinds: [
          "circle",
          "circle2",
          "circle3",
          "square",
          "square2",
          "square3",
          "angelPentagonRam",
          "angelPentagonRam2",
          "angelPentagonRam3",
          "pentagon",
          "pentagon2",
          "pentagon3",
          "angelPentagon",
          "angelPentagon2",
          "angelPentagon3",
          "shootingPentagon",
          "shootingPentagon2",
          "shootingPentagon3",
          "hexMace",
          "hexMace2",
          "hexMace3",
          "archangelHeptagon3"
        ]
      },
      {
        maxHp: 300_000,
        armor: CUBE_BOSS_STATS.octahedron.armor,
        magicResistance: CUBE_BOSS_STATS.octahedron.magicResistance,
        waveWeightCap: 9000,
        enemyKinds: [
          "circle",
          "circle2",
          "circle3",
          "triangle",
          "triangle2",
          "triangle3",
          "square",
          "square2",
          "square3",
          "trapezoid",
          "trapezoid2",
          "trapezoid3",
          "triangleRam",
          "triangleRam2",
          "triangleRam3",
          "angelPentagonRam",
          "angelPentagonRam2",
          "angelPentagonRam3",
          "hexMace",
          "hexMace2",
          "hexMace3",
          "shootingTriangle",
          "shootingTriangle2",
          "shootingTriangle3",
          "diamond",
          "diamond2",
          "diamond3",
          "angelPentagon",
          "angelPentagon2",
          "angelPentagon3",
          "heart3",
          "burrowArrow3",
          "slopeTriangle3",
          "hexSpellBulwark3",
          "archangelHeptagon3"
        ]
      }
    ],
    endless: true
  }
};

// Inherit only wave-template fields, not story bosses, finite limits or special mechanics.
for (const [index, sourceId] of ["4-1", "4-4", "4-6", "4-7", "5-2", "5-4", "5-6", "5-7"].entries()) {
  const source = levelConfigs[sourceId];
  const id = `IF-${index + 5}`;
  const families = [...new Set(source.enemyKinds.map(kind => parseEnemyKind(kind)!.family))];
  levelConfigs[id] = {
    id,
    unlockAfter: sourceId,
    survival: true,
    endless: true,
    enemyKinds: [...families],
    unlimitedRankFamilies: families,
    firstWaveWeight: source.firstWaveWeight,
    waveWeightIncrement: source.waveWeightIncrement,
    waveWeightIncrementGrowth: source.waveWeightIncrementGrowth,
    wavesPerFlag: source.wavesPerFlag,
    startingChars: source.startingChars
  };
}

for (const [index, [sourceId, bossKind]] of ([["1-10", "cube"], ["2-10", "tetrahedron"], ["5-5", "dodecahedron"], ["5-8", "octahedron"]] as const).entries()) {
  const source = levelConfigs[sourceId];
  const id = `IF-BE-${index + 1}`;
  const families = [...new Set(source.enemyKinds.map(kind => parseEnemyKind(kind)!.family))];
  levelConfigs[id] = {
    ...source,
    id,
    unlockAfter: sourceId,
    survival: true,
    bossEndless: true,
    waveWeightCap: undefined,
    waveWeightIncrementGrowth: sourceId === "1-10" ? 1 : source.waveWeightIncrementGrowth,
    enemyKinds: [...families],
    unlimitedRankFamilies: families,
    startingChars: source.startingChars ?? 300,
    bossKind
  };
}

export function getLevelConfig(levelId: string) {
  return levelConfigs[levelId] ?? levelConfigs["1-1"];
}

export function levelPreviewEnemyKinds(level: LevelConfig) {
  return [...new Set([...level.enemyKinds, ...(level.extraWaveSpawns ?? []).map(spawn => spawn.kind),
    ...(level.periodicEnemySpawns ?? []).map(spawn => spawn.kind)])];
}
