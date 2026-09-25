import type Phaser from "phaser";
import type { CardDefinition, CardId, Tower } from "../types";
import { createTower } from "./towers";
import { TowerMirrorSimulation } from "./towerMirrorRules";
import { mirrorPresentation } from "../render/towerMirrors";
export { MIRROR_COST_LIMIT } from "./towerMirrorRules";

export interface TowerMirrorRuntime {
  scene: Phaser.Scene;
  towers: Tower[];
  occupied: Map<string, Tower>;
  battleTime: number;
  getDefinition: (id: CardId) => CardDefinition;
  nextTowerOrder: () => number;
  isCellDeployable?: (lane: number, column: number) => boolean;
  createTargetedEffectMirror?: (source: Tower, target: Tower) => Tower | null;
  updateLevelAuras: () => void;
}

export interface TowerMirrorShiftMove {
  tower: Tower;
  fromLane: number;
  fromColumn: number;
  toLane: number;
  toColumn: number;
}

export class TowerMirrorController extends TowerMirrorSimulation<Tower> {
  constructor(live: () => TowerMirrorRuntime) {
    super(() => runtime, mirrorPresentation(live));
    const runtime: import("./towerMirrorRules").TowerMirrorRuntime<Tower> = {
      get towers() { return live().towers; }, get occupied() { return live().occupied; },
      get battleTime() { return live().battleTime; },
      get isCellDeployable() { return live().isCellDeployable; },
      get createTargetedEffectMirror() { return live().createTargetedEffectMirror; },
      getDefinition: id => live().getDefinition(id), nextTowerOrder: () => live().nextTowerOrder(),
      updateLevelAuras: () => live().updateLevelAuras(),
      createTower: (definition, lane, column, time, order) => createTower(live().scene, definition, lane, column, time, order)
    };
  }
}
