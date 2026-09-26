import * as battleMath from "./battleMath";
import { ENEMY_SKILLS } from "../data/enemyAbilities";
import { enemyFamily, enemyIsBossCompanion, enemyRank } from "../registry/enemies";
import { enemyIsActive } from "./enemyContainerRules";
import { enemyIgnoresLeaderRestrictedMechanics } from "./enemyCombatRules";
import { changeEnemyHealth } from "./enemyHealth";
import { chargeEnemySkill } from "./enemySkillRules";
import { spendSkillSp } from "./skillState";
import type { EnemyState } from "./enemyState";
import type { EnemySkillDefinition } from "./enemySkillRegistry";

export function supportCommandTargets(caster: EnemyState, enemies: readonly EnemyState[]) {
  const distance = (enemy: EnemyState) => battleMath.square(enemy.x - caster.x) + battleMath.square(enemy.y - caster.y);
  return enemies.filter(enemy => enemy !== caster && enemyIsActive(enemy) && enemy.hp > 0 &&
    enemyFamily(enemy.kind) !== "plus" && !enemyIgnoresLeaderRestrictedMechanics(enemy) && !enemyIsBossCompanion(enemy.kind))
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, enemyRank(caster.kind) + 1);
}

export const updateSupportCommand: EnemySkillDefinition["update"] = (caster, state, seconds, time, runtime) => {
  if (!enemyIsActive(caster) || caster.hp <= 0) return;
  if (!chargeEnemySkill("support", state, seconds, time)) return;
  const targets = supportCommandTargets(caster, runtime.enemies);
  if (!targets.length) return;
  spendSkillSp(state, ENEMY_SKILLS.support.cost);
  // Snapshot before healing: a target may share a health pool with the caster.
  const amount = caster.hp * ENEMY_SKILLS.support.healRatio;
  for (const target of targets) {
    if (changeEnemyHealth(target, amount) <= 0) continue;
    for (const member of target.healthPool?.members ?? [target]) runtime.presentation.scale(member);
    runtime.presentation.supportWave(caster.x, caster.y, target.x, target.y);
    runtime.presentation.heal(target.x, target.y);
  }
};
