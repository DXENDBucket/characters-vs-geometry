import Phaser from "phaser";
import { LANES } from "../config";
import { makeAutoUpgradePulse } from "../render/combatEffects";
import type { CardDefinition, CardId, CardState, Tower } from "../types";
import type { TowerExtractionPool } from "./towerExtraction";
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
  mirrorGroupFor?: (tower: Tower) => Tower[];
  isCellDeployable?: (lane: number, column: number) => boolean;
  updateLevelAuras: () => void;
  updateCards: () => void;
  extraction: TowerExtractionPool;
}

export class TowerDeploymentController {
  private readonly upgradedGroupsBuffer = new Set<string>();

  constructor(private readonly runtime: () => TowerDeploymentRuntime) {}

  useCard(definition: CardDefinition, lane: number, column: number): "deployed" | "occupied" | "cooldown" | "noChars" {
    const runtime = this.runtime();
    const card = runtime.cardStates.find((state) => state.definition.id === definition.id);
    if (!card || runtime.cardTimeFor(definition.id) < card.readyAt) return "cooldown";
    const batch = runtime.extraction.plan(definition);
    if (runtime.getChars() < batch.cost) return "noChars";
    if (!this.deploy(definition, lane, column, batch.levels)) return "occupied";
    runtime.spendChars(batch.cost);
    runtime.extraction.consume(batch);
    card.readyAt = runtime.cardTimeFor(definition.id) + definition.cooldown;
    runtime.updateCards();
    return "deployed";
  }

  private deploy(definition: CardDefinition, lane: number, column: number, levels: number) {
    return this.runtime().unlimitedFirepower
      ? this.deployColumn(definition, column, levels)
      : this.deploySingle(definition, lane, column, levels);
  }

  attemptAutoUpgrades() {
    const runtime = this.runtime();
    let availableChars = runtime.getChars();
    if (
      !runtime.autoUpgradeEnabled ||
      runtime.autoUpgradeReserveInputFocused ||
      availableChars <= runtime.autoUpgradeReserveChars
    ) {
      return;
    }

    let upgraded = false;
    for (const cardState of runtime.cardStates) {
      if (availableChars <= runtime.autoUpgradeReserveChars) {
        break;
      }

      if (!isCardReadyForAutoUpgrade(cardState, runtime.cardTimeFor(cardState.definition.id))) {
        continue;
      }

      const target = findAutoUpgradeTarget(runtime.towers, cardState.definition.id);
      const batch = runtime.extraction.plan(cardState.definition);
      if (!target || availableChars - batch.cost < runtime.autoUpgradeReserveChars) {
        continue;
      }

      if (this.useCard(cardState.definition, target.lane, target.column) !== "deployed") continue;
      availableChars = runtime.getChars();
      makeAutoUpgradePulse(runtime.scene, target.x, target.y);
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

  private deploySingle(definition: CardDefinition, lane: number, column: number, levels: number) {
    const runtime = this.runtime();
    const key = gridCellKey(lane, column);
    const existingTower = runtime.occupied.get(key);
    if (existingTower) {
      if (existingTower.type !== definition.id) {
        return false;
      }

      this.upgradeTower(existingTower, levels);
      return true;
    }

    if (!this.isCellDeployable(lane, column)) {
      return false;
    }

    this.placeTower(definition, lane, column, levels);
    return true;
  }

  private deployColumn(definition: CardDefinition, column: number, levels: number) {
    const runtime = this.runtime();
    let deployed = false;
    const upgradedGroups = this.upgradedGroupsBuffer;
    upgradedGroups.clear();
    try {
      for (let lane = 0; lane < LANES; lane += 1) {
        const existingTower = runtime.occupied.get(gridCellKey(lane, column));
        if (existingTower) {
          if (existingTower.type === definition.id) {
            const groupKey = this.upgradeGroupKey(existingTower);
            if (!upgradedGroups.has(groupKey)) {
              upgradedGroups.add(groupKey);
              this.upgradeTower(existingTower, levels);
            }
            deployed = true;
          }
          continue;
        }

        if (!this.isCellDeployable(lane, column)) {
          continue;
        }

        this.placeTower(definition, lane, column, levels);
        deployed = true;
      }
    } finally {
      upgradedGroups.clear();
    }

    return deployed;
  }

  private placeTower(definition: CardDefinition, lane: number, column: number, levels: number) {
    const runtime = this.runtime();
    const tower = createTower(
      runtime.scene,
      definition,
      lane,
      column,
      runtime.battleTime,
      runtime.nextTowerOrder()
    );

    if (levels > 1) {
      const gainedEffectiveUpgrades = upgradeTowerLevel(tower, levels - 1);
      applyTowerUpgradeStats(tower, definition, gainedEffectiveUpgrades, runtime.battleTime);
      runtime.resetTowerSkill(tower);
    }
    runtime.towers.push(tower);
    runtime.occupied.set(gridCellKey(lane, column), tower);
    runtime.updateLevelAuras();
  }

  private upgradeTower(tower: Tower, levels: number) {
    const runtime = this.runtime();
    const targets: Tower[] = [];
    const targetBodies: Phaser.GameObjects.GameObject[] = [];
    const candidates = runtime.mirrorGroupFor?.(tower) ?? [tower];
    for (const candidate of candidates) {
      if (!candidate.inPlay || candidate.type !== tower.type) {
        continue;
      }

      targets.push(candidate);
      targetBodies.push(candidate.body);
    }

    for (const target of targets) {
      const definition = runtime.getDefinition(target.type);
      const gainedEffectiveUpgrades = upgradeTowerLevel(target, levels);
      applyTowerUpgradeStats(target, definition, gainedEffectiveUpgrades, runtime.battleTime);
      runtime.resetTowerSkill(target);
    }

    runtime.updateLevelAuras();
    runtime.scene.tweens.add({
      targets: targetBodies,
      scale: 1.08,
      yoyo: true,
      duration: 90,
      ease: "Quad.easeOut"
    });
  }

  private isCellDeployable(lane: number, column: number) {
    return this.runtime().isCellDeployable?.(lane, column) ?? true;
  }

  private upgradeGroupKey(tower: Tower) {
    return tower.mirrorGroupId ? `mirror:${tower.mirrorGroupId}` : `tower:${tower.id}`;
  }
}
