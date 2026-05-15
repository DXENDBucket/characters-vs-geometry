import type Phaser from "phaser";
import type { CubeBoss, DamageType, Enemy, EnemyProjectile, Projectile, Tower } from "../types";

export interface CombatRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  boss: CubeBoss | null;
  occupied: Map<string, Tower>;
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType) => void;
  damageBoss: (damage: number, damageType: DamageType) => void;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  triggerTrapTower: (tower: Tower, target: Enemy | "boss") => void;
  triggerShockTower: (tower: Tower) => void;
  onEnemyReachedBase: (enemy: Enemy) => boolean;
}

export type CardReadinessRuntime = Pick<CombatRuntime, "enemies" | "boss" | "occupied">;

export type CardBehaviorRuntime = Pick<
  CombatRuntime,
  | "scene"
  | "enemies"
  | "towers"
  | "boss"
  | "occupied"
  | "projectiles"
  | "damageEnemy"
  | "damageBoss"
  | "damageTower"
>;

export type EnemySpawnRuntime = Pick<CombatRuntime, "scene" | "enemies">;

export type EnemyAdvanceRuntime = Pick<
  CombatRuntime,
  | "scene"
  | "enemies"
  | "towers"
  | "enemyProjectiles"
  | "damageTower"
  | "damageEnemy"
  | "triggerTrapTower"
  | "triggerShockTower"
  | "onEnemyReachedBase"
>;
