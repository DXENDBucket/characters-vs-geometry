import type { SkillState, Tower } from "../types";
import { towerBehaviorType, towerHasSkillBehavior } from "./towerIdentity";
import { getTowerSkillState } from "./skillState";
import { TOWER_SKILLS } from "../data/towerAbilities";
import { chargeTowerSkill, resetTowerSkillCharge, spendTowerSkill, towerSkillIsReady } from "./towerSkillRules";
import { inFriendlyRange } from "./towerTopology";

export const ORIENTATION_MAX_SP = TOWER_SKILLS.o.maxSp;
export const ORIENTATION_DURATION = TOWER_SKILLS.o.duration;

export function redirectOrientedTarget(towers: Tower[], target: Tower | undefined, time: number) {
  if (!target?.inPlay) return target;
  let redirect: Tower | undefined;
  for (const tower of towers) {
    if (!tower.inPlay || tower.transient || !towerHasSkillBehavior(tower, "o") || time >= (tower.skills.orientation?.activeUntil ?? 0)) continue;
    // Already redirected attacks stay locked instead of bouncing between overlapping o towers.
    if (tower === target) return target;
    if (!inFriendlyRange(tower, target, TOWER_SKILLS.o.range.shape.right, TOWER_SKILLS.o.range.shape.cutCorners)) continue;
    if (!redirect || tower.skills.orientation.activeUntil > redirect.skills.orientation.activeUntil ||
      (tower.skills.orientation.activeUntil === redirect.skills.orientation.activeUntil && tower.placedOrder > redirect.placedOrder)) {
      redirect = tower;
    }
  }
  return redirect ?? target;
}

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
