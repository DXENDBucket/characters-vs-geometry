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
  shootingTriangle: {
    kind: "shootingTriangle",
    label: "1",
    hp: 2_000,
    armor: 70,
    magicResistance: 0,
    damage: 400,
    damageType: "physical",
    speedMultiplier: 0.4,
    weight: 70
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
    weight: 130
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
