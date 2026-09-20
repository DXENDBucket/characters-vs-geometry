import type { SkillState, Tower } from "../types";
import { towerBehaviorType } from "./towerIdentity";
import { gainSkillSp, getTowerSkillState, resetSkillCharge, spendSkillSp } from "./skillState";
import { isCellInSlowAura } from "./slowAura";

export const ORIENTATION_MAX_SP = 10;
export const ORIENTATION_DURATION = 6_000;

export function redirectOrientedTarget(towers: Tower[], target: Tower | undefined, time: number) {
  if (!target?.inPlay) return target;
  let redirect: Tower | undefined;
  for (const tower of towers) {
    if (!tower.inPlay || tower.transient || towerBehaviorType(tower) !== "o" || time >= (tower.skills.orientation?.activeUntil ?? 0)) continue;
    // Already redirected attacks stay locked instead of bouncing between overlapping o towers.
    if (tower === target) return target;
    if (!isCellInSlowAura(tower, target.column, target.lane)) continue;
    if (!redirect || tower.skills.orientation.activeUntil > redirect.skills.orientation.activeUntil ||
      (tower.skills.orientation.activeUntil === redirect.skills.orientation.activeUntil && tower.placedOrder > redirect.placedOrder)) {
      redirect = tower;
    }
  }
  return redirect ?? target;
}

export function orientationIsReady(tower: Tower, time: number) {
  const state = getTowerSkillState(tower, "orientation");
  return tower.inPlay && towerBehaviorType(tower) === "o" && time >= state.activeUntil && state.sp >= ORIENTATION_MAX_SP;
}

export function activateOrientation(tower: Tower, time: number) {
  if (!orientationIsReady(tower, time)) return false;
  const state = getTowerSkillState(tower, "orientation");
  spendSkillSp(state, ORIENTATION_MAX_SP);
  state.activeUntil = time + ORIENTATION_DURATION;
  syncOrientationVisual(tower, state, time);
  return true;
}

export function updateOrientation(tower: Tower, state: SkillState, seconds: number, time: number) {
  if (time >= state.activeUntil) {
    const recoverySeconds = Math.min(seconds, Math.max(0, (time - state.activeUntil) / 1_000));
    gainSkillSp(state, recoverySeconds, ORIENTATION_MAX_SP);
  }
  syncOrientationVisual(tower, state, time);
}

export function resetOrientation(tower: Tower, state: SkillState) {
  resetSkillCharge(state);
  state.activeUntil = 0;
  syncOrientationVisual(tower, state, 0);
}

function syncOrientationVisual(tower: Tower, state: SkillState, time: number) {
  const active = time < state.activeUntil;
  const rangeAlpha = active ? 0.9 : 0.22;
  if (tower.rangeBorder && tower.rangeBorder.alpha !== rangeAlpha) tower.rangeBorder.setAlpha(rangeAlpha);
  const borderAlpha = !active && state.sp >= ORIENTATION_MAX_SP ? 0.62 + Math.sin(time / 90) * 0.28 : 1;
  if (tower.border.alpha !== borderAlpha) tower.border.setAlpha(borderAlpha);
}
