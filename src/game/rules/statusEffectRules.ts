import { statusEffectDefinitions } from "../../data/statusEffects";
import type { StatusEffect, StatusEffectName } from "../../types";

type EffectHolder = { statusEffects: StatusEffect[] };

export interface StatusMultipliers { speed: number; attack: number; armor: number }

export function statusEffectByName(unit: EffectHolder, name: StatusEffectName) {
  for (const effect of unit.statusEffects) if (effect.name === name) return effect;
  return undefined;
}

export function hasStatusEffectName(unit: EffectHolder, name: StatusEffectName) {
  return Boolean(statusEffectByName(unit, name));
}

export function removeStatusEffectState(unit: EffectHolder, name: StatusEffectName) {
  let writeIndex = 0;
  const effects = unit.statusEffects, initialLength = effects.length;
  for (let readIndex = 0; readIndex < effects.length; readIndex++) {
    const effect = effects[readIndex];
    if (effect.name === name) continue;
    if (writeIndex !== readIndex) effects[writeIndex] = effect;
    writeIndex++;
  }
  effects.length = writeIndex;
  return writeIndex !== initialLength;
}

export function expireStatusEffects(unit: EffectHolder, time: number) {
  let writeIndex = 0;
  const effects = unit.statusEffects, initialLength = effects.length;
  for (let readIndex = 0; readIndex < effects.length; readIndex++) {
    const effect = effects[readIndex];
    if (effect.expiresAt <= time) continue;
    if (writeIndex !== readIndex) effects[writeIndex] = effect;
    writeIndex++;
  }
  if (writeIndex < effects.length) effects.length = writeIndex;
  return writeIndex !== initialLength;
}

// The caller owns expiry and visual invalidation; reuse its output to avoid per-hit allocations.
export function calculateStatusMultipliers<T extends StatusMultipliers>(unit: EffectHolder, out: T): T {
  let speed = 1, attack = 1, armor = 1, power = 1;
  for (const effect of unit.statusEffects) {
    speed *= effectSpeedMultiplier(effect);
    if (effect.name === "power") power = Math.max(power, effectAttackMultiplier(effect));
    else attack *= effectAttackMultiplier(effect);
    armor *= statusEffectDefinitions[effect.name].armor ?? 1;
  }
  out.speed = speed; out.attack = attack * power; out.armor = armor;
  return out;
}

export function addFrozenPhysicalDamageState(unit: EffectHolder & { maxHp: number }, damage: number) {
  const frozen = statusEffectByName(unit, "frozen");
  if (!frozen) return false;
  frozen.physicalDamageTaken = (frozen.physicalDamageTaken ?? 0) + damage;
  return frozen.physicalDamageTaken >= unit.maxHp * 0.5 && removeStatusEffectState(unit, "frozen");
}

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
    // Snapshots omit undefined modifiers. Reserve their original positions before
    // a refresh fills them, so restored effects retain the same replay hash.
    if (!Object.hasOwn(existing, "speedMultiplier") || !Object.hasOwn(existing, "attackMultiplier")) {
      const { speedMultiplier, attackMultiplier, showHalo, physicalDamageTaken } = existing;
      delete existing.speedMultiplier; delete existing.attackMultiplier;
      delete existing.showHalo; delete existing.physicalDamageTaken;
      Object.assign(existing, { speedMultiplier, attackMultiplier, showHalo, physicalDamageTaken });
    }
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
