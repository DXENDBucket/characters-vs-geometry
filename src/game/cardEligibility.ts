import { cardDefinitions } from "../data/cards";
import type { CardId } from "../types";
import { imitatedCardId, isImitatorCard } from "./cardIdentity";

export function isLoadoutCardId(value: unknown): value is CardId {
  if (typeof value !== "string" || value === "?") return false;
  const id = value as CardId;
  const target = imitatedCardId(id);
  return cardDefinitions.some(card => card.id === (target ?? id) &&
    (!target || !isImitatorCard(card.id) && card.cost <= 999));
}
