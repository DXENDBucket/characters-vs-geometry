import type { CardId } from "../types";

// The selected variant is part of the card identity, so saves and replay commands carry it too.
export function imitatedCardId(id: CardId): CardId | undefined {
  return id.startsWith("?") && id.length > 1 ? id.slice(1) as CardId : undefined;
}

export function deploymentCardId(id: CardId): CardId { return imitatedCardId(id) ?? id; }
export function isImitatorCard(id: CardId) { return id.startsWith("?"); }
export function cardCooldownKey(id: CardId): CardId { return isImitatorCard(id) ? "?" : id; }

export function uniqueLoadout(cards: readonly CardId[], limit: number) {
  const used = new Set<CardId>();
  return cards.filter(id => {
    const key = cardCooldownKey(id);
    if (id === "?" || used.has(key)) return false;
    used.add(key); return true;
  }).slice(0, limit);
}

export function towerPriceTier(cost: number): "regular" | "super" | "ultimate" {
  return cost <= 999 ? "regular" : cost < 10000 ? "super" : "ultimate";
}
