import type { EnemyDefinition, EnemyKind } from "../types";

export const enemyDefinitions: Record<EnemyKind, EnemyDefinition> = {
  circle: {
    kind: "circle",
    label: "1",
    hp: 3_000,
    armor: 100,
    magicResistance: 0,
    damage: 400,
    damageType: "physical",
    weight: 10
  },
  circle2: {
    kind: "circle2",
    label: "2",
    hp: 3_000,
    armor: 100,
    magicResistance: 0,
    damage: 400,
    damageType: "physical",
    weight: 50
  },
  circle3: {
    kind: "circle3",
    label: "3",
    hp: 3_000,
    armor: 100,
    magicResistance: 0,
    damage: 400,
    damageType: "physical",
    weight: 90
  },
  triangle: {
    kind: "triangle",
    label: "1",
    hp: 5_000,
    armor: 100,
    magicResistance: 0,
    damage: 600,
    damageType: "physical",
    speedMultiplier: 1.5,
    weight: 30
  },
  triangle2: {
    kind: "triangle2",
    label: "2",
    hp: 5_000,
    armor: 100,
    magicResistance: 0,
    damage: 600,
    damageType: "physical",
    speedMultiplier: 2,
    weight: 90
  },
  triangle3: {
    kind: "triangle3",
    label: "3",
    hp: 5_000,
    armor: 100,
    magicResistance: 0,
    damage: 600,
    damageType: "physical",
    speedMultiplier: 2.5,
    weight: 150
  },
  triangleRam: {
    kind: "triangleRam",
    label: "1",
    hp: 5_000,
    armor: 200,
    magicResistance: 0,
    damage: 1_400,
    damageType: "physical",
    speedMultiplier: 1.5,
    weight: 75
  },
  triangleRam2: {
    kind: "triangleRam2",
    label: "2",
    hp: 5_000,
    armor: 200,
    magicResistance: 0,
    damage: 1_400,
    damageType: "physical",
    speedMultiplier: 2,
    weight: 225
  },
  triangleRam3: {
    kind: "triangleRam3",
    label: "3",
    hp: 5_000,
    armor: 200,
    magicResistance: 0,
    damage: 1_400,
    damageType: "physical",
    speedMultiplier: 2.5,
    weight: 375
  },
  mortarTriangle: {
    kind: "mortarTriangle",
    label: "1",
    hp: 1_500,
    armor: 70,
    magicResistance: 40,
    damage: 800,
    damageType: "magic",
    speedMultiplier: 0.3,
    weight: 90
  },
  mortarTriangle2: {
    kind: "mortarTriangle2",
    label: "2",
    hp: 1_500,
    armor: 70,
    magicResistance: 40,
    damage: 800,
    damageType: "magic",
    speedMultiplier: 0.3,
    weight: 180
  },
  invertedTriangle: {
    kind: "invertedTriangle",
    label: "1",
    hp: 1_000,
    armor: 70,
    magicResistance: 60,
    damage: 2_000,
    damageType: "magic",
    speedMultiplier: 4,
    weight: 50
  },
  invertedTriangle2: {
    kind: "invertedTriangle2",
    label: "2",
    hp: 1_000,
    armor: 70,
    magicResistance: 60,
    damage: 2_600,
    damageType: "magic",
    speedMultiplier: 4.5,
    weight: 100
  },
  shootingTriangle: {
    kind: "shootingTriangle",
    label: "1",
    hp: 2_000,
    armor: 70,
    magicResistance: 0,
    damage: 400,
    damageType: "physical",
    speedMultiplier: 0.4,
    weight: 50
  },
  shootingTriangle2: {
    kind: "shootingTriangle2",
    label: "2",
    hp: 2_000,
    armor: 70,
    magicResistance: 0,
    damage: 400,
    damageType: "physical",
    speedMultiplier: 0.4,
    weight: 100
  },
  square: {
    kind: "square",
    label: "1",
    hp: 12_000,
    armor: 300,
    magicResistance: 0,
    damage: 400,
    damageType: "physical",
    speedMultiplier: 0.6,
    weight: 50
  },
  square2: {
    kind: "square2",
    label: "2",
    hp: 12_000,
    armor: 600,
    magicResistance: 0,
    damage: 400,
    damageType: "physical",
    speedMultiplier: 0.6,
    weight: 150
  },
  square3: {
    kind: "square3",
    label: "3",
    hp: 12_000,
    armor: 900,
    magicResistance: 0,
    damage: 400,
    damageType: "physical",
    speedMultiplier: 0.6,
    weight: 250
  }
};
