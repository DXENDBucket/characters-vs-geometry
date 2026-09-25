import { canUpgradeTowerWithCard, towerBehaviorType } from "./towerIdentity";
import { LANES } from "../config";
import type { CardDefinition, CardId } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { BattleCardState } from "./battleLoadout";
import type { TowerExtractionPool } from "./towerExtraction";
import { syncTowerOccupancy, towerInPlacementLayer } from "./towerOccupancy";
import { applyTowerUpgradeStats, upgradeTowerLevel, NO_TOWER_UPGRADE_PRESENTATION, type TowerUpgradePresentation } from "./towerUpgradeRules";
import { findAutoUpgradeTarget, isCardReadyForAutoUpgrade } from "./towerRules";

export interface TowerDeploymentRuntime<T extends Tower = Tower> {
  towers: T[];
  occupied: Map<string, T>;
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
  resetTowerSkill: (tower: T) => void;
  mirrorGroupFor?: (tower: T) => T[];
  isCellDeployable?: (lane: number, column: number) => boolean;
  updateLevelAuras: () => void;
  createTower(definition: CardDefinition, lane: number, column: number, time: number, order: number): T;
  extraction: TowerExtractionPool;
}

export interface DeploymentPresentation extends TowerUpgradePresentation {
  cards(): void;
  feedback(kind: "deploy" | "upgrade"): void;
  upgraded(towers: Tower[]): void;
  autoUpgrade(tower: Tower): void;
  autoBorder(tower: Tower, active: boolean): void;
}
export const NO_DEPLOYMENT_PRESENTATION: DeploymentPresentation = Object.freeze({
  ...NO_TOWER_UPGRADE_PRESENTATION, cards() {}, feedback() {}, upgraded() {}, autoUpgrade() {}, autoBorder() {}
});

export class TowerDeploymentSimulation<T extends Tower = Tower> {
  private readonly upgradedGroupsBuffer = new Set<string>();

  constructor(private readonly runtime: () => TowerDeploymentRuntime<T>, public presentation: DeploymentPresentation = NO_DEPLOYMENT_PRESENTATION) {}

  useCard(definition: CardDefinition, lane: number, column: number): "deployed" | "occupied" | "cooldown" | "noChars" {
    if (definition.category === "special") return "occupied";
    const runtime = this.runtime();
    const card = runtime.cardStates.find((state) => state.definition.id === definition.id);
    if (!card || runtime.cardTimeFor(definition.id) < card.readyAt) return "cooldown";
    const batch = this.plan(definition);
    if (runtime.getChars() < batch.cost) return "noChars";
    if (!this.deploy(definition, lane, column, batch.levels)) return "occupied";
    runtime.spendChars(batch.cost);
    runtime.extraction.consume(batch);
    card.readyAt = runtime.cardTimeFor(definition.id) + definition.cooldown;
    this.presentation.cards();
    return "deployed";
  }

  private deploy(definition: CardDefinition, lane: number, column: number, levels: number) {
    return this.runtime().unlimitedFirepower
      ? this.deployColumn(definition, column, levels)
      : this.deploySingle(definition, lane, column, levels);
  }

  plan(definition: CardDefinition) {
    return this.runtime().extraction.plan(definition);
  }

  attemptAutoUpgrades() {
    const runtime = this.runtime();
    let availableChars = runtime.getChars();
    if (
      !runtime.autoUpgradeEnabled ||
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
      this.presentation.autoUpgrade(target);
      upgraded = true;
    }

    if (upgraded) {
      this.presentation.cards();
    }
  }

  syncAutoUpgradeBorders() {
    const runtime = this.runtime();
    runtime.towers.forEach((tower) => this.presentation.autoBorder(tower, runtime.autoUpgradeEnabled));
  }

  private deploySingle(definition: CardDefinition, lane: number, column: number, levels: number) {
    const runtime = this.runtime();
    const existingTower = towerInPlacementLayer(runtime.occupied, lane, column, definition.id);
    if (existingTower) {
      if (!canUpgradeTowerWithCard(existingTower, definition.id)) {
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
        const existingTower = towerInPlacementLayer(runtime.occupied, lane, column, definition.id);
        if (existingTower) {
          if (canUpgradeTowerWithCard(existingTower, definition.id)) {
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
    const tower = runtime.createTower(
      definition,
      lane,
      column,
      runtime.battleTime,
      runtime.nextTowerOrder()
    );

    if (levels > 1) {
      const gainedEffectiveUpgrades = upgradeTowerLevel(tower, levels - 1, this.presentation);
      applyTowerUpgradeStats(tower, definition, gainedEffectiveUpgrades, runtime.battleTime, this.presentation);
      runtime.resetTowerSkill(tower);
    }
    runtime.towers.push(tower);
    syncTowerOccupancy(runtime.towers, runtime.occupied);
    runtime.updateLevelAuras();
    this.presentation.feedback("deploy");
  }

  private upgradeTower(tower: T, levels: number) {
    const runtime = this.runtime();
    const targets: T[] = [];
    const candidates = runtime.mirrorGroupFor?.(tower) ?? [tower];
    for (const candidate of candidates) {
      if (!candidate.inPlay || candidate.type !== tower.type) {
        continue;
      }

      targets.push(candidate);
    }

    for (const target of targets) {
      const definition = runtime.getDefinition(towerBehaviorType(target));
      const gainedEffectiveUpgrades = upgradeTowerLevel(target, levels, this.presentation);
      applyTowerUpgradeStats(target, definition, gainedEffectiveUpgrades, runtime.battleTime, this.presentation);
      runtime.resetTowerSkill(target);
    }

    runtime.updateLevelAuras();
    this.presentation.upgraded(targets);
    if (targets.length) this.presentation.feedback("upgrade");
  }

  private isCellDeployable(lane: number, column: number) {
    return this.runtime().isCellDeployable?.(lane, column) ?? true;
  }

  private upgradeGroupKey(tower: T) {
    return tower.mirrorGroupId ? `mirror:${tower.mirrorGroupId}` : `tower:${tower.id}`;
  }
}
