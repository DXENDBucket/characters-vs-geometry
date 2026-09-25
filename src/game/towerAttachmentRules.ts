import type { TowerState } from "./towerState";

export const TRUE_DAMAGE_DURATION_PER_LEVEL = 12_000;

export function applyTowerTrueDamageState(tower: TowerState, battleTime: number, level: number) {
  const duration = TRUE_DAMAGE_DURATION_PER_LEVEL * Math.max(1, level);
  tower.trueDamageUntil = Math.max(tower.trueDamageUntil, battleTime) + duration;
}
