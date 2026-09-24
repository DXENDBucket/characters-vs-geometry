import type { CardId, Tower } from "../types";
import type { TowerActionEvent } from "./towerActions";
import { TOWER_SKILL_CARD_IDS, TOWER_SKILLS, type TowerSkillCardId, type TowerSkillData } from "../data/towerAbilities";
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
  onAction?: (tower: Tower) => boolean | void;
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
  const behaviors = {
    "#": {
      imitate: actions.imitatePush,
      update: updatePushSkill, reset: resetPushSkill,
      manual: {
        isReady: tower => pushIsReady(tower) && !tower.moveVisual,
        activate: ([tower]) => actions.beginPush(tower)
      }
    },
    j: {
      update: updateGathering,
      reset: resetGathering,
      manual: {
        isReady: gatheringIsReady,
        activate: ([tower], _input, time) => { if (activateGathering(tower, time)) actions.onAction?.(tower); }
      }
    },
    o: {
      update: updateOrientation,
      reset: resetOrientation,
      manual: {
        isReady: orientationIsReady,
        activate: ([tower], _input, time) => { if (activateOrientation(tower, time)) actions.onAction?.(tower); }
      }
    },
    c: {
      update: actions.updateClockTower,
      reset: actions.resetClockTower,
      manual: {
        isReady: actions.isClockTowerReady,
        activate: towers => towers.forEach(actions.activateClockTower)
      }
    },
    h: {
      imitate: actions.imitateGuardian,
      update: actions.updateGuardianTower
    },
    S: {
      imitate: actions.imitateSpellMortar,
      update: actions.updateSpellMortarTower,
      reset: actions.resetSpellMortarTower,
      manual: {
        isReady: actions.isSpellMortarReady,
        activate: (towers, input) => actions.activateSpellMortars(towers, input.x, input.y)
      }
    },
    w: {
      update: actions.updateAirPatrolTower,
      reset: actions.resetAirPatrolTower,
      manual: {
        isReady: actions.isAirPatrolReady,
        activate: ([tower]) => actions.activateAirPatrolTower(tower)
      }
    }
  } satisfies Record<TowerSkillCardId, Omit<TowerSkillDefinition, "stateKey" | "maxSp">>;
  const registry: Partial<Record<CardId, TowerSkillDefinition>> = {};
  for (const id of TOWER_SKILL_CARD_IDS) {
    const data: TowerSkillData = TOWER_SKILLS[id];
    const behavior: Omit<TowerSkillDefinition, "stateKey" | "maxSp"> = behaviors[id];
    registry[id] = {
      ...behavior, stateKey: data.stateKey, maxSp: data.maxSp,
      manual: behavior.manual && { ...behavior.manual, supportsGroup: data.supportsGroup, requiresTarget: data.requiresTarget }
    };
  }
  return registry;
}
