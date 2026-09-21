import type { Enemy } from "../types";
import { enemyFamily, enemyRank } from "../registry/enemies";
import { canJoinEnemyGroup, enemyMaximumHp, parenthesisHalfSpan, PASSENGER_STAT_RATIO, syncPassengerPositions } from "./enemyContainers";
import { enemyIsBurrowed, enemyIsHighFlying } from "./enemyBehaviors";
import { applyStatusEffect, effectSpeedMultiplier, hasUnexpiredStatusEffect, removeStatusEffect, statusMultipliers, syncEnemyBodyPosition } from "./statusEffects";
import { syncParenthesisVisual } from "../render/parenthesisEnemy";
import { segmentBoxHitTime } from "./oscillatingMovement";

export type EnemyPositions = Map<Enemy, { x: number; y: number }>;

function touchesCarrier(carrier: Enemy, target: Enemy, previous?: EnemyPositions) {
  const width = 48 + parenthesisHalfSpan(carrier);
  const x = target.x - carrier.x, y = target.y - carrier.y;
  if (Math.abs(x) <= width && Math.abs(y) <= 32) return true;
  const a = previous?.get(carrier), b = previous?.get(target);
  return !!a && !!b && segmentBoxHitTime(b.x - a.x, b.y - a.y,
    x - (b.x - a.x), y - (b.y - a.y), width, 32) <= 1;
}

export function collectParenthesisPassengers(carrier: Enemy, enemies: Enemy[], time: number, previous?: EnemyPositions) {
  if (!carrier.inPlay || enemyFamily(carrier.kind) !== "parentheses" || enemyIsHighFlying(carrier) ||
    hasUnexpiredStatusEffect(carrier, "frozen", time)) return;
  const cargo = carrier.parenthesisCargo ??= [];
  const capacity = enemyRank(carrier.kind) + 1;
  if (cargo.length >= capacity) return;
  const hpRatio = carrier.hp / enemyMaximumHp(carrier);
  const seats = new Map(cargo.map(passenger => [passenger, passenger.x]));
  let changed = false;
  // Stable field order is also boarding order when contacts happen in the same tick.
  for (let index = 0; index < enemies.length && cargo.length < capacity;) {
    const target = enemies[index];
    if (target === carrier || !canJoinEnemyGroup(target) || enemyIsBurrowed(target) || enemyIsHighFlying(target) ||
      !touchesCarrier(carrier, target, previous)) {
      index++; continue;
    }
    seats.set(target, target.x);
    target.inPlay = false;
    target.parenthesisCarrier = carrier;
    target.blockedByTowerId = undefined; target.blockedSince = undefined;
    cargo.push(target); enemies.splice(index, 1);
    const flying = target.statusEffects.find(effect => effect.name === "flying" && effect.expiresAt > time);
    if (flying) {
      applyStatusEffect(carrier, "flying", flying.expiresAt - time, time, flying.speedMultiplier, true);
      removeStatusEffect(target, "flying");
    }
    changed = true;
  }
  if (!changed) return;
  // Transfer native health, then apply the carrier's environment multiplier once.
  carrier.parenthesisHpBonus = cargo.reduce((sum, passenger) => sum + enemyMaximumHp(passenger) / (passenger.environmentHpMultiplier ?? 1), 0) * PASSENGER_STAT_RATIO;
  carrier.maxHp = carrier.finalStats.maxHp = enemyMaximumHp(carrier);
  carrier.hp = carrier.maxHp * hpRatio;
  syncParenthesisVisual(carrier);
  syncEnemyBodyPosition(carrier);
  for (const passenger of cargo) passenger.spawnX += passenger.x - seats.get(passenger)!;
}

export function releaseParenthesisPassengers(carrier: Enemy, enemies: Enemy[], time: number) {
  if (!carrier.parenthesisCargo?.length) return;
  syncPassengerPositions(carrier);
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
    passenger.body.setVisible(true).setAlpha(1);
    syncEnemyBodyPosition(passenger);
    enemies.push(passenger);
  }
}

export function passengerMovementStatus(passenger: Enemy, carrier: Enemy, time: number) {
  const status = statusMultipliers(passenger, time);
  const carrierStatus = statusMultipliers(carrier, time);
  let speed = status.speed;
  for (const effect of carrier.statusEffects) {
    if (effect.source === "movementAura") continue;
    const value = effectSpeedMultiplier(effect);
    const own = passenger.statusEffects.find(entry => entry.name === effect.name && entry.source === effect.source);
    const ownValue = own ? effectSpeedMultiplier(own) : 1;
    if (ownValue === 0) return { ...status, speed: 0 };
    const merged = Math.min(value, ownValue) < 1 ? Math.min(value, ownValue) : Math.max(value, ownValue);
    speed *= merged / ownValue;
  }
  return { ...status, speed: carrierStatus.speed === 0 ? 0 : speed };
}
