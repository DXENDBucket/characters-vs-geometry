import type { Enemy } from "../types";
import { enemyFamily, enemyIsBossCompanion, enemyIsLeader } from "../registry/enemies";

export const PASSENGER_STAT_RATIO = 0.35;

function passengerSeatWidth(enemy: Enemy) {
  const family = enemyFamily(enemy.kind);
  if (family === "hexMace") return 104;
  if (family === "angelPentagonRam") return 92;
  if (family === "triangleRam") return 64;
  return 56;
}

export function enemyCanBeLoaded(enemy: Enemy) {
  return enemyFamily(enemy.kind) !== "parentheses";
}

// Shared exclusions for health links and passenger collection.
export function canJoinEnemyGroup(enemy: Enemy) {
  const family = enemyFamily(enemy.kind);
  return enemy.inPlay && enemy.hp > 0 && !enemy.healthPool && !enemy.parenthesisCarrier &&
    !enemyIsLeader(enemy.kind) && !enemyIsBossCompanion(enemy.kind) &&
    family !== "solarBomb" && family !== "equals" && enemyCanBeLoaded(enemy);
}

export function enemyIsActive(enemy: Enemy) {
  return enemy.inPlay || enemy.parenthesisCarrier?.inPlay === true;
}

export function enemiesWithPassengers(enemies: Enemy[]) {
  if (!enemies.some(enemy => enemy.parenthesisCargo?.length)) return enemies;
  const result: Enemy[] = [];
  for (const enemy of enemies) {
    result.push(enemy);
    result.push(...(enemy.parenthesisCargo ?? []));
  }
  return result;
}

export function containedEnemies(enemy: Enemy) {
  return [...(enemy.burrowCargo ?? []), ...(enemy.parenthesisCargo ?? [])];
}

export function enemyMaximumHp(enemy: Enemy) {
  return (enemy.baseStats.maxHp + (enemy.parenthesisHpBonus ?? 0)) * (enemy.environmentHpMultiplier ?? 1);
}

export function parenthesisHalfSpan(enemy: Enemy) {
  const cargo = enemy.parenthesisCargo;
  return cargo?.length ? cargo.reduce((width, passenger) => width + passengerSeatWidth(passenger), 0) / 2 - 20 : 0;
}

export function syncPassengerPositions(carrier: Enemy) {
  const cargo = carrier.parenthesisCargo;
  if (!cargo?.length) return;
  const direction = carrier.statusEffects.some(effect => effect.name === "reversed")
    ? -(carrier.movementDirection ?? -1) : carrier.movementDirection ?? -1;
  let offset = -(parenthesisHalfSpan(carrier) + 20);
  for (const passenger of cargo) {
    const width = passengerSeatWidth(passenger);
    passenger.x = carrier.x + direction * (offset + width / 2);
    offset += width;
    passenger.lane = carrier.lane;
    passenger.y = carrier.y;
    passenger.body.setPosition(carrier.body.x + passenger.x - carrier.x, carrier.body.y);
    passenger.body.setVisible(carrier.inPlay && carrier.body.visible);
    passenger.body.setDepth(60 + carrier.lane);
  }
}

export function destroyContainedEnemies(enemy: Enemy) {
  for (const cargo of containedEnemies(enemy)) {
    destroyContainedEnemies(cargo);
    cargo.parenthesisCarrier = undefined;
    cargo.inPlay = false;
    cargo.body.destroy();
  }
  enemy.burrowCargo = [];
  enemy.parenthesisCargo = [];
}
