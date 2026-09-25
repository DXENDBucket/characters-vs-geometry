import * as battleMath from "./battleMath";
import type { SkillState } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { TowerSkillPresentation } from "./towerSkillPresentation";
import { getTowerSkillState } from "./skillState";
import { TOWER_SKILLS } from "../data/towerAbilities";
import { chargeTowerSkill, resetTowerSkillCharge, towerSkillIsReady } from "./towerSkillRules";
import { effectiveTowerLevel } from "./towerRules";
import { towerBehaviorType } from "./towerIdentity";

export const PUSH_MAX_SP = TOWER_SKILLS["#"].maxSp;
export const PUSH_DURATION = TOWER_SKILLS["#"].duration;

export function pushIsReady(tower: Tower) {
  return tower.inPlay && !tower.transient && towerBehaviorType(tower) === "#" && towerSkillIsReady("#", getTowerSkillState(tower, "push"), 0);
}

export function updatePushSkill(tower: Tower, state: SkillState, seconds: number, time: number, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  chargeTowerSkill("#", state, seconds, time, effectiveTowerLevel(tower));
  presentation.borderAlpha(tower, state.sp >= PUSH_MAX_SP ? 0.7 + battleMath.sin(time / 90) * 0.3 : 1);
}

export function resetPushSkill(tower: Tower, state: SkillState, presentation: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha">) {
  resetTowerSkillCharge("#", state);
  presentation.borderAlpha(tower, 1);
}
