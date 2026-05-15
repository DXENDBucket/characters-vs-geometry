import {
  cardDefinitions as rawCardDefinitions,
  defaultLoadout as rawDefaultLoadout
} from "../data/cards";
import { cardBehaviorsById, idleCardBehavior, type CardBehavior } from "../game/cardBehaviors";
import type { CardDefinition, CardId } from "../types";

const definitionsById = new Map<CardId, CardDefinition>(
  rawCardDefinitions.map((definition) => [definition.id, definition])
);
const behaviorsById = new Map<CardId, CardBehavior>(
  rawCardDefinitions.map((definition) => [definition.id, cardBehaviorsById[definition.id] ?? idleCardBehavior])
);

export const allCardDefinitions = rawCardDefinitions;
export const defaultCardLoadout = rawDefaultLoadout;

export function getCardDefinition(id: CardId) {
  return definitionsById.get(id) ?? allCardDefinitions[0];
}

export function hasCardDefinition(id: CardId) {
  return definitionsById.has(id);
}

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
