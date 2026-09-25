import type { EnemyKind } from "../types";
import type { EnemyState } from "./enemyState";
import type { BossState } from "./bossState";
import { enemyMaximumHp } from "./enemyContainerRules";
import { cubePromotionKind } from "../bosses/bossRanks";
import { enemyFamily, enemyIsMace, enemyRank, getEnemyDefinition } from "../registry/enemies";
import { enemyAttackSpeed, enemyIsHighFlying, randomizedEnemySpeed } from "./enemyCombatRules";
import { initialEnemySkillStates } from "./enemySkillRules";
import { applyEnemyBaseStats, enemyBaseStatsFromDefinition } from "./unitStatRules";

export function findPromotionTargets<T extends EnemyState>(boss: Pick<BossState, "x" | "y">, enemies: readonly T[], maxRank: number, count: number) {
  if (count <= 0) {
    return [];
  }

  const targets: T[] = [];
  const distances: number[] = [];
  for (const enemy of enemies) {
    if (!enemy.inPlay || enemyIsHighFlying(enemy) || !cubePromotionKind(enemy.kind, maxRank)) {
      continue;
    }

    const dx = enemy.x - boss.x;
    const dy = enemy.y - boss.y;
    const distance = dx * dx + dy * dy;
    let insertAt = targets.length;
    const rank = enemyRank(enemy.kind);
    while (insertAt > 0 && (rank > enemyRank(targets[insertAt - 1].kind) ||
      (rank === enemyRank(targets[insertAt - 1].kind) && distance < distances[insertAt - 1]))) {
      insertAt -= 1;
    }

    if (insertAt >= count) {
      continue;
    }

    targets.splice(insertAt, 0, enemy);
    distances.splice(insertAt, 0, distance);
    if (targets.length > count) {
      targets.pop();
      distances.pop();
    }
  }
  return targets;
}

export function applyEnemyPromotion(enemy: EnemyState, kind: EnemyKind, battleTime: number, random: () => number) {
  const hpRatio = Math.max(0, Math.min(1, enemy.hp / enemyMaximumHp(enemy)));
  const definition = getEnemyDefinition(kind);
  const baseStats = enemyBaseStatsFromDefinition(definition, {
    speed: randomizedEnemySpeed(kind, random),
    attackSpeed: enemyAttackSpeed(kind),
    finalDamageReduction: enemy.baseStats.finalDamageReduction
  });
  enemy.kind = kind;
  applyEnemyBaseStats(enemy, baseStats, { hpRatio });
  enemy.attackAt = Math.min(enemy.attackAt, battleTime + enemy.baseStats.attackInterval);
  enemy.maceVelocity = enemyIsMace(kind) ? 0 : undefined;
  enemy.maceFacingDirection = enemyIsMace(kind) ? -1 : undefined;
  enemy.slopeFacingDirection = enemyFamily(kind) === "slopeTriangle" ? enemy.movementDirection ?? -1 : undefined;
  enemy.highFlightStartedAt = undefined;
  enemy.highFlightUntil = undefined;
  enemy.highFlightStartX = undefined;
  enemy.highFlightStartY = undefined;
  enemy.highFlightTargetX = undefined;
  enemy.highFlightTargetY = undefined;
  enemy.highFlightPeakHeight = undefined;
  enemy.angelRamWingsTriggered = false;
  enemy.skills = initialEnemySkillStates(kind);
}
