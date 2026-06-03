import type Phaser from "phaser";
import type { CardId, CubeBoss, DamageType, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower } from "../types";

export interface CombatRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  boss: CubeBoss | null;
  occupied: Map<string, Tower>;
  battleTime: number;
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  mortarProjectiles: MortarProjectile[];
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType, sourceTower?: Tower) => void;
  damageBoss: (damage: number, damageType: DamageType, targetPart?: CubeBoss) => void;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  gainChars: (amount: number, x: number, y: number) => void;
  spawnTower: (id: CardId, lane: number, column: number, level: number, facingDirection?: -1 | 1) => Tower | null;
  triggerTrapTower: (tower: Tower, target: Enemy | CubeBoss | "boss") => void;
  triggerShockTower: (tower: Tower) => void;
  onEnemyReachedBase: (enemy: Enemy) => boolean;
  runWhenBattleActive: (action: () => void) => void;
}

export type CardReadinessRuntime = Pick<CombatRuntime, "enemies" | "towers" | "boss" | "occupied" | "battleTime">;

export type CardBehaviorRuntime = Pick<
  CombatRuntime,
  | "scene"
  | "enemies"
  | "towers"
  | "boss"
  | "occupied"
  | "battleTime"
  | "projectiles"
  | "mortarProjectiles"
  | "damageEnemy"
  | "damageBoss"
  | "damageTower"
  | "gainChars"
  | "spawnTower"
>;

export type EnemySpawnRuntime = Pick<CombatRuntime, "scene" | "enemies">;

export type EnemyAdvanceRuntime = Pick<
  CombatRuntime,
  | "scene"
  | "enemies"
  | "towers"
  | "boss"
  | "enemyProjectiles"
  | "mortarProjectiles"
  | "damageTower"
  | "damageEnemy"
  | "damageBoss"
  | "triggerTrapTower"
  | "triggerShockTower"
  | "onEnemyReachedBase"
  | "runWhenBattleActive"
>;
