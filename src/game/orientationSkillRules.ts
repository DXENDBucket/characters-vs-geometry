import type { SkillState } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { TowerSkillPresentation } from "./towerSkillPresentation";
import { towerBehaviorType } from "./towerIdentity";
import { getTowerSkillState } from "./skillState";
import { TOWER_SKILLS } from "../data/towerAbilities";
import { chargeTowerSkill, resetTowerSkillCharge, spendTowerSkill, towerSkillIsReady } from "./towerSkillRules";
export { redirectOrientedTarget } from "./orientationRules";

export const ORIENTATION_MAX_SP = TOWER_SKILLS.o.maxSp;
export const ORIENTATION_DURATION = TOWER_SKILLS.o.duration;

export function orientationIsReady(tower: Tower, time: number) {
  const state = getTowerSkillState(tower, "orientation");
  return tower.inPlay && towerBehaviorType(tower) === "o" && towerSkillIsReady("o", state, time);
}

export function activateOrientation(tower: Tower, time: number, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  if (!orientationIsReady(tower, time)) return false;
  const state = getTowerSkillState(tower, "orientation");
  spendTowerSkill("o", state);
  state.activeUntil = time + ORIENTATION_DURATION;
  syncOrientationVisual(tower, state, time, presentation);
  return true;
}

export function updateOrientation(tower: Tower, state: SkillState, seconds: number, time: number, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  chargeTowerSkill("o", state, seconds, time);
  syncOrientationVisual(tower, state, time, presentation);
}

export function resetOrientation(tower: Tower, state: SkillState, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  resetTowerSkillCharge("o", state);
  syncOrientationVisual(tower, state, 0, presentation);
}

function syncOrientationVisual(tower: Tower, state: SkillState, time: number, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  const active = time < state.activeUntil && !tower.routedSkills?.o;
  const rangeAlpha = active ? 0.9 : 0.22;
  presentation.rangeAlpha(tower, rangeAlpha);
  const borderAlpha = !active && state.sp >= ORIENTATION_MAX_SP ? 0.62 + Math.sin(time / 90) * 0.28 : 1;
  presentation.borderAlpha(tower, borderAlpha);
}
