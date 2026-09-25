import { INCITEMENT } from "../data/incitement";
import { ENEMY_SKILLS } from "../data/enemyAbilities";
import { enemyIsBossCompanion, enemyRank } from "../registry/enemies";
import type { EnemyState as Enemy } from "./enemyState";
import { enemyIsActive } from "./enemyContainerRules";
import { enemyIgnoresLeaderRestrictedMechanics } from "./enemyCombatRules";
import type { EnemySkillDefinition } from "./enemySkillRegistry";
import { spendSkillSp } from "./skillState";
import { chargeEnemySkill } from "./enemySkillRules";
import { applyStatusEffect } from "./statusEffects";

export function incitementTargets(caster: Enemy, enemies: readonly Enemy[]) {
  const distance = (enemy: Enemy) => (enemy.x - caster.x) ** 2 + (enemy.y - caster.y) ** 2;
  return enemies.filter(enemy => enemy !== caster && enemyIsActive(enemy) && enemy.hp > 0 &&
    !enemyIgnoresLeaderRestrictedMechanics(enemy) && !enemyIsBossCompanion(enemy.kind))
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, INCITEMENT.targetsPerRank * enemyRank(caster.kind));
}

export const updateIncitement: EnemySkillDefinition["update"] = (caster, state, seconds, time, runtime) => {
  if (!enemyIsActive(caster) || caster.hp <= 0) return;
  if (!chargeEnemySkill("incitement", state, seconds, time)) return;
  const targets = incitementTargets(caster, runtime.enemies);
  if (!targets.length) return;
  spendSkillSp(state, ENEMY_SKILLS.incitement.cost);
  for (const target of targets) {
    applyStatusEffect(target, "power", INCITEMENT.duration, time, { attackMultiplier: INCITEMENT.attackMultiplier });
    applyStatusEffect(target, "haste", INCITEMENT.duration, time, INCITEMENT.speedMultiplier);
  }
};
