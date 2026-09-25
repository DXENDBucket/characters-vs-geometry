import { cardDefinitions as rawCardDefinitions, defaultLoadout as rawDefaultLoadout } from "../data/cards";
import type { CardDefinition, CardId } from "../types";
import { imitatedCardId, isImitatorCard, towerPriceTier } from "../game/cardIdentity";

export type CardLetterCase = "uppercase" | "lowercase" | "ascii";

const definitionsById = new Map<CardId, CardDefinition>(rawCardDefinitions.map(definition => [definition.id, definition]));

export const allCardDefinitions = [...rawCardDefinitions].sort((a, b) => a.id.localeCompare(b.id));
export const defaultCardLoadout = [...rawDefaultLoadout].sort((a, b) => a.localeCompare(b));

export function cardLetterCase(id: CardId): CardLetterCase {
  if (!/^[A-Za-z]$/.test(id)) return "ascii";
  return id === id.toUpperCase() ? "uppercase" : "lowercase";
}

export function getCardDefinition(id: CardId) {
  resolveImitator(id);
  return definitionsById.get(id) ?? allCardDefinitions[0];
}

export function hasCardDefinition(id: CardId) {
  resolveImitator(id);
  return definitionsById.has(id);
}

export function canImitateCard(definition: CardDefinition) {
  return !isImitatorCard(definition.id) && towerPriceTier(definition.cost) === "regular";
}

function resolveImitator(id: CardId) {
  if (definitionsById.has(id)) return;
  const target = imitatedCardId(id);
  const definition = target && definitionsById.get(target);
  if (!definition || !canImitateCard(definition)) return;
  definitionsById.set(id, { ...definition, id, cooldown: definition.cooldown * 2 });
}
