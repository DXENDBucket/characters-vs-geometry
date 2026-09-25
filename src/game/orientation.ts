import type { SkillState, Tower } from "../types";
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

export function activateOrientation(tower: Tower, time: number) {
  if (!orientationIsReady(tower, time)) return false;
  const state = getTowerSkillState(tower, "orientation");
  spendTowerSkill("o", state);
  state.activeUntil = time + ORIENTATION_DURATION;
  syncOrientationVisual(tower, state, time);
  return true;
}

export function updateOrientation(tower: Tower, state: SkillState, seconds: number, time: number) {
  chargeTowerSkill("o", state, seconds, time);
  syncOrientationVisual(tower, state, time);
}

export function resetOrientation(tower: Tower, state: SkillState) {
  resetTowerSkillCharge("o", state);
  syncOrientationVisual(tower, state, 0);
}

function syncOrientationVisual(tower: Tower, state: SkillState, time: number) {
  const active = time < state.activeUntil && !tower.routedSkills?.o;
  const rangeAlpha = active ? 0.9 : 0.22;
  if (tower.rangeBorder && tower.rangeBorder.alpha !== rangeAlpha) tower.rangeBorder.setAlpha(rangeAlpha);
  const borderAlpha = !active && state.sp >= ORIENTATION_MAX_SP ? 0.62 + Math.sin(time / 90) * 0.28 : 1;
  if (tower.border.alpha !== borderAlpha) tower.border.setAlpha(borderAlpha);
}
