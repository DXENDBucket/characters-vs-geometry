import type { SkillState, Tower } from "../types";
import { getTowerSkillState } from "./skillState";
import { TOWER_SKILLS } from "../data/towerAbilities";
import { chargeTowerSkill, resetTowerSkillCharge, towerSkillIsReady } from "./towerSkillRules";
import { effectiveTowerLevel } from "./towers";
import { towerBehaviorType } from "./towerIdentity";

export const PUSH_MAX_SP = TOWER_SKILLS["#"].maxSp;
export const PUSH_DURATION = TOWER_SKILLS["#"].duration;

export function pushIsReady(tower: Tower) {
  return tower.inPlay && !tower.transient && towerBehaviorType(tower) === "#" && towerSkillIsReady("#", getTowerSkillState(tower, "push"), 0);
}

export function updatePushSkill(tower: Tower, state: SkillState, seconds: number, time: number) {
  chargeTowerSkill("#", state, seconds, time, effectiveTowerLevel(tower));
  tower.border.setAlpha(state.sp >= PUSH_MAX_SP ? 0.7 + Math.sin(time / 90) * 0.3 : 1);
}

export function resetPushSkill(tower: Tower, state: SkillState) {
  resetTowerSkillCharge("#", state);
  tower.border.setAlpha(1);
}
