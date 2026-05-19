import type { Enemy, SkillState, Tower } from "../types";

interface SkillBearer {
  skills: Record<string, SkillState>;
}

export function createSkillState(): SkillState {
  return {
    sp: 0,
    spBuffer: 0,
    activeUntil: 0
  };
}

export function getSkillState(unit: SkillBearer, skillId: string) {
  unit.skills[skillId] ??= createSkillState();
  return unit.skills[skillId];
}

export function getTowerSkillState(tower: Tower, skillId: string) {
  return getSkillState(tower, skillId);
}

export function getEnemySkillState(enemy: Enemy, skillId: string) {
  return getSkillState(enemy, skillId);
}

export function gainSkillSp(state: SkillState, seconds: number, maxSp: number) {
  state.spBuffer += seconds;
  while (state.spBuffer >= 1 && state.sp < maxSp) {
    state.sp += 1;
    state.spBuffer -= 1;
  }
  if (state.sp >= maxSp) {
    state.sp = maxSp;
    state.spBuffer = 0;
  }
}

export function resetSkillCharge(state: SkillState) {
  state.sp = 0;
  state.spBuffer = 0;
}

export function isSkillReady(state: SkillState, maxSp: number) {
  return state.sp >= maxSp;
}

export function spendSkillSp(state: SkillState, cost: number) {
  state.sp = Math.max(0, state.sp - cost);
  state.spBuffer = 0;
}
