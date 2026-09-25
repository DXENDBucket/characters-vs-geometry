import type { CardId, TowerFinalStats } from "../types";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";
import { getCardDefinition } from "../registry/cardDefinitions";
import { getEnemyDefinition } from "../registry/enemies";
import { towerFormType } from "./towerIdentity";
import { upgradedAttackMultiplier } from "./upgrades";

const legacyAttackPower: Partial<Record<CardId, number>> = {
  x: 200, e: 90, g: 90, F: 1400, l: 15000, r: 200, G: 15000,
  K: 1800, S: 5000, V: 1700
};

// Old panels already included upgrade damage. Strip it before applying the new coefficients.
export function migrateAttackStats(version: number | undefined, towers: TowerState[], enemies: EnemyState[]) {
  if ((version ?? 1) >= 4) return;
  const migrated = new Set<TowerFinalStats>();
  const migratePanel = (type: CardId, level: number, stats: TowerFinalStats) => {
    if (migrated.has(stats)) return;
    migrated.add(stats);
    const attackPower = getCardDefinition(type).attackPower;
    const previous = legacyAttackPower[type] ?? attackPower;
    stats.attackPower = previous > 0
      ? stats.attackPower * attackPower / previous / upgradedAttackMultiplier(type, 1, level) : 0;
  };
  for (const tower of towers) {
    const type = towerFormType(tower);
    migratePanel(type, Math.max(1, tower.level + tower.levelBonus + tower.mirrorLevelBonus), tower.finalStats);
    tower.baseStats.attackPower = getCardDefinition(type).attackPower;
    const shots = [...tower.projectileBank?.shots ?? [], ...tower.projectileNode?.input ?? [],
      ...tower.projectileNode?.output ?? [], ...tower.projectileNode?.processing?.shots ?? []];
    for (const shot of shots) {
      if (shot.action) migratePanel(shot.action.type, shot.action.level, shot.action.stats);
    }
    for (const [skillType, context] of Object.entries(tower.pipelineSkillContexts ?? {})) {
      if (context) migratePanel(skillType as CardId, context.level, context.stats);
    }
  }
  for (const enemy of enemies) {
    const attackPower = getEnemyDefinition(enemy.kind).attackPower;
    const multiplier = attackPower > 0 ? enemy.baseStats.damage / attackPower : 1;
    enemy.baseStats.attackPower = attackPower;
    enemy.baseStats.attackMultiplier = multiplier;
    enemy.finalStats.attackMultiplier = multiplier;
    enemy.finalStats.attackPower = multiplier > 0 ? enemy.finalStats.damage / multiplier : 0;
  }
}
