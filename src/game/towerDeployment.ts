import Phaser from "phaser";
import { LANES } from "../config";
import { makeAutoUpgradePulse } from "../render/combatEffects";
import type { CardDefinition, CardId, CardState, Tower } from "../types";
import { gridCellKey } from "./targeting";
import {
  applyTowerUpgradeStats,
  createTower,
  findAutoUpgradeTarget,
  isCardReadyForAutoUpgrade,
  syncTowerAutoUpgradeVisual,
  upgradeTowerLevel
} from "./towers";

export interface TowerDeploymentRuntime {
  scene: Phaser.Scene;
  towers: Tower[];
  occupied: Map<string, Tower>;
  cardStates: CardState[];
  battleTime: number;
  unlimitedFirepower: boolean;
  autoUpgradeEnabled: boolean;
  autoUpgradeReserveChars: number;
  autoUpgradeReserveInputFocused: boolean;
  getDefinition: (id: CardId) => CardDefinition;
  cardTimeFor: (id: CardId) => number;
  getChars: () => number;
  spendChars: (amount: number) => void;
  nextTowerOrder: () => number;
  resetTowerSkill: (tower: Tower) => void;
  updateLevelAuras: () => void;
  updateCards: () => void;
}

export class TowerDeploymentController {
  constructor(private readonly runtime: () => TowerDeploymentRuntime) {}

  deploy(definition: CardDefinition, lane: number, column: number) {
    return this.runtime().unlimitedFirepower
      ? this.deployColumn(definition, column)
      : this.deploySingle(definition, lane, column);
  }

  attemptAutoUpgrades() {
    const runtime = this.runtime();
    if (
      !runtime.autoUpgradeEnabled ||
      runtime.autoUpgradeReserveInputFocused ||
      runtime.getChars() <= runtime.autoUpgradeReserveChars
    ) {
      return;
    }

    let upgraded = false;
    for (const cardState of runtime.cardStates) {
      if (runtime.getChars() <= runtime.autoUpgradeReserveChars) {
        break;
      }

      if (!isCardReadyForAutoUpgrade(cardState, runtime.cardTimeFor(cardState.definition.id))) {
        continue;
      }

      const target = findAutoUpgradeTarget(runtime.towers, cardState.definition.id);
      if (!target || !this.canSpendForAutoUpgrade(cardState.definition.cost)) {
        continue;
      }

      runtime.spendChars(cardState.definition.cost);
      if (runtime.unlimitedFirepower) {
        this.deployColumn(cardState.definition, target.column);
      } else {
        this.upgradeTower(target);
      }
      makeAutoUpgradePulse(runtime.scene, target.x, target.y);
      cardState.readyAt = runtime.cardTimeFor(cardState.definition.id) + cardState.definition.cooldown;
      upgraded = true;
    }

    if (upgraded) {
      runtime.updateCards();
    }
  }

  syncAutoUpgradeBorders() {
    const runtime = this.runtime();
    runtime.towers.forEach((tower) => syncTowerAutoUpgradeVisual(tower, runtime.autoUpgradeEnabled));
  }

  private deploySingle(definition: CardDefinition, lane: number, column: number) {
    const runtime = this.runtime();
    const existingTower = runtime.occupied.get(gridCellKey(lane, column));
    if (existingTower) {
      if (existingTower.type !== definition.id) {
        return false;
      }

      this.upgradeTower(existingTower);
      return true;
    }

    this.placeTower(definition, lane, column);
    return true;
  }

  private deployColumn(definition: CardDefinition, column: number) {
    const runtime = this.runtime();
    let deployed = false;
    for (let lane = 0; lane < LANES; lane += 1) {
      const existingTower = runtime.occupied.get(gridCellKey(lane, column));
      if (existingTower) {
        if (existingTower.type === definition.id) {
          this.upgradeTower(existingTower);
          deployed = true;
        }
        continue;
      }

      this.placeTower(definition, lane, column);
      deployed = true;
    }

    return deployed;
  }

  private placeTower(definition: CardDefinition, lane: number, column: number) {
    const runtime = this.runtime();
    const tower = createTower(
      runtime.scene,
      definition,
      lane,
      column,
      runtime.battleTime,
      runtime.nextTowerOrder()
    );

    runtime.towers.push(tower);
    runtime.occupied.set(gridCellKey(lane, column), tower);
    runtime.updateLevelAuras();
  }

  private upgradeTower(tower: Tower) {
    const runtime = this.runtime();
    const definition = runtime.getDefinition(tower.type);
    const gainedEffectiveUpgrades = upgradeTowerLevel(tower);
    applyTowerUpgradeStats(tower, definition, gainedEffectiveUpgrades, runtime.battleTime);
    runtime.resetTowerSkill(tower);
    runtime.updateLevelAuras();
    runtime.scene.tweens.add({
      targets: tower.body,
      scale: 1.08,
      yoyo: true,
      duration: 90,
      ease: "Quad.easeOut"
    });
  }

  private canSpendForAutoUpgrade(cost: number) {
    const runtime = this.runtime();
    return runtime.getChars() - cost >= runtime.autoUpgradeReserveChars;
  }
}
