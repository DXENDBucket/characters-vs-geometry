import type { CardId } from "../types";

export const RESELECT_UNLOCK_LEVEL = "2-4";
export const RESELECT_COOLDOWN = 240_000;

export class LoadoutReselection {
  private readyAt = 0;
  private readonly cardReadyTimes = new Map<CardId, number>();

  isReady(battleTime: number) {
    return battleTime >= this.readyAt;
  }

  readyRatio(battleTime: number) {
    return Math.max(0, Math.min(1, 1 - (this.readyAt - battleTime) / RESELECT_COOLDOWN));
  }

  confirm(battleTime: number, cards: ReadonlyArray<{ definition: { id: CardId }; readyAt: number }>) {
    if (!this.isReady(battleTime)) return false;
    // Keep deadlines in each card's original clock, even while it is out of the loadout.
    for (const card of cards) this.cardReadyTimes.set(card.definition.id, card.readyAt);
    this.readyAt = battleTime + RESELECT_COOLDOWN;
    return true;
  }

  cardReadyAt(id: CardId) {
    return this.cardReadyTimes.get(id) ?? 0;
  }
}
