import type { DamageType } from "../types";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";
import type { BossState } from "./bossState";
import type { EnemyProjectileState, MortarProjectileState, MortarProjectileSpec } from "./projectileState";
import type { EnemyAttackAction } from "./battleActions";
import type { ProjectileMotionFrame } from "./projectileMotion";
import type { EnemySimulationPresentation } from "./enemySimulationPresentation";

export interface EnemySimulationRuntime {
  enemies: EnemyState[];
  towers: TowerState[];
  boss: BossState | null;
  occupied: Map<string, TowerState>;
  enemyProjectiles: EnemyProjectileState[];
  mortarProjectiles: MortarProjectileState[];
  battleTime: number;
  projectileMotion?: ProjectileMotionFrame;
  presentation: EnemySimulationPresentation;
  scheduleBattleAction(delay: number, action: EnemyAttackAction): void;
  createProjectile(state: EnemyProjectileState): EnemyProjectileState;
  createMortar(spec: MortarProjectileSpec): MortarProjectileState;
  damageTower(tower: TowerState, amount: number, type: DamageType): void;
  damageEnemy(enemy: EnemyState, amount: number, type: DamageType, source?: TowerState): boolean;
  damageBoss(amount: number, type: DamageType, part?: BossState): boolean;
  onRetaliation?: (tower: TowerState, enemy: EnemyState) => boolean;
  triggerTrapTower(tower: TowerState, target: EnemyState | BossState | "boss"): void;
  triggerShockTower(tower: TowerState): void;
  onEnemyReachedBase(enemy: EnemyState): boolean;
}
