import type Phaser from "phaser";
import type { CubeBoss, DamageType, Enemy, MortarProjectile, Tower } from "../types";
import type { BossAttackAction, ScheduleBattleAction } from "./battleActions";
import { bossSimulationRuntime } from "../render/bossSimulation";
import { updateBossRuntime as advance, executeBossAttack as execute,
  initializeDodecahedronCompanions as companions, initializeOctahedronSolarBombs as bombs } from "./bossSimulation";

export interface BossRuntime {
  nullifyTowers: (durationMs: number) => void;
  enemyHpMultiplier?: () => number;
  scheduleBattleAction: ScheduleBattleAction;
  warnCellSeal: (lane: number, column: number, warningMs: number, durationMs: number, leadInMs: number) => void;
  sealCell: (lane: number, column: number, durationMs: number) => void;
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  mortarProjectiles: MortarProjectile[];
  getBoss: () => CubeBoss | null;
  wave: number;
  bossPhaseIndex: number;
  battleTime: number;
  finalDamageReduction: number;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  triggerTrapTower: (tower: Tower, target: Enemy | CubeBoss | "boss") => void;
  triggerShockTower: (tower: Tower) => void;
  endGame: () => void;
}

export function updateBossRuntime(runtime: BossRuntime, seconds: number) {
  advance(bossSimulationRuntime(runtime), seconds);
}
export function executeBossAttack(runtime: BossRuntime, action: BossAttackAction) {
  execute(bossSimulationRuntime(runtime), action);
}
export function initializeDodecahedronCompanions(runtime: BossRuntime, boss: CubeBoss) {
  companions(bossSimulationRuntime(runtime), boss);
}
export function initializeOctahedronSolarBombs(runtime: BossRuntime, boss: CubeBoss) {
  bombs(bossSimulationRuntime(runtime), boss);
}
