import type { EnemyState as Enemy } from "./enemyState";
import { containedEnemies, syncPassengerPositionState } from "./enemyContainerRules";
import { addEnemyToField } from "./enemyRoster";
import { applyStatusEffect } from "./statusEffects";

export interface EnemyReleasePresentation {
  passengerSeats(carrier: Enemy): void;
  passengerReleased(enemy: Enemy): void;
  burrowReleased(enemy: Enemy): void;
  burrowShift(carrier: Enemy, enemy: Enemy): void;
}
export const NO_ENEMY_RELEASE_PRESENTATION: EnemyReleasePresentation = Object.freeze({
  passengerSeats() {}, passengerReleased() {}, burrowReleased() {}, burrowShift() {}
});

export function releaseParenthesisPassengers(carrier: Enemy, enemies: Enemy[], time: number, presentation: EnemyReleasePresentation) {
  if (!carrier.parenthesisCargo?.length) return;
  syncPassengerPositionState(carrier);
  presentation.passengerSeats(carrier);
  const cargo = carrier.parenthesisCargo ?? [];
  carrier.parenthesisCargo = [];
  for (const passenger of cargo) {
    passenger.parenthesisCarrier = undefined;
    passenger.inPlay = true;
    for (const effect of carrier.statusEffects) {
      if (effect.name === "flying" && effect.expiresAt > time) {
        applyStatusEffect(passenger, "flying", effect.expiresAt - time, time, effect.speedMultiplier, effect.showHalo);
      }
    }
    syncPassengerPositionState(passenger);
    presentation.passengerReleased(passenger);
    addEnemyToField(enemies, passenger);
  }
}

export function releaseBurrowCargo(
  runtime: { enemies: Enemy[]; presentation: EnemyReleasePresentation },
  carrier: Enemy,
  options: { reverseDirection?: boolean } = {}
) {
  const cargo = carrier.burrowCargo ?? [];
  carrier.burrowCargo = [];
  cargo.forEach((enemy, index) => {
    if (enemy.inPlay) {
      return;
    }

    enemy.inPlay = true;
    enemy.lane = carrier.lane;
    enemy.y = carrier.y;
    enemy.x = carrier.x + 22 + index * 10;
    if (options.reverseDirection) {
      enemy.movementDirection = 1;
    }
    enemy.blockedByTowerId = undefined;
    enemy.blockedSince = undefined;
    syncPassengerPositionState(enemy);
    runtime.presentation.burrowReleased(enemy);
    addEnemyToField(runtime.enemies, enemy);
    runtime.presentation.burrowShift(carrier, enemy);
  });
}


export function destroyContainedEnemies(enemy: Enemy, removeDisplay: (enemy: Enemy) => void) {
  for (const cargo of containedEnemies(enemy)) {
    destroyContainedEnemies(cargo, removeDisplay);
    cargo.parenthesisCarrier = undefined;
    cargo.inPlay = false;
    removeDisplay(cargo);
  }
  enemy.burrowCargo = [];
  enemy.parenthesisCargo = [];
}
