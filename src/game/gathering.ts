import { towerBehaviorType } from "./towerIdentity";
import type { SkillState, Tower } from "../types";
import { getTowerSkillState } from "./skillState";
import { TOWER_SKILLS } from "../data/towerAbilities";
import { chargeTowerSkill, resetTowerSkillCharge, spendTowerSkill, towerSkillIsReady } from "./towerSkillRules";

export const GATHERING_MAX_SP = TOWER_SKILLS.j.maxSp;
export const GATHERING_DURATION = TOWER_SKILLS.j.duration;
export { GATHERING_TRANSFER_INTERVAL, gatheringIsActive, gatherProjectile } from "./gatheringRules";

export function gatheringIsReady(tower: Tower, time: number) {
  const state = getTowerSkillState(tower, "gathering");
  return tower.inPlay && towerBehaviorType(tower) === "j" && towerSkillIsReady("j", state, time);
}

export function activateGathering(tower: Tower, time: number) {
  if (!gatheringIsReady(tower, time)) return false;
  const state = getTowerSkillState(tower, "gathering");
  spendTowerSkill("j", state);
  state.activeUntil = time + GATHERING_DURATION;
  syncGatheringVisual(tower, state, time);
  return true;
}

export function updateGathering(tower: Tower, state: SkillState, seconds: number, time: number) {
  chargeTowerSkill("j", state, seconds, time);
  syncGatheringVisual(tower, state, time);
}

export function resetGathering(tower: Tower, state: SkillState) {
  resetTowerSkillCharge("j", state);
  syncGatheringVisual(tower, state, 0);
}

function syncGatheringVisual(tower: Tower, state: SkillState, time: number) {
  const active = time < state.activeUntil && !tower.routedSkills?.j;
  const rangeAlpha = active ? 0.9 : 0.22;
  if (tower.rangeBorder && tower.rangeBorder.alpha !== rangeAlpha) tower.rangeBorder.setAlpha(rangeAlpha);
  const borderAlpha = !active && state.sp >= GATHERING_MAX_SP ? 0.62 + Math.sin(time / 90) * 0.28 : 1;
  if (tower.border.alpha !== borderAlpha) tower.border.setAlpha(borderAlpha);
}
