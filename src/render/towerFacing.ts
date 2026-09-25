import type { Tower } from "../types";
import { towerFacingDirection } from "../game/towerRules";
import { setScaleIfChanged, setVisibleIfChanged } from "../game/visualGuards";

export function syncTowerFacingVisual(tower: Tower) {
  const reversed = towerFacingDirection(tower) === -1;
  const scaleX = reversed ? -1 : 1;
  setScaleIfChanged(tower.border, scaleX, 1);
  setScaleIfChanged(tower.label, scaleX, 1);
  setVisibleIfChanged(tower.facingIcon, reversed);
}
