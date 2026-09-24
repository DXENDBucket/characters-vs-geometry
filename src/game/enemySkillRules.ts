import { ENEMY_SKILLS, ENEMY_SKILL_IDS, type EnemySkillData, type EnemySkillId } from "../data/enemyAbilities";
import { enemyFamily, enemyRank } from "../registry/enemies";
import type { EnemyKind, SkillState } from "../types";
import { gainSkillSp, isSkillReady } from "./skillState";

export function enemySkillCharge(skill: EnemySkillData, rank: number) {
  const extraRanks = Math.max(0, rank - 1);
  return {
    initial: Math.min(skill.maxSp, skill.initialSp + extraRanks * (skill.initialSpPerRank ?? 0)),
    max: skill.maxSp,
    cost: skill.cost,
    regen: skill.regen * (1 + extraRanks * (skill.regenPerRank ?? 0)),
    duration: skill.duration,
    pause: skill.pauseWhileActive
  };
}

export function initialEnemySkillStates(kind: EnemyKind): Record<string, SkillState> {
  const family = enemyFamily(kind), rank = enemyRank(kind);
  const states: Record<string, SkillState> = {};
  for (const id of ENEMY_SKILL_IDS) {
    const skill: EnemySkillData = ENEMY_SKILLS[id];
    if (skill.family !== family) continue;
    const charge = enemySkillCharge(skill, rank);
    const regenMultiplier = 1 + Math.max(0, rank - 1) * (skill.regenPerRank ?? 0);
    // Keep default states lazy, including in old snapshots and replay checksums.
    if (charge.initial === 0 && regenMultiplier === 1) continue;
    states[id] = { sp: charge.initial, spBuffer: 0, activeUntil: 0 };
    if (regenMultiplier !== 1) states[id].regenMultiplier = regenMultiplier;
  }
  return states;
}

export function chargeEnemySkill(id: EnemySkillId, state: SkillState, seconds: number, time: number) {
  const skill = ENEMY_SKILLS[id];
  if (skill.pauseWhileActive && time < state.activeUntil) return false;
  gainSkillSp(state, seconds * skill.regen * (state.regenMultiplier ?? 1), skill.maxSp);
  return isSkillReady(state, skill.maxSp);
}
