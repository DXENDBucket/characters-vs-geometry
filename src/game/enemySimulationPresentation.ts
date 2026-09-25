import type { DamageType } from "../types";
import type { EnemyState } from "./enemyState";
import { NO_ENEMY_RELEASE_PRESENTATION, type EnemyReleasePresentation } from "./enemyReleaseRules";
import { NO_ENEMY_SKILL_PRESENTATION, type EnemySkillPresentation } from "./enemySkillPresentation";
import type { ParenthesisPresentation } from "./parenthesisRules";

export interface EnemySimulationPresentation extends EnemyReleasePresentation, EnemySkillPresentation, ParenthesisPresentation {
  facing(enemy: EnemyState): void;
  chevron(enemy: EnemyState): void;
  solarBomb(enemy: EnemyState): void;
  rotateSolarBomb(enemy: EnemyState, seconds: number): void;
  depth(enemy: EnemyState, depth: number): void;
  alpha(enemy: EnemyState, alpha: number): void;
  visible(enemy: EnemyState, visible: boolean): void;
  burrowTip(enemy: EnemyState, visible: boolean): void;
  remove(enemy: EnemyState): void;
  highFlightHalo(enemy: EnemyState, time: number): void;
  highFlightHover(enemy: EnemyState, time: number): void;
  landHighFlight(enemy: EnemyState): void;
  hasteTrail(x: number, y: number): void;
  heartPulse(x: number, y: number, radius: number): void;
  reflect(x: number, y: number): void;
  solarCollision(x: number, y: number): void;
  burst(x: number, y: number, radius: number, type: DamageType): void;
  pulse(x: number, y: number, rangeX: number, rangeY: number, type?: DamageType): void;
  laser(x: number, y: number, endX: number): void;
  hit(x: number, y: number): void;
}
export const NO_ENEMY_SIMULATION_PRESENTATION: EnemySimulationPresentation = Object.freeze({
  ...NO_ENEMY_RELEASE_PRESENTATION, ...NO_ENEMY_SKILL_PRESENTATION,
  carrier() {}, facing() {}, chevron() {}, solarBomb() {}, rotateSolarBomb() {}, depth() {}, alpha() {},
  visible() {}, burrowTip() {}, remove() {}, highFlightHalo() {}, highFlightHover() {}, landHighFlight() {},
  hasteTrail() {}, heartPulse() {}, reflect() {}, solarCollision() {}, burst() {}, pulse() {}, laser() {}, hit() {}
});
