import type Phaser from "phaser";
import type { Tower } from "../types";
import type { TowerBoardPresentation } from "../game/towerBoard";
import { syncTowerFormVisual, syncFriendlyRangeVisual, syncTowerLevelText, towerUpgradePresentation } from "../game/towers";

export function towerBoardPresentation(scene: Phaser.Scene): TowerBoardPresentation {
  return {
    ...towerUpgradePresentation,
    level: tower => syncTowerLevelText(tower as Tower),
    copy: (tower, definition, time) => syncTowerFormVisual(scene, tower as Tower, definition, time),
    range: tower => syncFriendlyRangeVisual(tower as Tower)
  };
}
