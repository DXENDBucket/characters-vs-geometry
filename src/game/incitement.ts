import { INCITEMENT } from "../data/incitement";
import { enemyIsBossCompanion, enemyRank } from "../registry/enemies";
import type { Enemy } from "../types";
import { enemyIsActive } from "./enemyContainers";
import { enemyIgnoresLeaderRestrictedMechanics } from "./enemyBehaviors";
import type { EnemySkillDefinition } from "./enemySkillRegistry";
import { gainSkillSp, isSkillReady, spendSkillSp } from "./skillState";
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
  gainSkillSp(state, seconds * INCITEMENT.regen, INCITEMENT.maxSp);
  if (!isSkillReady(state, INCITEMENT.maxSp)) return;
  const targets = incitementTargets(caster, runtime.enemies);
  if (!targets.length) return;
  spendSkillSp(state, INCITEMENT.cost);
  for (const target of targets) {
    applyStatusEffect(target, "power", INCITEMENT.duration, time, { attackMultiplier: INCITEMENT.attackMultiplier });
    applyStatusEffect(target, "haste", INCITEMENT.duration, time, INCITEMENT.speedMultiplier);
  }
};
