import type { CardId, Tower } from "../types";
import type { TowerActionEvent } from "./towerActions";
import { CLOCK_TOWER_SKILL_MAX } from "../config";
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
  maxSp?: number;
  imitate?: (tower: Tower, event: Extract<TowerActionEvent, { kind: "skill" }>) => void;
  manual?: ManualTowerSkill;
}

export interface TowerSkillActions {
  onAction?: (tower: Tower) => void;
  imitatePush: NonNullable<TowerSkillDefinition["imitate"]>;
  imitateSpellMortar: NonNullable<TowerSkillDefinition["imitate"]>;
  imitateGuardian: NonNullable<TowerSkillDefinition["imitate"]>;
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
      imitate: actions.imitatePush,
      stateKey: "push", update: updatePushSkill, reset: resetPushSkill,
      manual: {
        isReady: tower => pushIsReady(tower) && !tower.moveVisual,
        requiresTarget: true,
        activate: ([tower]) => actions.beginPush(tower)
      }
    },
    j: {
      maxSp: 10,
      stateKey: "gathering",
      update: updateGathering,
      reset: resetGathering,
      manual: {
        isReady: gatheringIsReady,
        activate: ([tower], _input, time) => { if (activateGathering(tower, time)) actions.onAction?.(tower); }
      }
    },
    o: {
      maxSp: 10,
      stateKey: "orientation",
      update: updateOrientation,
      reset: resetOrientation,
      manual: {
        isReady: orientationIsReady,
        activate: ([tower], _input, time) => { if (activateOrientation(tower, time)) actions.onAction?.(tower); }
      }
    },
    c: {
      maxSp: CLOCK_TOWER_SKILL_MAX,
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
      imitate: actions.imitateGuardian,
      stateKey: "guardian",
      update: actions.updateGuardianTower
    },
    S: {
      imitate: actions.imitateSpellMortar,
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
      maxSp: 10,
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
