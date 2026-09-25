import type { SkillState, Tower } from "../types";
import { TOWER_SKILL_INDICATORS } from "../render/towerSkillIndicators";
import { updatePushSkill as update, resetPushSkill as reset } from "./pushSkillRules";
export { PUSH_MAX_SP, PUSH_DURATION, pushIsReady } from "./pushSkillRules";

export function updatePushSkill(tower: Tower, state: SkillState, seconds: number, time: number) {
  update(tower, state, seconds, time, TOWER_SKILL_INDICATORS);
}
export function resetPushSkill(tower: Tower, state: SkillState) {
  reset(tower, state, TOWER_SKILL_INDICATORS);
}
