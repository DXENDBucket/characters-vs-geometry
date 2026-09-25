import type { Enemy } from "../types";
import type { EnemyReleasePresentation } from "../game/enemyReleaseRules";
import { syncPassengerVisuals } from "../game/enemyContainers";
import { syncEnemyFacingVisual } from "./enemyFacing";
import { syncEnemyPositionVisual } from "./enemyStatus";
import { makeShiftEffect } from "./combatEffects";

export const enemyReleasePresentation: EnemyReleasePresentation = {
  passengerSeats: carrier => syncPassengerVisuals(carrier as Enemy),
  passengerReleased: state => {
    const enemy = state as Enemy;
    enemy.body.setVisible(true).setAlpha(1);
    syncEnemyPositionVisual(enemy);
  },
  burrowReleased: state => {
    const enemy = state as Enemy;
    syncEnemyFacingVisual(enemy);
    enemy.body.setVisible(true).setAlpha(1).setDepth(60 + enemy.lane);
    syncEnemyPositionVisual(enemy);
  },
  burrowShift: (carrier, enemy) => makeShiftEffect((carrier as Enemy).body.scene, carrier.x, carrier.y, enemy.x, enemy.y)
};
