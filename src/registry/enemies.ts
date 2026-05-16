import { enemyDefinitions as rawEnemyDefinitions } from "../data/enemies";
import { t } from "../i18n";
import type { DamageType, EnemyDefinition, EnemyKind } from "../types";

export type EnemyFamily = "circle" | "triangle" | "triangleRam" | "invertedTriangle" | "shootingTriangle" | "square";
export type EnemyAttackMode = "melee" | "ranged" | "blockedDetonator" | "siegeRam";

export interface BlockedDetonation {
  delay: number;
  damage: number;
  damageType: DamageType;
}

export interface EnemyRegistration {
  definition: EnemyDefinition;
  family: EnemyFamily;
  rank: number;
  nameKey: string;
  attackMode: EnemyAttackMode;
  blockedDetonation?: BlockedDetonation;
  promotionKind?: EnemyKind;
  splitSpawnKind?: EnemyKind;
}

const enemyRegistrations: Record<EnemyKind, EnemyRegistration> = {
  circle: {
    definition: rawEnemyDefinitions.circle,
    family: "circle",
    rank: 1,
    nameKey: "enemy.circle",
    attackMode: "melee",
    promotionKind: "circle2"
  },
  circle2: {
    definition: rawEnemyDefinitions.circle2,
    family: "circle",
    rank: 2,
    nameKey: "enemy.circle2",
    attackMode: "melee",
    promotionKind: "circle3",
    splitSpawnKind: "circle"
  },
  circle3: {
    definition: rawEnemyDefinitions.circle3,
    family: "circle",
    rank: 3,
    nameKey: "enemy.circle3",
    attackMode: "melee",
    splitSpawnKind: "circle2"
  },
  triangle: {
    definition: rawEnemyDefinitions.triangle,
    family: "triangle",
    rank: 1,
    nameKey: "enemy.triangle",
    attackMode: "melee",
    promotionKind: "triangle2"
  },
  triangle2: {
    definition: rawEnemyDefinitions.triangle2,
    family: "triangle",
    rank: 2,
    nameKey: "enemy.triangle2",
    attackMode: "melee",
    promotionKind: "triangle3"
  },
  triangle3: {
    definition: rawEnemyDefinitions.triangle3,
    family: "triangle",
    rank: 3,
    nameKey: "enemy.triangle3",
    attackMode: "melee"
  },
  triangleRam: {
    definition: rawEnemyDefinitions.triangleRam,
    family: "triangleRam",
    rank: 1,
    nameKey: "enemy.triangleRam",
    attackMode: "siegeRam",
    promotionKind: "triangleRam2"
  },
  triangleRam2: {
    definition: rawEnemyDefinitions.triangleRam2,
    family: "triangleRam",
    rank: 2,
    nameKey: "enemy.triangleRam2",
    attackMode: "siegeRam"
  },
  invertedTriangle: {
    definition: rawEnemyDefinitions.invertedTriangle,
    family: "invertedTriangle",
    rank: 1,
    nameKey: "enemy.invertedTriangle",
    attackMode: "blockedDetonator",
    promotionKind: "invertedTriangle2",
    blockedDetonation: {
      delay: 2_000,
      damage: 2_000,
      damageType: "magic"
    }
  },
  invertedTriangle2: {
    definition: rawEnemyDefinitions.invertedTriangle2,
    family: "invertedTriangle",
    rank: 2,
    nameKey: "enemy.invertedTriangle2",
    attackMode: "blockedDetonator",
    blockedDetonation: {
      delay: 2_000,
      damage: 2_600,
      damageType: "magic"
    }
  },
  shootingTriangle: {
    definition: rawEnemyDefinitions.shootingTriangle,
    family: "shootingTriangle",
    rank: 1,
    nameKey: "enemy.shootingTriangle",
    attackMode: "ranged"
  },
  shootingTriangle2: {
    definition: rawEnemyDefinitions.shootingTriangle2,
    family: "shootingTriangle",
    rank: 2,
    nameKey: "enemy.shootingTriangle2",
    attackMode: "ranged"
  },
  square: {
    definition: rawEnemyDefinitions.square,
    family: "square",
    rank: 1,
    nameKey: "enemy.square",
    attackMode: "melee",
    promotionKind: "square2"
  },
  square2: {
    definition: rawEnemyDefinitions.square2,
    family: "square",
    rank: 2,
    nameKey: "enemy.square2",
    attackMode: "melee",
    promotionKind: "square3"
  },
  square3: {
    definition: rawEnemyDefinitions.square3,
    family: "square",
    rank: 3,
    nameKey: "enemy.square3",
    attackMode: "melee"
  }
};

export const allEnemyDefinitions = rawEnemyDefinitions;
export const allEnemyRegistrations = enemyRegistrations;

export function getEnemyDefinition(kind: EnemyKind) {
  return enemyRegistrations[kind].definition;
}

export function getEnemyRegistration(kind: EnemyKind) {
  return enemyRegistrations[kind];
}

export function getEnemyDisplayName(kind: EnemyKind) {
  return t(enemyRegistrations[kind].nameKey);
}

export function enemyRank(kind: EnemyKind) {
  return enemyRegistrations[kind].rank;
}

export function enemyFamily(kind: EnemyKind) {
  return enemyRegistrations[kind].family;
}

export function enemyPromotionKind(kind: EnemyKind) {
  return enemyRegistrations[kind].promotionKind;
}

export function enemySplitSpawnKind(kind: EnemyKind) {
  return enemyRegistrations[kind].splitSpawnKind;
}

export function enemyIsRanged(kind: EnemyKind) {
  return enemyRegistrations[kind].attackMode === "ranged";
}

export function enemyIsBlockedDetonator(kind: EnemyKind) {
  return enemyRegistrations[kind].attackMode === "blockedDetonator";
}

export function enemyIsSiegeRam(kind: EnemyKind) {
  return enemyRegistrations[kind].attackMode === "siegeRam";
}

export function enemyBlockedDetonation(kind: EnemyKind) {
  return enemyRegistrations[kind].blockedDetonation;
}
