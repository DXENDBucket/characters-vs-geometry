import { enemyFamily } from "../registry/enemies";
import type { StatusEffectName } from "../types";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";
import type { BossState } from "./bossState";
import { syncPassengerPositionState } from "./enemyContainerRules";
import { applyReversalEffect } from "./rules/reversal";
import { addFrozenPhysicalDamageState, calculateStatusMultipliers, expireStatusEffects,
  hasStatusEffectName, refreshStatusEffect, removeStatusEffectState,
  type StatusEffectModifiers, type StatusMultipliers } from "./rules/statusEffectRules";
export { effectSpeedMultiplier, hasStatusEffectName, type StatusMultipliers } from "./rules/statusEffectRules";

interface EnemyStatusCache { multipliers: StatusMultipliers; revision: number }
const caches = new WeakMap<EnemyState, EnemyStatusCache>();

function statusCache(enemy: EnemyState) {
  let cache = caches.get(enemy);
  if (!cache) {
    cache = { multipliers: { speed: 1, attack: 1, armor: 1 }, revision: 0 };
    caches.set(enemy, cache);
  }
  return cache;
}

export function enemyStatusMultipliersCache(enemy: EnemyState) { return statusCache(enemy).multipliers; }
export function enemyStatusRevision(enemy: EnemyState) { return statusCache(enemy).revision; }
export function invalidateEnemyStatus(enemy: EnemyState) { statusCache(enemy).revision++; }

export function applyStatusEffect(
  enemy: EnemyState, name: StatusEffectName, duration: number, time: number,
  speedMultiplier?: number | StatusEffectModifiers, showHalo?: boolean
): void;
export function applyStatusEffect(unit: TowerState | BossState, name: "reversed", duration: number, time: number): void;
export function applyStatusEffect(unit: BossState, name: "haste", duration: number, time: number, speedMultiplier?: number): void;
export function applyStatusEffect(
  unit: EnemyState | TowerState | BossState, name: StatusEffectName, duration: number, time: number,
  speedMultiplier?: number | StatusEffectModifiers, showHalo = false
) {
  if (!("kind" in unit) || "rank" in unit) {
    if (name === "haste" && "rank" in unit) refreshStatusEffect(unit, name, time + duration, speedMultiplier);
    if (name === "reversed") applyReversalEffect(unit, duration, time);
    return;
  }
  const enemy = unit;
  removeExpiredStatusEffects(enemy, time);
  if (enemyFamily(enemy.kind) === "archangelHeptagon" && name === "flying") {
    applyStatusEffect(enemy, "highFlying", duration, time, speedMultiplier, false);
    return;
  }
  refreshStatusEffect(enemy, name, time + duration, speedMultiplier, showHalo);
  invalidateEnemyStatus(enemy);
}

export function statusSpeedMultiplier(enemy: EnemyState, time: number) {
  return statusMultipliers(enemy, time).speed;
}

export function statusAttackMultiplier(enemy: EnemyState, time: number) {
  return statusMultipliers(enemy, time).attack;
}

export function statusArmorMultiplier(enemy: EnemyState, time: number) {
  return statusMultipliers(enemy, time).armor;
}

export function statusMultipliers(enemy: EnemyState, time: number): StatusMultipliers {
  const removedExpired = removeExpiredStatusEffects(enemy, time);
  // Passenger coordinates used to be updated by status rendering. Keep that timing in simulation.
  if (enemy.statusEffects.length > 0 || removedExpired) syncPassengerPositionState(enemy);
  return calculateStatusMultipliers(enemy, enemyStatusMultipliersCache(enemy));
}

export function hasStatusEffect(enemy: EnemyState, name: StatusEffectName, time: number) {
  const removedExpired = removeExpiredStatusEffects(enemy, time);
  if (enemy.statusEffects.length > 0 || removedExpired) syncPassengerPositionState(enemy);
  return hasStatusEffectName(enemy, name);
}

export function hasUnexpiredStatusEffect(enemy: EnemyState, name: StatusEffectName, time: number) {
  removeExpiredStatusEffects(enemy, time);
  return hasStatusEffectName(enemy, name);
}

export function removeStatusEffect(enemy: EnemyState, name: StatusEffectName) {
  if (removeStatusEffectState(enemy, name)) invalidateEnemyStatus(enemy);
}

export function addFrozenPhysicalDamage(enemy: EnemyState, damage: number, time: number) {
  removeExpiredStatusEffects(enemy, time);
  const removed = addFrozenPhysicalDamageState(enemy, damage);
  if (removed) invalidateEnemyStatus(enemy);
  syncPassengerPositionState(enemy);
  return removed;
}

export function isEnemyFlying(enemy: EnemyState, time: number) {
  return hasStatusEffect(enemy, "flying", time);
}

function removeExpiredStatusEffects(enemy: EnemyState, time: number) {
  const removed = expireStatusEffects(enemy, time);
  if (removed) invalidateEnemyStatus(enemy);
  return removed;
}
