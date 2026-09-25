import type { CardId, CubeBoss, Enemy, EnemyProjectile, MortarProjectile, Tower } from "../types";
import type { EnemyState } from "./enemyState";
import type { BossState } from "./bossState";
import type { EnemyProjectileState, MortarProjectileState } from "./projectileState";
import type { TowerState } from "./towerState";

type NativeTowerEvent<E, B, P> =
  | { kind: "attack"; hitCount?: number }
  | { kind: "production" | "hitProduction" | "shock" | "detonation" | "targeted" }
  | { kind: "trap"; target: E | B | "boss" }
  | { kind: "retaliation"; target: E }
  | { kind: "reflection"; projectile: P }
  | { kind: "skill"; x?: number; y?: number; laneOffset?: number; columnOffset?: number };

export type NativeTowerActionEvent = NativeTowerEvent<Enemy, CubeBoss, EnemyProjectile | MortarProjectile>;
export type NativeTowerActionDataEvent = NativeTowerEvent<EnemyState, BossState, EnemyProjectileState | MortarProjectileState>;
export type TowerActionEvent = NativeTowerActionEvent | { kind: "combined"; original: NativeTowerActionEvent };
export type TowerActionDataEvent = NativeTowerActionDataEvent | { kind: "combined"; original: NativeTowerActionDataEvent };
export type TowerActionDataListener = (source: TowerState, event: TowerActionDataEvent) => boolean | void;

export interface ImitationBehavior { type: CardId; level: number }
// Returning true transfers the effect into a pipeline; the caller still pays its normal cost.
export type TowerActionListener = (source: Tower, event: TowerActionEvent) => boolean | void;
