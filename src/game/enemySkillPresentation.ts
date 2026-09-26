import type { EnemyState } from "./enemyState";

export interface EnemySkillPresentation {
  position(enemy: EnemyState): void;
  scale(enemy: EnemyState): void;
  heal(x: number, y: number): void;
  supportWave(x: number, y: number, toX: number, toY: number): void;
  shift(x: number, y: number, toX: number, toY: number): void;
  wings(x: number, y: number): void;
}
export const NO_ENEMY_SKILL_PRESENTATION: EnemySkillPresentation = Object.freeze({
  position() {}, scale() {}, heal() {}, supportWave() {}, shift() {}, wings() {}
});
