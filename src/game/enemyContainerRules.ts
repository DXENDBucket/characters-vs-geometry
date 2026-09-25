import type { Enemy } from "../types";
import type { EnemyState } from "./enemyState";
import { enemyFamily, enemyIsBossCompanion, enemyIsLeader } from "../registry/enemies";

export const PASSENGER_STAT_RATIO = 0.35;

export function passengerSeatWidth(enemy: EnemyState) {
  const family = enemyFamily(enemy.kind);
  if (family === "hexMace") return 104;
  if (family === "angelPentagonRam") return 92;
  if (family === "triangleRam") return 64;
  return 56;
}

export function enemyCanBeLoaded(enemy: EnemyState) {
  return enemyFamily(enemy.kind) !== "parentheses";
}

export function canJoinEnemyGroup(enemy: EnemyState) {
  const family = enemyFamily(enemy.kind);
  return enemy.inPlay && enemy.hp > 0 && !enemy.healthPool && !enemy.parenthesisCarrier &&
    !enemyIsLeader(enemy.kind) && !enemyIsBossCompanion(enemy.kind) &&
    family !== "solarBomb" && family !== "equals" && enemyCanBeLoaded(enemy);
}

export function enemyIsActive(enemy: EnemyState) {
  return enemy.inPlay || enemy.parenthesisCarrier?.inPlay === true;
}

export function enemiesWithPassengers(enemies: Enemy[]): Enemy[];
export function enemiesWithPassengers(enemies: EnemyState[]): EnemyState[];
export function enemiesWithPassengers(enemies: EnemyState[]) {
  if (!enemies.some(enemy => enemy.parenthesisCargo?.length)) return enemies;
  const result: EnemyState[] = [];
  for (const enemy of enemies) {
    result.push(enemy);
    result.push(...(enemy.parenthesisCargo ?? []));
  }
  return result;
}

export function containedEnemies(enemy: Enemy): Enemy[];
export function containedEnemies(enemy: EnemyState): EnemyState[];
export function containedEnemies(enemy: EnemyState) {
  return [...(enemy.burrowCargo ?? []), ...(enemy.parenthesisCargo ?? [])];
}

export function enemyMaximumHp(enemy: EnemyState) {
  return (enemy.baseStats.maxHp + (enemy.parenthesisHpBonus ?? 0)) * (enemy.environmentHpMultiplier ?? 1);
}

export function parenthesisHalfSpan(enemy: EnemyState) {
  const cargo = enemy.parenthesisCargo;
  return cargo?.length ? cargo.reduce((width, passenger) => width + passengerSeatWidth(passenger), 0) / 2 - 20 : 0;
}

export function syncPassengerPositionState(carrier: EnemyState) {
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
  }
}
