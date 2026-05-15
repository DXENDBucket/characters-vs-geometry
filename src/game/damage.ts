import type { DamageType } from "../types";

export function calculateDamage(rawDamage: number, damageType: DamageType, armor: number, magicResistance: number) {
  if (damageType === "true") {
    return rawDamage;
  }

  if (damageType === "magic") {
    const resistanceMultiplier = 1 - magicResistance / 100;
    return rawDamage * clamp(resistanceMultiplier, 0.05, 1);
  }

  return Math.max(rawDamage - armor, rawDamage * 0.1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
