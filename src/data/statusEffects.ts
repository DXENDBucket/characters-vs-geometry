import type { StatusEffectName } from "../types";

export interface StatusEffectDefinition {
  speed: number;
  attack?: number;
  armor?: number;
}

export const statusEffectDefinitions: Record<StatusEffectName, StatusEffectDefinition> = {
  stasis: { speed: 0.7 },
  haste: { speed: 2 },
  power: { speed: 1, attack: 1.3 },
  flying: { speed: 1 },
  invincible: { speed: 1 },
  highFlying: { speed: 1 },
  sunder: { speed: 1, armor: 0.5 },
  frozen: { speed: 0 },
  reversed: { speed: 1 }
};
