import { palette } from "../config";
import type { DamageType } from "../types";

export function damageEffectColor(damageType: DamageType) {
  return damageType === "magic" ? palette.magic : palette.white;
}

export function damageEffectTextColor(damageType: DamageType) {
  return damageType === "magic" ? "#9fdcff" : "#f5f5f5";
}
