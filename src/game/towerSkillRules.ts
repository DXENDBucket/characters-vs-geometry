import { TOWER_SKILLS, towerSkillData, type TowerSkillData, type TowerSkillCardId } from "../data/towerAbilities";
import type { CardId, SkillState } from "../types";
import { gainSkillSp, resetSkillCharge, spendSkillSp } from "./skillState";

export function towerSkillCharge(skill: TowerSkillData, level: number) {
  return {
    initial: skill.initialSp, max: skill.maxSp, cost: skill.cost,
    regen: skill.regen + Math.max(0, level - 1) * (skill.regenPerLevel ?? 0),
    duration: skill.duration, pause: skill.pauseWhileActive
  };
}

export function initialTowerSkillStates(id: CardId): Record<string, SkillState> {
  const skill = towerSkillData(id);
  // Zero-SP skills stay lazy to preserve snapshot layout and replay checksums.
  return skill?.initialSp ? { [skill.stateKey]: { sp: skill.initialSp, spBuffer: 0, activeUntil: 0 } } : {};
}

export function towerSkillIsReady(id: TowerSkillCardId, state: SkillState, time: number) {
  const skill = TOWER_SKILLS[id];
  return (!skill.pauseWhileActive || time >= state.activeUntil) && state.sp >= skill.maxSp;
}

export function chargeTowerSkill(id: TowerSkillCardId, state: SkillState, seconds: number, time: number, level = 1) {
  const skill: TowerSkillData = TOWER_SKILLS[id];
  if (skill.pauseWhileActive && time < state.activeUntil) return;
  // o/j historically charge only the inactive portion of a boundary tick; others charge a whole tick.
  const elapsed = skill.recovery === "elapsed" ? Math.min(seconds, Math.max(0, (time - state.activeUntil) / 1000)) : seconds;
  gainSkillSp(state, elapsed * (skill.regen + Math.max(0, level - 1) * (skill.regenPerLevel ?? 0)), skill.maxSp);
}

export function spendTowerSkill(id: TowerSkillCardId, state: SkillState) {
  spendSkillSp(state, TOWER_SKILLS[id].cost);
}

export function resetTowerSkillCharge(id: TowerSkillCardId, state: SkillState) {
  const reset = TOWER_SKILLS[id].resetOnUpgrade;
  if (reset === "none") return;
  resetSkillCharge(state);
  if (reset === "chargeAndActive") state.activeUntil = 0;
}
