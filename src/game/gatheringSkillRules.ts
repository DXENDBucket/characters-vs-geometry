import { towerBehaviorType } from "./towerIdentity";
import type { SkillState } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { TowerSkillPresentation } from "./towerSkillPresentation";
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

export function activateGathering(tower: Tower, time: number, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  if (!gatheringIsReady(tower, time)) return false;
  const state = getTowerSkillState(tower, "gathering");
  spendTowerSkill("j", state);
  state.activeUntil = time + GATHERING_DURATION;
  syncGatheringVisual(tower, state, time, presentation);
  return true;
}

export function updateGathering(tower: Tower, state: SkillState, seconds: number, time: number, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  chargeTowerSkill("j", state, seconds, time);
  syncGatheringVisual(tower, state, time, presentation);
}

export function resetGathering(tower: Tower, state: SkillState, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  resetTowerSkillCharge("j", state);
  syncGatheringVisual(tower, state, 0, presentation);
}

function syncGatheringVisual(tower: Tower, state: SkillState, time: number, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  const active = time < state.activeUntil && !tower.routedSkills?.j;
  const rangeAlpha = active ? 0.9 : 0.22;
  presentation.rangeAlpha(tower, rangeAlpha);
  const borderAlpha = !active && state.sp >= GATHERING_MAX_SP ? 0.62 + Math.sin(time / 90) * 0.28 : 1;
  presentation.borderAlpha(tower, borderAlpha);
}
