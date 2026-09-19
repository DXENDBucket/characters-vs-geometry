import type Phaser from "phaser";
import type { ScheduleBattleAction } from "./battleActions";
import type { CardDefinition, CardId, CubeBoss, DamageType, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower } from "../types";

export interface CombatRuntime {
  scheduleBattleAction?: ScheduleBattleAction;
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  boss: CubeBoss | null;
  occupied: Map<string, Tower>;
  battleTime: number;
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  mortarProjectiles: MortarProjectile[];
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType, sourceTower?: Tower) => boolean;
  damageBoss: (damage: number, damageType: DamageType, targetPart?: CubeBoss) => boolean;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  storeBlockedEnemies: (tower: Tower, definition: CardDefinition) => void;
  gainChars: (amount: number, x: number, y: number) => void;
  spawnTower: (id: CardId, lane: number, column: number, level: number, facingDirection?: -1 | 1) => Tower | null;
  isCellDeployable?: (lane: number, column: number) => boolean;
  triggerTrapTower: (tower: Tower, target: Enemy | CubeBoss | "boss") => void;
  triggerShockTower: (tower: Tower) => void;
  onEnemyReachedBase: (enemy: Enemy) => boolean;
  runWhenBattleActive: (action: () => void) => void;
}

export type CardReadinessRuntime = Pick<
  CombatRuntime,
  "enemies" | "towers" | "boss" | "occupied" | "battleTime" | "isCellDeployable"
>;

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
  | "storeBlockedEnemies"
  | "gainChars"
  | "spawnTower"
  | "isCellDeployable"
>;

export type EnemySpawnRuntime = Pick<CombatRuntime, "scene" | "enemies">;

export type EnemyAdvanceRuntime = Pick<
  CombatRuntime,
  | "scheduleBattleAction"
  | "scene"
  | "battleTime"
  | "enemies"
  | "towers"
  | "boss"
  | "occupied"
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
