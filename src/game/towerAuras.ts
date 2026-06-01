import type { Tower } from "../types";
import { isPointInSlowAura } from "./slowAura";

const ZEAL_ATTACK_SPEED_MULTIPLIER = 1.35;

export function towerZealAttackSpeedMultiplier(towers: Tower[] | undefined, target: Tower) {
  return towerHasZeal(towers, target) ? ZEAL_ATTACK_SPEED_MULTIPLIER : 1;
}

export function towerHasZeal(towers: Tower[] | undefined, target: Tower) {
  return Boolean(
    towers?.some((tower) => {
      return tower.type === "e" && !tower.transient && isPointInSlowAura(tower, target.x, target.y);
    })
  );
}
