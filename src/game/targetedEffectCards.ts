import type Phaser from "phaser";
import type { CardDefinition, CardId, Tower } from "../types";
import type { BattleCardState } from "./battleLoadout";
import type { TowerExtractionPool } from "./towerExtraction";
import type { ScheduleBattleAction } from "./battleActions";
import type { TowerActionListener, TowerActionEvent } from "./towerActions";
import { TargetedEffectSimulation, type TargetedEffectRuntime } from "./targetedEffectRules";
import { createTower } from "./towers";
import { targetedEffectPresentation } from "../render/targetedEffects";
export { isTargetedEffectCardId } from "./targetedEffectRules";
export type { TargetedEffectCardResult } from "./targetedEffectRules";

export interface TargetedEffectCardRuntime {
  onTowerAction?: TowerActionListener;
  scheduleBattleAction: ScheduleBattleAction;
  scene: Phaser.Scene;
  towers: Tower[];
  cardStates: readonly BattleCardState[];
  battleTime: number;
  unlimitedFirepower?: boolean;
  getDefinition: (id: CardId) => CardDefinition;
  cardTimeFor: (id: CardId) => number;
  getChars: () => number;
  spendChars: (amount: number) => void;
  nextTowerOrder: () => number;
  removeTower: (tower: Tower) => void;
  runMirrorGroupEvent?: (tower: Tower, action: (tower: Tower) => void) => void;
  updateLevelAuras: () => void;
  updateCards: () => void;
  extraction: TowerExtractionPool;
}
export class TargetedEffectCardController extends TargetedEffectSimulation<Tower> {
  constructor(live: () => TargetedEffectCardRuntime) {
    super(() => runtime, targetedEffectPresentation(live));
    const runtime: TargetedEffectRuntime<Tower> = {
      get towers() { return live().towers; }, get cardStates() { return live().cardStates; },
      get battleTime() { return live().battleTime; }, get unlimitedFirepower() { return live().unlimitedFirepower; },
      get extraction() { return live().extraction; }, get runMirrorGroupEvent() { return live().runMirrorGroupEvent; },
      onTowerAction: (tower, event) => live().onTowerAction?.(tower as Tower, event as TowerActionEvent),
      scheduleBattleAction: (delay, action) => live().scheduleBattleAction(delay, action),
      getDefinition: id => live().getDefinition(id), cardTimeFor: id => live().cardTimeFor(id),
      getChars: () => live().getChars(), spendChars: amount => live().spendChars(amount),
      nextTowerOrder: () => live().nextTowerOrder(), removeTower: tower => live().removeTower(tower),
      updateLevelAuras: () => live().updateLevelAuras(),
      createTower: (definition, lane, column, time, order, options) => createTower(live().scene, definition, lane, column, time, order, options)
    };
  }
}
