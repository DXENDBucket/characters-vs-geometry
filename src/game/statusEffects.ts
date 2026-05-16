import type { Enemy, StatusEffectName } from "../types";

const STATUS_SPEED_MULTIPLIERS: Record<StatusEffectName, number> = {
  stasis: 1 / 3,
  haste: 2,
  power: 1
};
const STATUS_ATTACK_MULTIPLIERS: Partial<Record<StatusEffectName, number>> = {
  power: 1.3
};

export function applyStatusEffect(enemy: Enemy, name: StatusEffectName, duration: number, time: number) {
  const expiresAt = time + duration;
  const existing = enemy.statusEffects.find((effect) => effect.name === name);
  if (existing) {
    existing.expiresAt = Math.max(existing.expiresAt, expiresAt);
    return;
  }

  enemy.statusEffects.push({ name, expiresAt });
}

export function statusSpeedMultiplier(enemy: Enemy, time: number) {
  removeExpiredStatusEffects(enemy, time);
  syncStatusVisuals(enemy, time);
  return enemy.statusEffects.reduce((multiplier, effect) => {
    return multiplier * STATUS_SPEED_MULTIPLIERS[effect.name];
  }, 1);
}

export function statusAttackMultiplier(enemy: Enemy, time: number) {
  removeExpiredStatusEffects(enemy, time);
  syncStatusVisuals(enemy, time);
  return enemy.statusEffects.reduce((multiplier, effect) => {
    return multiplier * (STATUS_ATTACK_MULTIPLIERS[effect.name] ?? 1);
  }, 1);
}

export function hasStatusEffect(enemy: Enemy, name: StatusEffectName, time: number) {
  removeExpiredStatusEffects(enemy, time);
  syncStatusVisuals(enemy, time);
  return enemy.statusEffects.some((effect) => effect.name === name);
}

function removeExpiredStatusEffects(enemy: Enemy, time: number) {
  enemy.statusEffects = enemy.statusEffects.filter((effect) => effect.expiresAt > time);
}

function syncStatusVisuals(enemy: Enemy, time: number) {
  const stasisActive = enemy.statusEffects.some((effect) => effect.name === "stasis");
  const powerActive = enemy.statusEffects.some((effect) => effect.name === "power");
  enemy.statusBorder.setVisible(stasisActive);
  enemy.powerIcon.setVisible(powerActive);
  if (stasisActive) {
    enemy.statusBorder.setScale(1 + Math.sin(time / 80) * 0.04);
  }
  if (powerActive) {
    enemy.powerIcon.setY(-38 + Math.sin(time / 120) * 2);
  }
}
