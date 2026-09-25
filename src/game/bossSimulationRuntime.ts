import type { BossKind, DamageType, EnemyKind } from "../types";
import type { BossState, CreateBossOptions } from "./bossState";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";
import type { MortarProjectileSpec, MortarProjectileState } from "./projectileState";
import type { EnemySpawnOptions } from "./waveSpawner";
import type { BossAttackAction } from "./battleActions";
import type { BossSimulationPresentation } from "./bossSimulationPresentation";

export interface BossSimulationRuntime {
  presentation: BossSimulationPresentation;
  random(): number;
  enemies: EnemyState[];
  towers: TowerState[];
  mortarProjectiles: MortarProjectileState[];
  getBoss(): BossState | null;
  wave: number;
  bossPhaseIndex: number;
  battleTime: number;
  finalDamageReduction: number;
  createBoss(kind: BossKind, finalDamageReduction: number, options: CreateBossOptions): BossState;
  createMortar(spec: MortarProjectileSpec): MortarProjectileState;
  spawnEnemy(options: EnemySpawnOptions): void;
  onEnemyPromotion(kind: EnemyKind): void;
  scheduleBattleAction(delay: number, action: BossAttackAction): void;
  nullifyTowers(durationMs: number): void;
  warnCellSeal(lane: number, column: number, warningMs: number, durationMs: number, leadInMs: number): void;
  sealCell(lane: number, column: number, durationMs: number): void;
  damageTower(tower: TowerState, damage: number, type: DamageType): void;
  triggerTrapTower(tower: TowerState, target: EnemyState | BossState | "boss"): void;
  triggerShockTower(tower: TowerState): void;
  endGame(): void;
}
