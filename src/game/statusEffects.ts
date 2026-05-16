import type { Enemy, StatusEffectName } from "../types";

const STATUS_SPEED_MULTIPLIERS: Record<StatusEffectName, number> = {
  stasis: 1 / 3
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
  return enemy.statusEffects.reduce((multiplier, effect) => {
    return Math.min(multiplier, STATUS_SPEED_MULTIPLIERS[effect.name]);
  }, 1);
}

function removeExpiredStatusEffects(enemy: Enemy, time: number) {
  enemy.statusEffects = enemy.statusEffects.filter((effect) => effect.expiresAt > time);
}
