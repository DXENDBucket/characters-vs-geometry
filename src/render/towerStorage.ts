import type Phaser from "phaser";
import type { Enemy } from "../types";
import type { StoragePresentation } from "../game/towerStorageRules";
import { makeShiftEffect } from "./combatEffects";
import { syncEnemyPositionVisual } from "./enemyStatus";

export function towerStoragePresentation(scene: () => Phaser.Scene): StoragePresentation {
  return {
    visible: (enemy, visible) => { (enemy as Enemy).body.setVisible(visible); },
    released: enemy => {
      (enemy as Enemy).body.setVisible(true);
      (enemy as Enemy).body.setDepth(60 + enemy.lane);
      syncEnemyPositionVisual(enemy as Enemy);
    },
    shift: (fromX, fromY, toX, toY) => makeShiftEffect(scene(), fromX, fromY, toX, toY),
    remove: enemy => { (enemy as Enemy).body.destroy(); }
  };
}
