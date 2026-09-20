import type { SkillState, Tower } from "../types";
import { gainSkillSp, getTowerSkillState, resetSkillCharge } from "./skillState";
import { effectiveTowerLevel } from "./towers";
import { towerBehaviorType } from "./towerIdentity";

export const PUSH_MAX_SP = 30;
export const PUSH_DURATION = 500;

export function pushIsReady(tower: Tower) {
  return tower.inPlay && !tower.transient && towerBehaviorType(tower) === "#" && getTowerSkillState(tower, "push").sp >= PUSH_MAX_SP;
}

export function updatePushSkill(tower: Tower, state: SkillState, seconds: number, time: number) {
  gainSkillSp(state, seconds * (1 + 0.5 * (effectiveTowerLevel(tower) - 1)), PUSH_MAX_SP);
  tower.border.setAlpha(state.sp >= PUSH_MAX_SP ? 0.7 + Math.sin(time / 90) * 0.3 : 1);
}

export function resetPushSkill(tower: Tower, state: SkillState) {
  resetSkillCharge(state);
  tower.border.setAlpha(1);
}
