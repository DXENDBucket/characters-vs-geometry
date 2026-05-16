import type Phaser from "phaser";
import type { CubeBoss, DamageType, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower } from "../types";

export interface CombatRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  boss: CubeBoss | null;
  occupied: Map<string, Tower>;
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  mortarProjectiles: MortarProjectile[];
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType) => void;
  damageBoss: (damage: number, damageType: DamageType) => void;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  gainChars: (amount: number, x: number, y: number) => void;
  triggerTrapTower: (tower: Tower, target: Enemy | "boss") => void;
  triggerShockTower: (tower: Tower) => void;
  onEnemyReachedBase: (enemy: Enemy) => boolean;
  runWhenBattleActive: (action: () => void) => void;
}

export type CardReadinessRuntime = Pick<CombatRuntime, "enemies" | "towers" | "boss" | "occupied">;

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
  | "gainChars"
>;

export type EnemySpawnRuntime = Pick<CombatRuntime, "scene" | "enemies">;

export type EnemyAdvanceRuntime = Pick<
  CombatRuntime,
  | "scene"
  | "enemies"
  | "towers"
  | "enemyProjectiles"
  | "mortarProjectiles"
  | "damageTower"
  | "damageEnemy"
  | "triggerTrapTower"
  | "triggerShockTower"
  | "onEnemyReachedBase"
  | "runWhenBattleActive"
>;
