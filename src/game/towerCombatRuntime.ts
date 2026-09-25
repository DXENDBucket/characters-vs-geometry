import type { CardDefinition, CardId, DamageType } from "../types";
import type { TowerState } from "./towerState";
import type { EnemyState } from "./enemyState";
import type { BossState } from "./bossState";
import type { ProjectileState, MortarProjectileState, TowerProjectileSpec, HomingTowerProjectileSpec, MortarProjectileSpec } from "./projectileState";
import type { TowerCombatPresentation } from "./towerCombatPresentation";
import type { TowerActionDataListener } from "./towerActions";
import type { TowerVolleyAction } from "./battleActions";

export interface TowerReadinessRuntime {
  towers: TowerState[];
  enemies: EnemyState[];
  boss: BossState | null;
  occupied: Map<string, TowerState>;
  battleTime: number;
  isCellDeployable?: (lane: number, column: number) => boolean;
}
export interface TowerCombatRuntime extends TowerReadinessRuntime {
  presentation: TowerCombatPresentation;
  projectiles: ProjectileState[];
  mortarProjectiles: MortarProjectileState[];
  createProjectile(spec: TowerProjectileSpec): ProjectileState;
  createHomingProjectile(spec: HomingTowerProjectileSpec): ProjectileState;
  createMortar(spec: MortarProjectileSpec): MortarProjectileState;
  damageTower(tower: TowerState, damage: number, type: DamageType): void;
  damageEnemy(enemy: EnemyState, damage: number, type: DamageType, source?: TowerState): boolean;
  damageBoss(damage: number, type: DamageType, part?: BossState): boolean;
  storeBlockedEnemies(tower: TowerState, definition: CardDefinition): void;
  gainChars(amount: number, x: number, y: number): void;
  spawnTower(id: CardId, lane: number, column: number, level: number, facingDirection?: -1 | 1): TowerState | null;
}
export interface TowerAttackRuntime extends TowerCombatRuntime {
  getDefinition(id: CardId): CardDefinition;
  scheduleBattleAction(delay: number, action: TowerVolleyAction): void;
  onTowerAction?: TowerActionDataListener;
}
