import type { CardId } from "../types";
import { cardCooldownKey } from "./cardIdentity";

export const RESELECT_UNLOCK_LEVEL = "2-4";
export const RESELECT_COOLDOWN = 240_000;

export class LoadoutReselection {
  private readyAt = RESELECT_COOLDOWN;
  private readonly cardReadyTimes = new Map<CardId, number>();

  snapshot() { return { readyAt: this.readyAt, cards: [...this.cardReadyTimes] }; }

  restore(state: ReturnType<LoadoutReselection["snapshot"]>) {
    this.readyAt = state.readyAt;
    this.cardReadyTimes.clear();
    for (const [id, time] of state.cards) this.cardReadyTimes.set(id, time);
  }

  isReady(battleTime: number) {
    return battleTime >= this.readyAt;
  }

  readyRatio(battleTime: number) {
    return Math.max(0, Math.min(1, 1 - (this.readyAt - battleTime) / RESELECT_COOLDOWN));
  }

  confirm(battleTime: number, cards: ReadonlyArray<{ definition: { id: CardId }; readyAt: number }>,
    cardTimeFor: (id: CardId) => number = () => battleTime) {
    if (!this.isReady(battleTime)) return false;
    // Keep deadlines in each card's original clock, even while it is out of the loadout.
    for (const card of cards) {
      const key = cardCooldownKey(card.definition.id);
      // An imitator can switch clock domains by changing its target (for example c -> A).
      this.cardReadyTimes.set(key, key === "?"
        ? battleTime + Math.max(0, card.readyAt - cardTimeFor(card.definition.id)) : card.readyAt);
    }
    this.readyAt = battleTime + RESELECT_COOLDOWN;
    return true;
  }

  cardReadyAt(id: CardId, cardTime = 0, battleTime = 0) {
    const key = cardCooldownKey(id), deadline = this.cardReadyTimes.get(key) ?? 0;
    return key === "?" ? cardTime + Math.max(0, deadline - battleTime) : deadline;
  }
}
