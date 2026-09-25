import type Phaser from "phaser";
import type { CardDefinition, CardId, Tower } from "../types";
import type { BattleCardState } from "./battleLoadout";
import type { TowerExtractionPool } from "./towerExtraction";
import { TowerDeploymentSimulation } from "./towerDeploymentRules";
import { createTower } from "./towers";
import { deploymentPresentation } from "../render/towerDeployment";

export interface TowerDeploymentRuntime {
  scene: Phaser.Scene;
  towers: Tower[];
  occupied: Map<string, Tower>;
  cardStates: readonly BattleCardState[];
  battleTime: number;
  unlimitedFirepower: boolean;
  autoUpgradeEnabled: boolean;
  autoUpgradeReserveChars: number;
  getDefinition: (id: CardId) => CardDefinition;
  cardTimeFor: (id: CardId) => number;
  getChars: () => number;
  spendChars: (amount: number) => void;
  nextTowerOrder: () => number;
  resetTowerSkill: (tower: Tower) => void;
  mirrorGroupFor?: (tower: Tower) => Tower[];
  isCellDeployable?: (lane: number, column: number) => boolean;
  updateLevelAuras: () => void;
  updateCards: () => void;
  onFeedback?: (kind: "deploy" | "upgrade") => void;
  extraction: TowerExtractionPool;
}

export class TowerDeploymentController extends TowerDeploymentSimulation<Tower> {
  constructor(live: () => TowerDeploymentRuntime) {
    super(() => runtime, deploymentPresentation(live));
    const runtime: import("./towerDeploymentRules").TowerDeploymentRuntime<Tower> = {
      get towers() { return live().towers; }, get occupied() { return live().occupied; },
      get cardStates() { return live().cardStates; }, get battleTime() { return live().battleTime; },
      get unlimitedFirepower() { return live().unlimitedFirepower; },
      get autoUpgradeEnabled() { return live().autoUpgradeEnabled; },
      get autoUpgradeReserveChars() { return live().autoUpgradeReserveChars; },
      get extraction() { return live().extraction; }, get mirrorGroupFor() { return live().mirrorGroupFor; },
      get isCellDeployable() { return live().isCellDeployable; },
      getDefinition: id => live().getDefinition(id), cardTimeFor: id => live().cardTimeFor(id),
      getChars: () => live().getChars(), spendChars: amount => live().spendChars(amount),
      nextTowerOrder: () => live().nextTowerOrder(), resetTowerSkill: tower => live().resetTowerSkill(tower),
      updateLevelAuras: () => live().updateLevelAuras(),
      createTower: (definition, lane, column, time, order) => createTower(live().scene, definition, lane, column, time, order)
    };
  }
}
