import type { CardId } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { TowerSkillPresentation } from "./towerSkillPresentation";
import type { TowerActionDataEvent as TowerActionEvent } from "./towerActions";
import { TOWER_SKILL_CARD_IDS, TOWER_SKILLS, type TowerSkillCardId, type TowerSkillData } from "../data/towerAbilities";
import type { RegisteredSkillDefinition } from "./skillRegistry";
import { activateOrientation, orientationIsReady, resetOrientation, updateOrientation } from "./orientationSkillRules";
import { activateGathering, gatheringIsReady, resetGathering, updateGathering } from "./gatheringSkillRules";
import { pushIsReady, resetPushSkill, updatePushSkill } from "./pushSkillRules";

export interface TowerSkillActivation {
  x: number;
  y: number;
  allReady: boolean;
}

export interface ManualTowerSkill {
  isReady: (tower: Tower, time: number) => boolean;
  activate?: (towers: Tower[], input: TowerSkillActivation, time: number) => void;
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
  isAirPatrolReady: ManualTowerSkill["isReady"];
  activateAirPatrolTower: (tower: Tower) => void;
}

export function createTowerSkillRegistry(actions: TowerSkillActions, presentation: () => TowerSkillPresentation): Partial<Record<CardId, TowerSkillDefinition>> {
  const behaviors = {
    "#": {
      imitate: actions.imitatePush,
      update: (tower, state, seconds, time) => updatePushSkill(tower, state, seconds, time, presentation()),
      reset: (tower, state) => resetPushSkill(tower, state, presentation()),
      manual: {
        isReady: tower => pushIsReady(tower) && !tower.moveVisual
      }
    },
    j: {
      update: (tower, state, seconds, time) => updateGathering(tower, state, seconds, time, presentation()),
      reset: (tower, state) => resetGathering(tower, state, presentation()),
      manual: {
        isReady: gatheringIsReady,
        activate: ([tower], _input, time) => { if (activateGathering(tower, time, presentation())) actions.onAction?.(tower); }
      }
    },
    o: {
      update: (tower, state, seconds, time) => updateOrientation(tower, state, seconds, time, presentation()),
      reset: (tower, state) => resetOrientation(tower, state, presentation()),
      manual: {
        isReady: orientationIsReady,
        activate: ([tower], _input, time) => { if (activateOrientation(tower, time, presentation())) actions.onAction?.(tower); }
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
        isReady: actions.isSpellMortarReady
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
