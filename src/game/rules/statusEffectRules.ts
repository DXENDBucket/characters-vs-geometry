import { statusEffectDefinitions } from "../../data/statusEffects";
import type { StatusEffect, StatusEffectName } from "../../types";

type EffectHolder = { statusEffects: StatusEffect[] };

export type StatusEffectModifiers = Pick<StatusEffect, "speedMultiplier" | "attackMultiplier">;

export function effectAttackMultiplier(effect: StatusEffect) {
  return effect.attackMultiplier ?? statusEffectDefinitions[effect.name].attack ?? 1;
}

export function effectSpeedMultiplier(effect: StatusEffect) {
  return effect.speedMultiplier ?? statusEffectDefinitions[effect.name].speed;
}

export function refreshStatusEffect(unit: EffectHolder, name: StatusEffectName, expiresAt: number,
  modifiers?: number | StatusEffectModifiers, showHalo = false) {
  const { speedMultiplier, attackMultiplier } = typeof modifiers === "number" ? { speedMultiplier: modifiers } : modifiers ?? {};
  const power = attackMultiplier ?? statusEffectDefinitions[name].attack ?? 1;
  // Different Power strengths keep their own deadlines; a short stronger buff must not become permanent.
  const existing = unit.statusEffects.find(effect => effect.name === name && !effect.source &&
    (name !== "power" || effectAttackMultiplier(effect) === power));
  if (existing) {
    existing.expiresAt = name === "sunder" ? expiresAt : Math.max(existing.expiresAt, expiresAt);
    existing.speedMultiplier = Math.max(effectSpeedMultiplier(existing), speedMultiplier ?? statusEffectDefinitions[name].speed);
    existing.attackMultiplier = Math.max(effectAttackMultiplier(existing), attackMultiplier ?? statusEffectDefinitions[name].attack ?? 1);
    existing.showHalo = existing.showHalo || showHalo;
    if (name === "frozen") existing.physicalDamageTaken = 0;
  } else unit.statusEffects.push({ name, expiresAt, speedMultiplier, attackMultiplier, showHalo,
    physicalDamageTaken: name === "frozen" ? 0 : undefined });
}

export function movementHasteMultiplier(unit: EffectHolder) {
  const effect = unit.statusEffects.find(effect => effect.name === "haste" && effect.source === "movementAura");
  return effect ? effectSpeedMultiplier(effect) : 1;
}

// Aura refresh replaces its value and disappears on leaving range; it never refreshes timed haste.
export function setMovementHasteEffect(unit: EffectHolder, multiplier: number) {
  const index = unit.statusEffects.findIndex(effect => effect.name === "haste" && effect.source === "movementAura");
  if (multiplier <= 1) {
    if (index < 0) return false;
    unit.statusEffects.splice(index, 1); return true;
  }
  if (index >= 0) {
    const effect = unit.statusEffects[index];
    if (effect.speedMultiplier === multiplier) return false;
    effect.speedMultiplier = multiplier;
  } else unit.statusEffects.push({ name: "haste", source: "movementAura", expiresAt: Infinity, speedMultiplier: multiplier });
  return true;
}

export function activeStatusSpeedMultiplier(unit: EffectHolder, time: number) {
  let multiplier = 1;
  for (const effect of unit.statusEffects) if (effect.expiresAt > time) multiplier *= effectSpeedMultiplier(effect);
  return multiplier;
}
