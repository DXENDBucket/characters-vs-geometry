import { cardBehaviorsById, idleCardBehavior, type CardBehavior } from "../game/cardBehaviors";
import type { CardId } from "../types";
import { allCardDefinitions, defaultCardLoadout, getCardDefinition, hasCardDefinition } from "./cardDefinitions";
export * from "./cardDefinitions";

const behaviorsById = new Map<CardId, CardBehavior>(
  allCardDefinitions.map((definition) => [definition.id, cardBehaviorsById[definition.id] ?? idleCardBehavior])
);

export function getCardBehavior(id: CardId) {
  return behaviorsById.get(id) ?? idleCardBehavior;
}

export const cardRegistry = {
  definitions: allCardDefinitions,
  defaultLoadout: defaultCardLoadout,
  getDefinition: getCardDefinition,
  getBehavior: getCardBehavior,
  has: hasCardDefinition
};
