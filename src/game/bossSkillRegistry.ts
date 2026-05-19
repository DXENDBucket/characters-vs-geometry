import { chargeBossSkill, isBossSkillReady, spendBossSkill } from "../bosses/cubeBoss";
import type { BossSkill, BossSkillName, CubeBoss } from "../types";

export interface BossSkillDefinition<Runtime, Name extends BossSkillName = BossSkillName> {
  skillKey: Name;
  chargeSeconds?: (runtime: Runtime, boss: CubeBoss, skill: BossSkill<Name>, seconds: number) => number;
  canUse?: (runtime: Runtime, boss: CubeBoss, skill: BossSkill<Name>) => boolean;
  use: (runtime: Runtime, boss: CubeBoss, skill: BossSkill<Name>) => void;
}

export interface BossSkillRegistry<Runtime> {
  cube: readonly BossSkillDefinition<Runtime>[];
  tetrahedron: readonly BossSkillDefinition<Runtime>[];
}

export function createBossSkillRegistry<Runtime>(registry: BossSkillRegistry<Runtime>) {
  return registry;
}

export function runRegisteredBossSkills<Runtime>(
  runtime: Runtime,
  boss: CubeBoss,
  definitions: readonly BossSkillDefinition<Runtime>[],
  seconds: number
) {
  const readySkills: Array<{ definition: BossSkillDefinition<Runtime>; skill: BossSkill }> = [];

  for (const definition of definitions) {
    const skill = getBossSkill(boss, definition.skillKey);
    if (!skill) {
      continue;
    }

    const chargeSeconds = definition.chargeSeconds?.(runtime, boss, skill, seconds) ?? seconds;
    if (chargeSeconds > 0) {
      chargeBossSkill(skill, chargeSeconds);
    }
  }

  for (const definition of definitions) {
    const skill = getBossSkill(boss, definition.skillKey);
    if (!skill || !isBossSkillReady(skill) || definition.canUse?.(runtime, boss, skill) === false) {
      continue;
    }
    readySkills.push({ definition, skill });
  }

  for (const { skill } of readySkills) {
    spendBossSkill(skill);
  }

  for (const { definition, skill } of readySkills) {
    definition.use(runtime, boss, skill);
  }
}

function getBossSkill(boss: CubeBoss, skillKey: BossSkillName) {
  return boss.skills[skillKey as keyof CubeBoss["skills"]] as BossSkill | undefined;
}
