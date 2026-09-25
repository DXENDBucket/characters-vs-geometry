import type { CardDefinition } from "../types";
import type { TowerState } from "./towerState";
import type { TowerAuraSources } from "./towerAuras";
import { effectiveUpgradeDelta } from "./upgrades";
import { towerBehaviorType } from "./towerIdentity";
import { syncTowerFinalStats } from "./unitStatRules";

export interface TowerUpgradePresentation {
  level(tower: TowerState): void;
  health(tower: TowerState): void;
  trapReset(tower: TowerState): void;
}
export const NO_TOWER_UPGRADE_PRESENTATION: TowerUpgradePresentation = Object.freeze({
  level() {}, health() {}, trapReset() {}
});

export function upgradeTowerLevel(tower: TowerState, levels = 1,
  presentation: Pick<TowerUpgradePresentation, "level"> = NO_TOWER_UPGRADE_PRESENTATION) {
  const previousLevel = tower.level;
  tower.level += Math.max(0, Math.floor(levels));
  presentation.level(tower);
  return effectiveUpgradeDelta(previousLevel, tower.level);
}

export function syncTowerDerivedStats(tower: TowerState, healMaxHpIncrease = false,
  towers?: TowerState[], towerAuraSources?: TowerAuraSources,
  presentation: Pick<TowerUpgradePresentation, "health"> = NO_TOWER_UPGRADE_PRESENTATION) {
  syncTowerFinalStats(tower, { healMaxHpIncrease, towers, towerAuraSources }, presentation.health);
  presentation.health(tower);
}

export function applyTowerUpgradeStats(tower: TowerState, definition: CardDefinition,
  gainedEffectiveUpgrades: number, battleTime: number, presentation = NO_TOWER_UPGRADE_PRESENTATION) {
  syncTowerDerivedStats(tower, gainedEffectiveUpgrades > 0, undefined, undefined, presentation);
  if (towerBehaviorType(tower) === "G") {
    tower.armedAt = battleTime + (definition.armTime ?? 15_000);
    presentation.trapReset(tower);
  }
}
