import type { SkillState, Tower } from "../types";
import { TOWER_SKILL_INDICATORS } from "../render/towerSkillIndicators";
import { activateGathering as activate, updateGathering as update, resetGathering as reset } from "./gatheringSkillRules";
export { GATHERING_MAX_SP, GATHERING_DURATION, gatheringIsReady } from "./gatheringSkillRules";
export { GATHERING_TRANSFER_INTERVAL, gatheringIsActive, gatherProjectile } from "./gatheringRules";

export function activateGathering(tower: Tower, time: number) {
  return activate(tower, time, TOWER_SKILL_INDICATORS);
}
export function updateGathering(tower: Tower, state: SkillState, seconds: number, time: number) {
  update(tower, state, seconds, time, TOWER_SKILL_INDICATORS);
}
export function resetGathering(tower: Tower, state: SkillState) {
  reset(tower, state, TOWER_SKILL_INDICATORS);
}
