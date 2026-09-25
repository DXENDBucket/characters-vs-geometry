import type { DamageType } from "../types";
import type { BossState } from "./bossState";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";
import { NO_ENEMY_RELEASE_PRESENTATION, type EnemyReleasePresentation } from "./enemyReleaseRules";

// Observation only. State changes, removals and spawns never depend on these callbacks.
export interface UnitLifecyclePresentation extends EnemyReleasePresentation {
  towerHealth(tower: TowerState): void;
  enemyPosition(enemy: EnemyState): void;
  enemyScale(enemy: EnemyState): void;
  enemyForm(enemy: EnemyState): void;
  solarBomb(enemy: EnemyState): void;
  enemyInvincible(enemy: EnemyState): void;
  bossHit(boss: BossState, type: DamageType): void;
  bossInvincible(boss: BossState): void;
  bossSweepStarted(boss: BossState, time: number): void;
  removeBoss(parts: readonly BossState[], animate: boolean): void;
  removeEnemy(enemy: EnemyState, animate: boolean): void;
  removeTower(tower: TowerState): void;
  removeProjectile(projectile: { x: number; y: number }): void;
  slowAuraPulse(tower: TowerState): void;
}
export const NO_UNIT_LIFECYCLE_PRESENTATION: UnitLifecyclePresentation = Object.freeze({
  ...NO_ENEMY_RELEASE_PRESENTATION,
  towerHealth() {}, enemyPosition() {}, enemyScale() {}, enemyForm() {}, solarBomb() {},
  enemyInvincible() {}, bossHit() {}, bossInvincible() {}, bossSweepStarted() {},
  removeBoss() {}, removeEnemy() {}, removeTower() {}, removeProjectile() {}, slowAuraPulse() {}
});
