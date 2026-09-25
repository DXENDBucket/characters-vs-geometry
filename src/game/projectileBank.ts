import type { TowerState as Tower } from "./towerState";

export const PROJECTILE_BANK_CAPACITY = 128;

export function projectileBankCapacity(tower: Pick<Tower, "level"> & Partial<Pick<Tower, "levelBonus" | "mirrorLevelBonus">>) {
  const level = Math.max(1, Math.floor(tower.level + (tower.levelBonus ?? 0) + (tower.mirrorLevelBonus ?? 0)));
  return PROJECTILE_BANK_CAPACITY * level;
}
