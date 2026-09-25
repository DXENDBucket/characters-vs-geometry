import type { Enemy } from "../types";
import { syncPassengerPositionState } from "./enemyContainerRules";
import { destroyContainedEnemies as destroyContents } from "./enemyReleaseRules";
export { PASSENGER_STAT_RATIO, canJoinEnemyGroup, enemyCanBeLoaded, enemyIsActive,
  enemiesWithPassengers, containedEnemies, enemyMaximumHp, parenthesisHalfSpan } from "./enemyContainerRules";

export function syncPassengerVisuals(carrier: Enemy) {
  for (const passenger of carrier.parenthesisCargo ?? []) {
    passenger.body.setPosition(carrier.body.x + passenger.x - carrier.x, carrier.body.y);
    passenger.body.setVisible(carrier.inPlay && carrier.body.visible);
    passenger.body.setDepth(60 + carrier.lane);
  }
}

// Live adapter: logical seats are established before display objects follow them.
export function syncPassengerPositions(carrier: Enemy) {
  syncPassengerPositionState(carrier);
  syncPassengerVisuals(carrier);
}

export function destroyContainedEnemies(enemy: Enemy) {
  destroyContents(enemy, cargo => (cargo as Enemy).body.destroy());
}
