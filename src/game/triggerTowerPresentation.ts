import type { DamageType } from "../types";
export interface TriggerTowerPresentation {
  freeze(x: number, y: number, radius: number): void;
  reversal(x: number, y: number, radius: number): void;
  shock(x: number, y: number, rangeX: number, rangeY: number, type: DamageType): void;
  trap(x: number, y: number, type: DamageType): void;
}
export const NO_TRIGGER_TOWER_PRESENTATION: TriggerTowerPresentation = Object.freeze({
  freeze() {}, reversal() {}, shock() {}, trap() {}
});
