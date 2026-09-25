import type { SkillState, Tower } from "../types";
import { TOWER_SKILL_INDICATORS } from "../render/towerSkillIndicators";
import { activateOrientation as activate, updateOrientation as update, resetOrientation as reset } from "./orientationSkillRules";
export { ORIENTATION_MAX_SP, ORIENTATION_DURATION, orientationIsReady } from "./orientationSkillRules";
export { redirectOrientedTarget } from "./orientationRules";

export function activateOrientation(tower: Tower, time: number) {
  return activate(tower, time, TOWER_SKILL_INDICATORS);
}
export function updateOrientation(tower: Tower, state: SkillState, seconds: number, time: number) {
  update(tower, state, seconds, time, TOWER_SKILL_INDICATORS);
}
export function resetOrientation(tower: Tower, state: SkillState) {
  reset(tower, state, TOWER_SKILL_INDICATORS);
}
