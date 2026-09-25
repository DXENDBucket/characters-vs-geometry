import type { CardDefinition, CardId, Tower } from "../types";
import type { CardReadinessRuntime, CardBehaviorRuntime } from "./combatRuntime";
import * as rules from "./cardBehaviorRules";
import { towerCombatRuntime } from "../render/towerCombat";

export interface CardBehavior {
  canUse(tower: Tower, definition: CardDefinition, time: number, runtime: CardReadinessRuntime, cooldownAlreadyReady?: boolean): boolean;
  execute(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime, hitCount?: number): void;
}
const adapters = new Map<rules.CardBehavior, CardBehavior>();
function adapt(behavior: rules.CardBehavior): CardBehavior {
  let adapter = adapters.get(behavior);
  if (!adapter) {
    adapter = {
      canUse: behavior.canUse,
      execute: (tower, definition, runtime, hitCount) => behavior.execute(tower, definition, towerCombatRuntime(runtime), hitCount)
    };
    adapters.set(behavior, adapter);
  }
  return adapter;
}
export const idleCardBehavior = adapt(rules.idleCardBehavior);
export const projectileCardBehavior = adapt(rules.projectileCardBehavior);
export const homingCardBehavior = adapt(rules.homingCardBehavior);
export const magicLaserCardBehavior = adapt(rules.magicLaserCardBehavior);
export const healingCardBehavior = adapt(rules.healingCardBehavior);
export const areaHealingCardBehavior = adapt(rules.areaHealingCardBehavior);
export const productionCardBehavior = adapt(rules.productionCardBehavior);
export const shiftCardBehavior = adapt(rules.shiftCardBehavior);
export const laneRepelCardBehavior = adapt(rules.laneRepelCardBehavior);
export const blockedPushCardBehavior = adapt(rules.blockedPushCardBehavior);
export const blockedStorageCardBehavior = adapt(rules.blockedStorageCardBehavior);
export const slowAuraCardBehavior = adapt(rules.slowAuraCardBehavior);
export const slashCardBehavior = adapt(rules.slashCardBehavior);
export const arcWaveCardBehavior = adapt(rules.arcWaveCardBehavior);
export const predictiveMortarCardBehavior = adapt(rules.predictiveMortarCardBehavior);
export const smallSummonerCardBehavior = adapt(rules.smallSummonerCardBehavior);

export const cardBehaviorsById = Object.fromEntries(Object.entries(rules.cardBehaviorsById)
  .map(([id, behavior]) => [id, adapt(behavior)])) as Record<CardId, CardBehavior>;
