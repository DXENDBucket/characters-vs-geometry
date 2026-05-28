import type { CardId, Tower } from "../types";
import type { RegisteredSkillDefinition } from "./skillRegistry";

export type TowerSkillDefinition = RegisteredSkillDefinition<Tower, void>;

export interface TowerSkillActions {
  updateClockTower: TowerSkillDefinition["update"];
  resetClockTower: NonNullable<TowerSkillDefinition["reset"]>;
  updateGuardianTower: TowerSkillDefinition["update"];
  updateSpellMortarTower: TowerSkillDefinition["update"];
  resetSpellMortarTower: NonNullable<TowerSkillDefinition["reset"]>;
  updateAirPatrolTower: TowerSkillDefinition["update"];
  resetAirPatrolTower: NonNullable<TowerSkillDefinition["reset"]>;
}

export function createTowerSkillRegistry(actions: TowerSkillActions): Partial<Record<CardId, TowerSkillDefinition>> {
  return {
    c: {
      stateKey: "clock",
      update: actions.updateClockTower,
      reset: actions.resetClockTower
    },
    h: {
      stateKey: "guardian",
      update: actions.updateGuardianTower
    },
    S: {
      stateKey: "spellMortar",
      update: actions.updateSpellMortarTower,
      reset: actions.resetSpellMortarTower
    },
    w: {
      stateKey: "airPatrol",
      update: actions.updateAirPatrolTower,
      reset: actions.resetAirPatrolTower
    }
  };
}
