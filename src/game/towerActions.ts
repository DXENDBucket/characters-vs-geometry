import type { CardId, CubeBoss, Enemy, EnemyProjectile, MortarProjectile, Tower } from "../types";

export type TowerActionEvent =
  | { kind: "attack" }
  | { kind: "production" | "hitProduction" | "shock" | "detonation" | "targeted" }
  | { kind: "trap"; target: Enemy | CubeBoss | "boss" }
  | { kind: "retaliation"; target: Enemy }
  | { kind: "reflection"; projectile: EnemyProjectile | MortarProjectile }
  | { kind: "skill"; x?: number; y?: number; laneOffset?: number; columnOffset?: number };

export interface ImitationBehavior { type: CardId; level: number }
export type TowerActionListener = (source: Tower, event: TowerActionEvent) => void;
