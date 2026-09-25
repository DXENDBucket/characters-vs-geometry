import type { TowerState } from "./towerState";
import type { SpellMortarFlight } from "./towerSkillSimulation";
export interface TowerSkillPresentation {
  health(tower: TowerState): void;
  heal(x: number, y: number): void;
  borderVisible(tower: TowerState, visible: boolean): void;
  borderAlpha(tower: TowerState, alpha: number): void;
  rangeAlpha(tower: TowerState, alpha: number): void;
  flying(tower: TowerState, time: number): void;
  numberRange(tower: TowerState, time: number): void;
  beginTowerUpdates(): void;
  mortarReady(tower: TowerState, time: number): void;
  mortarReset(tower: TowerState): void;
  flightCreated(flight: SpellMortarFlight): void;
  flightMoved(flight: SpellMortarFlight): void;
  flightRemoved(flight: SpellMortarFlight): void;
  mortarImpact(x: number, y: number, rangeX: number, rangeY: number): void;
}
export const NO_TOWER_SKILL_PRESENTATION: TowerSkillPresentation = Object.freeze({
  health() {}, heal() {}, borderVisible() {}, borderAlpha() {}, rangeAlpha() {}, flying() {}, numberRange() {},
  beginTowerUpdates() {}, mortarReady() {}, mortarReset() {}, flightCreated() {}, flightMoved() {}, flightRemoved() {}, mortarImpact() {}
});
