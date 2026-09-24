import type Phaser from "phaser";
import { ENEMY_SKILLS, ENEMY_SKILL_IDS, type EnemySkillId } from "../data/enemyAbilities";
import { enemyFamily, type EnemyFamily } from "../registry/enemies";
import type { Enemy } from "../types";
import type { RegisteredSkillDefinition } from "./skillRegistry";

export interface EnemySkillRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
}

export type EnemySkillDefinition = RegisteredSkillDefinition<Enemy, EnemySkillRuntime>;
const EMPTY_ENEMY_SKILL_DEFINITIONS: readonly EnemySkillDefinition[] = [];

export type EnemySkillActions = Record<EnemySkillId, EnemySkillDefinition["update"]>;

export function createEnemySkillRegistry(
  actions: EnemySkillActions
): Partial<Record<EnemyFamily, EnemySkillDefinition[]>> {
  const registry: Partial<Record<EnemyFamily, EnemySkillDefinition[]>> = {};
  for (const id of ENEMY_SKILL_IDS) {
    (registry[ENEMY_SKILLS[id].family] ??= []).push({ stateKey: id, update: actions[id] });
  }
  return registry;
}

export function enemySkillDefinitions(
  registry: Partial<Record<EnemyFamily, EnemySkillDefinition[]>>,
  enemy: Enemy
) {
  return registry[enemyFamily(enemy.kind)] ?? EMPTY_ENEMY_SKILL_DEFINITIONS;
}

export function enemySkillDefinitionsForFamily(
  registry: Partial<Record<EnemyFamily, EnemySkillDefinition[]>>,
  family: EnemyFamily
) {
  return registry[family] ?? EMPTY_ENEMY_SKILL_DEFINITIONS;
}
