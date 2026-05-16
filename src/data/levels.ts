import { CUBE_BOSS_WAVE_CAP, TOTAL_WAVES, WAVES_PER_FLAG } from "../config";
import type { LevelConfig, LevelNode } from "../types";

export const levelNodes: LevelNode[] = [
  { id: "0-1", x: 230, y: 405, unlocked: true },
  { id: "0-2", x: 450, y: 310, unlocked: true },
  { id: "0-3", x: 670, y: 430, unlocked: true },
  { id: "0-4", x: 890, y: 330, unlocked: true },
  { id: "0-5", x: 1110, y: 440, unlocked: true },
  { id: "0-6", x: 1410, y: 255, unlocked: true },
  { id: "0-7", x: 1710, y: 385, unlocked: true },
  { id: "0-8", x: 2010, y: 265, unlocked: true },
  { id: "0-9", x: 2310, y: 405, unlocked: true },
  { id: "0-10", x: 2610, y: 300, unlocked: true },
  { id: "1-1", x: 230, y: 405, unlocked: true },
  { id: "1-2", x: 450, y: 310, unlocked: true },
  { id: "1-3", x: 670, y: 430, unlocked: true },
  { id: "1-4", x: 890, y: 330, unlocked: true },
  { id: "1-5", x: 1110, y: 440, unlocked: true },
  { id: "1-6", x: 1410, y: 330, unlocked: true },
  { id: "1-7", x: 1710, y: 430, unlocked: true },
  { id: "1-8", x: 2010, y: 330, unlocked: true },
  { id: "1-9", x: 2310, y: 430, unlocked: true }
];

export const levelConfigs: Record<string, LevelConfig> = {
  "0-1": {
    id: "0-1",
    enemyKinds: ["circle", "triangle"],
    firstWaveWeight: 10,
    waveWeightIncrement: 4,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "0-2": {
    id: "0-2",
    enemyKinds: ["circle", "circle2", "triangle"],
    firstWaveWeight: 13,
    waveWeightIncrement: 6,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "0-3": {
    id: "0-3",
    enemyKinds: ["circle", "circle2", "triangle", "triangle2"],
    firstWaveWeight: 16,
    waveWeightIncrement: 8,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "0-4": {
    id: "0-4",
    enemyKinds: ["circle", "triangle", "triangle2", "square"],
    firstWaveWeight: 16,
    waveWeightIncrement: 8,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "0-5": {
    id: "0-5",
    enemyKinds: ["circle", "circle2", "triangle", "triangle2", "square", "square2"],
    firstWaveWeight: 16,
    waveWeightIncrement: 8,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: CUBE_BOSS_WAVE_CAP,
    bossKind: "cube",
    endless: true
  },
  "0-6": {
    id: "0-6",
    enemyKinds: ["circle", "circle2", "circle3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 9,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "0-7": {
    id: "0-7",
    enemyKinds: ["circle", "triangle", "triangle2", "triangle3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 9,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "0-8": {
    id: "0-8",
    enemyKinds: ["circle", "square", "square2", "square3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 9,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "0-9": {
    id: "0-9",
    enemyKinds: ["circle", "circle2", "circle3", "triangle", "triangle2", "triangle3", "square", "square2", "square3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 10,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG
  },
  "0-10": {
    id: "0-10",
    enemyKinds: ["circle", "circle2", "circle3", "triangle", "triangle2", "triangle3", "square", "square2", "square3"],
    firstWaveWeight: 19,
    waveWeightIncrement: 10,
    wavesPerFlag: WAVES_PER_FLAG,
    waveWeightCap: CUBE_BOSS_WAVE_CAP,
    bossKind: "cube2",
    endless: true
  },
  "1-1": {
    id: "1-1",
    enemyKinds: ["circle", "triangle", "triangle2", "shootingTriangle"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "1-2": {
    id: "1-2",
    enemyKinds: ["circle", "triangle", "shootingTriangle", "shootingTriangle2"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "1-3": {
    id: "1-3",
    enemyKinds: ["circle", "triangle", "shootingTriangle", "shootingTriangle2", "invertedTriangle"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: TOTAL_WAVES,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "1-4": {
    id: "1-4",
    enemyKinds: ["circle", "triangle", "shootingTriangle", "shootingTriangle2", "invertedTriangle", "invertedTriangle2", "square"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "1-5": {
    id: "1-5",
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
  "1-6": {
    id: "1-6",
    enemyKinds: ["circle", "triangle", "triangle2", "triangle3", "shootingTriangle", "triangleRam"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "1-7": {
    id: "1-7",
    enemyKinds: ["circle", "triangle", "triangle3", "triangleRam", "triangleRam2", "shootingTriangle", "invertedTriangle"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: 30,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "1-8": {
    id: "1-8",
    enemyKinds: ["circle", "triangle", "triangle3", "mortarTriangle", "triangleRam"],
    firstWaveWeight: 19,
    waveWeightIncrement: 12,
    waveWeightIncrementGrowth: 1,
    totalWaves: 20,
    wavesPerFlag: WAVES_PER_FLAG,
    startingChars: 300
  },
  "1-9": {
    id: "1-9",
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
  }
};

export function getLevelConfig(levelId: string) {
  return levelConfigs[levelId] ?? levelConfigs["0-1"];
}
