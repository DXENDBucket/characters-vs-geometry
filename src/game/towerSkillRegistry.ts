import type { CardId, Tower } from "../types";
import type { RegisteredSkillDefinition } from "./skillRegistry";
import { activateOrientation, orientationIsReady, resetOrientation, updateOrientation } from "./orientation";
import { activateGathering, gatheringIsReady, resetGathering, updateGathering } from "./gathering";
import { pushIsReady, resetPushSkill, updatePushSkill } from "./pushSkill";

export interface TowerSkillActivation {
  x: number;
  y: number;
  allReady: boolean;
}

export interface ManualTowerSkill {
  isReady: (tower: Tower, time: number) => boolean;
  activate: (towers: Tower[], input: TowerSkillActivation, time: number) => void;
  supportsGroup?: boolean;
  requiresTarget?: boolean;
}

export interface TowerSkillDefinition extends RegisteredSkillDefinition<Tower, void> {
  manual?: ManualTowerSkill;
}

export interface TowerSkillActions {
  updateClockTower: TowerSkillDefinition["update"];
  resetClockTower: NonNullable<TowerSkillDefinition["reset"]>;
  updateGuardianTower: TowerSkillDefinition["update"];
  updateSpellMortarTower: TowerSkillDefinition["update"];
  resetSpellMortarTower: NonNullable<TowerSkillDefinition["reset"]>;
  updateAirPatrolTower: TowerSkillDefinition["update"];
  resetAirPatrolTower: NonNullable<TowerSkillDefinition["reset"]>;
  isClockTowerReady: ManualTowerSkill["isReady"];
  activateClockTower: (tower: Tower) => void;
  isSpellMortarReady: ManualTowerSkill["isReady"];
  activateSpellMortars: (towers: Tower[], x: number, y: number) => void;
  isAirPatrolReady: ManualTowerSkill["isReady"];
  activateAirPatrolTower: (tower: Tower) => void;
  beginPush: (tower: Tower) => void;
}

export function createTowerSkillRegistry(actions: TowerSkillActions): Partial<Record<CardId, TowerSkillDefinition>> {
  return {
    "#": {
      stateKey: "push", update: updatePushSkill, reset: resetPushSkill,
      manual: {
        isReady: tower => pushIsReady(tower) && !tower.moveVisual,
        requiresTarget: true,
        activate: ([tower]) => actions.beginPush(tower)
      }
    },
    j: {
      stateKey: "gathering",
      update: updateGathering,
      reset: resetGathering,
      manual: {
        isReady: gatheringIsReady,
        activate: ([tower], _input, time) => { activateGathering(tower, time); }
      }
    },
    o: {
      stateKey: "orientation",
      update: updateOrientation,
      reset: resetOrientation,
      manual: {
        isReady: orientationIsReady,
        activate: ([tower], _input, time) => { activateOrientation(tower, time); }
      }
    },
    c: {
      stateKey: "clock",
      update: actions.updateClockTower,
      reset: actions.resetClockTower,
      manual: {
        isReady: actions.isClockTowerReady,
        supportsGroup: true,
        activate: towers => towers.forEach(actions.activateClockTower)
      }
    },
    h: {
      stateKey: "guardian",
      update: actions.updateGuardianTower
    },
    S: {
      stateKey: "spellMortar",
      update: actions.updateSpellMortarTower,
      reset: actions.resetSpellMortarTower,
      manual: {
        isReady: actions.isSpellMortarReady,
        supportsGroup: true,
        requiresTarget: true,
        activate: (towers, input) => actions.activateSpellMortars(towers, input.x, input.y)
      }
    },
    w: {
      stateKey: "airPatrol",
      update: actions.updateAirPatrolTower,
      reset: actions.resetAirPatrolTower,
      manual: {
        isReady: actions.isAirPatrolReady,
        activate: ([tower]) => actions.activateAirPatrolTower(tower)
      }
    }
  };
}
