import type Phaser from "phaser";
import { enemyFamily, type EnemyFamily } from "../registry/enemies";
import type { Enemy } from "../types";
import type { RegisteredSkillDefinition } from "./skillRegistry";

export interface EnemySkillRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
}

export type EnemySkillDefinition = RegisteredSkillDefinition<Enemy, EnemySkillRuntime>;

export interface EnemySkillActions {
  updateHexHeal: EnemySkillDefinition["update"];
  updateAngelWings: EnemySkillDefinition["update"];
  updateHeartLead: EnemySkillDefinition["update"];
}

export function createEnemySkillRegistry(
  actions: EnemySkillActions
): Partial<Record<EnemyFamily, EnemySkillDefinition[]>> {
  return {
    hexagon: [
      {
        stateKey: "heal",
        update: actions.updateHexHeal
      }
    ],
    angelPentagon: [
      {
        stateKey: "wings",
        update: actions.updateAngelWings
      }
    ],
    heart: [
      {
        stateKey: "lead",
        update: actions.updateHeartLead
      }
    ]
  };
}

export function enemySkillDefinitions(
  registry: Partial<Record<EnemyFamily, EnemySkillDefinition[]>>,
  enemy: Enemy
) {
  return registry[enemyFamily(enemy.kind)] ?? [];
}
