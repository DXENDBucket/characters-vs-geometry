import type { DamageType } from "../types";
import type { TowerState } from "./towerState";
import type { EnemyState } from "./enemyState";

export interface TowerCombatPresentation {
  health(tower: TowerState): void;
  heal(x: number, y: number): void;
  hit(x: number, y: number, type: DamageType): void;
  laser(x: number, y: number, endX: number): void;
  sunder(x: number, y: number): void;
  slash(x: number, y: number, type: DamageType): void;
  arc(x: number, y: number, type: DamageType, direction: -1 | 1): void;
  shift(x: number, y: number, toX: number, toY: number): void;
  enemyPosition(enemy: EnemyState): void;
  enemyDepth(enemy: EnemyState, depth: number): void;
}
export const NO_TOWER_COMBAT_PRESENTATION: TowerCombatPresentation = Object.freeze({
  health() {}, heal() {}, hit() {}, laser() {}, sunder() {}, slash() {}, arc() {}, shift() {},
  enemyPosition() {}, enemyDepth() {}
});
