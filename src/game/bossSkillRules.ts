import { BOSS_SKILLS, ICOSAHEDRON_PHASE_SKILL_SP, type BossSkillData } from "../data/bossAbilities";
import type { BossKind, BossSkill, BossSkillName, CubeBoss } from "../types";
import { gainSkillSp, isSkillReady, spendSkillSp } from "./skillState";

export function createBossSkill<Name extends BossSkillName>(name: Name, maxSp: number, cost: number, initialSp = 0): BossSkill<Name> {
  return { name, sp: Math.min(maxSp, Math.max(0, initialSp)), spBuffer: 0, activeUntil: 0, maxSp, cost };
}

export function createConfiguredBossSkill<Name extends BossSkillName>(name: Name): BossSkill<Name> {
  const data = BOSS_SKILLS[name];
  return createBossSkill(name, data.maxSp, data.cost, data.initialSp);
}

export function initialBossSkillStates(kind: BossKind): CubeBoss["skills"] {
  const tetrahedron = kind === "tetrahedron" || kind === "tetrahedron2", icosahedron = kind === "icosahedron";
  const dodecahedron = kind === "dodecahedron" || kind === "dodecahedron2";
  // Preserve even the inactive cube skills and insertion order for existing battle snapshots.
  return {
    ...(kind === "del" ? { deleteStack: createConfiguredBossSkill("deleteStack"), deleteFormat: createConfiguredBossSkill("deleteFormat") } : {}),
    promotion: createConfiguredBossSkill("promotion"), advance: createConfiguredBossSkill("advance"),
    ...(tetrahedron || icosahedron ? {
      charge: createConfiguredBossSkill("charge"), impact: createConfiguredBossSkill("impact"),
      suppression: createConfiguredBossSkill("suppression"), desperation: createConfiguredBossSkill("desperation")
    } : {}),
    ...(dodecahedron || icosahedron ? { endlessWings: createConfiguredBossSkill("endlessWings") } : {}),
    ...(icosahedron ? {
      ultimateAdvance: createConfiguredBossSkill("ultimateAdvance"), heartbeatAlpha: createConfiguredBossSkill("heartbeatAlpha"),
      heartbeatBeta: createConfiguredBossSkill("heartbeatBeta"), leap: createConfiguredBossSkill("leap")
    } : {})
  };
}

export function applyBossPhaseSkillState(boss: Pick<CubeBoss, "kind" | "skills">, phaseIndex: number) {
  if (boss.kind !== "icosahedron") return;
  const initial = ICOSAHEDRON_PHASE_SKILL_SP[phaseIndex];
  if (!initial) return;
  for (const name of Object.keys(initial) as BossSkillName[]) {
    const state = boss.skills[name];
    if (!state) continue;
    state.sp = Math.min(state.maxSp, Math.max(0, initial[name]!));
    state.spBuffer = 0;
    state.activeUntil = 0;
  }
}

export function bossSkillCharge(name: BossSkillName, kind?: BossKind, phaseIndex = 0) {
  const skill = BOSS_SKILLS[name];
  return {
    initial: kind === "icosahedron" ? ICOSAHEDRON_PHASE_SKILL_SP[phaseIndex]?.[name] ?? skill.initialSp : skill.initialSp,
    max: skill.maxSp, cost: skill.cost, regen: skill.regen, duration: skill.duration, pause: false
  };
}

export function bossSkillRecoverySeconds(boss: Pick<CubeBoss, "hp" | "maxHp" | "criticalHpTriggered">, skill: BossSkill, seconds: number) {
  const data: BossSkillData = BOSS_SKILLS[skill.name], threshold = data.recoveryHp;
  if (threshold && (threshold.inclusive ? boss.hp > boss.maxHp * threshold.ratio : boss.hp >= boss.maxHp * threshold.ratio)) return 0;
  return seconds * (boss.criticalHpTriggered ? data.criticalRegenMultiplier ?? 1 : 1);
}

export function chargeBossSkill(skill: BossSkill, seconds: number) {
  gainSkillSp(skill, seconds * BOSS_SKILLS[skill.name].regen, skill.maxSp);
}

export function isBossSkillReady(skill: BossSkill) { return isSkillReady(skill, skill.maxSp); }
export function spendBossSkill(skill: BossSkill) { spendSkillSp(skill, skill.cost); }

export function gainBossSkillSp(skill: BossSkill | undefined, amount: number) {
  if (skill) skill.sp = Math.min(skill.maxSp, skill.sp + amount);
}

export function grantBossSkillSp(boss: Pick<CubeBoss, "skills">, source: BossSkillName) {
  const data: BossSkillData = BOSS_SKILLS[source];
  if (data.grantsSp) gainBossSkillSp(boss.skills[data.grantsSp.skill], data.grantsSp.amount);
}
