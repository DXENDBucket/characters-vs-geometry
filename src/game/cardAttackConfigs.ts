import { CELL_WIDTH } from "../config";
import type { CardId, ProjectileKind } from "../types";

export type MuzzleFace = "right" | "up" | "down" | "left" | "center";

export interface MuzzlePoint {
  face: MuzzleFace;
  offsetX?: number;
  offsetY?: number;
}

export interface ProjectileShotConfig {
  angleDegrees: number;
  muzzle?: MuzzlePoint;
}

export type AttackAreaConfig =
  | {
      kind: "laneForward";
      rangeCells?: number;
      startOffsetX?: number;
    }
  | {
      kind: "laneRectangle";
      rangeCells: number;
    }
  | {
      kind: "verticalFan";
      direction: "up" | "down";
      halfWidth: number;
      spreadDegrees: number;
    };

export interface ProjectilePatternConfig {
  projectileKind: ProjectileKind;
  speed: number;
  defaultMuzzle: MuzzlePoint;
  shots: ProjectileShotConfig[];
  splashRadius?: number | "definition";
  maxTravelArea?: AttackAreaConfig;
}

export const muzzleFaceOffsets: Record<MuzzleFace, { x: number; y: number }> = {
  right: { x: 24, y: 0 },
  up: { x: 0, y: -24 },
  down: { x: 0, y: 24 },
  left: { x: -24, y: 0 },
  center: { x: 0, y: 0 }
};

export const cardAttackAreas: Partial<Record<CardId, AttackAreaConfig>> = {
  A: { kind: "laneForward", startOffsetX: 24 },
  C: { kind: "laneForward", startOffsetX: 24 },
  E: { kind: "laneForward", startOffsetX: 24 },
  M: { kind: "verticalFan", direction: "down", halfWidth: CELL_WIDTH * 0.35, spreadDegrees: 10 },
  W: { kind: "verticalFan", direction: "up", halfWidth: CELL_WIDTH * 0.35, spreadDegrees: 10 },
  I: { kind: "laneRectangle", rangeCells: 6 },
  Q: { kind: "laneRectangle", rangeCells: 6 },
  J: { kind: "laneRectangle", rangeCells: 6 },
  K: { kind: "laneRectangle", rangeCells: 3 }
};

export const projectilePatterns: Partial<Record<CardId, ProjectilePatternConfig>> = {
  A: {
    projectileKind: "bolt",
    speed: 540,
    defaultMuzzle: { face: "right" },
    shots: [{ angleDegrees: 0 }]
  },
  C: {
    projectileKind: "shell",
    speed: 390,
    defaultMuzzle: { face: "right", offsetX: -2 },
    shots: [{ angleDegrees: 0 }],
    splashRadius: "definition"
  },
  E: {
    projectileKind: "bolt",
    speed: 540,
    defaultMuzzle: { face: "right" },
    shots: [{ angleDegrees: -10 }, { angleDegrees: 0 }, { angleDegrees: 10 }]
  },
  M: {
    projectileKind: "bolt",
    speed: 540,
    defaultMuzzle: { face: "down" },
    shots: [{ angleDegrees: 80 }, { angleDegrees: 90 }, { angleDegrees: 100 }]
  },
  W: {
    projectileKind: "bolt",
    speed: 540,
    defaultMuzzle: { face: "up" },
    shots: [{ angleDegrees: -100 }, { angleDegrees: -90 }, { angleDegrees: -80 }]
  },
  I: {
    projectileKind: "star",
    speed: 540,
    defaultMuzzle: { face: "right", offsetX: -12 },
    shots: [{ angleDegrees: 0 }],
    maxTravelArea: cardAttackAreas.I
  },
  Q: {
    projectileKind: "dollar",
    speed: 540,
    defaultMuzzle: { face: "right", offsetX: -12 },
    shots: [{ angleDegrees: 0 }],
    maxTravelArea: cardAttackAreas.Q
  },
  J: {
    projectileKind: "hash",
    speed: 390,
    defaultMuzzle: { face: "right", offsetX: -2 },
    shots: [{ angleDegrees: 0 }],
    splashRadius: "definition",
    maxTravelArea: cardAttackAreas.J
  }
};

export function getCardAttackArea(type: CardId) {
  return cardAttackAreas[type] ?? ({ kind: "laneForward", startOffsetX: 24 } satisfies AttackAreaConfig);
}

export function getProjectilePattern(type: CardId) {
  return projectilePatterns[type];
}
