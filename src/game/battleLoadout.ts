import { CARD_SLOT_COUNT } from "../config";
import type { CardDefinition, CardId } from "../types";
import { deploymentCardId, towerPriceTier, uniqueLoadout } from "./cardIdentity";
import { LoadoutReselection } from "./loadoutReselection";

export interface BattleCardState {
  readonly definition: CardDefinition;
  readyAt: number;
}

export interface BattleCardClocks { battleTime: number; cardTime: number }
export interface CardDeadline { id: CardId; readyAt: number }

export function battleCardTime(definition: CardDefinition, clocks: BattleCardClocks) {
  return deploymentCardId(definition.id) !== "c" && towerPriceTier(definition.cost) === "regular" ? clocks.cardTime : clocks.battleTime;
}

// Slot order is authoritative: it also determines automatic-upgrade spending order.
export class BattleLoadout {
  readonly reselection = new LoadoutReselection();
  private slots: BattleCardState[];
  private index = new Map<CardId, BattleCardState>();
  private cardIds: CardId[];

  constructor(definitions: readonly CardDefinition[] = []) {
    this.slots = createSlots(definitions);
    this.cardIds = this.slots.map(card => card.definition.id);
    this.index = new Map(this.slots.map(card => [card.definition.id, card]));
  }

  get cards(): readonly BattleCardState[] { return this.slots; }
  get ids(): readonly CardId[] { return this.cardIds; }
  get byId(): ReadonlyMap<CardId, BattleCardState> { return this.index; }

  reselect(definitions: readonly CardDefinition[], clocks: BattleCardClocks) {
    const slots = createSlots(definitions);
    if (!slots.length) throw new Error("Empty battle loadout");
    if (!this.reselection.confirm(clocks.battleTime, this.slots,
      id => battleCardTime(this.index.get(id)!.definition, clocks))) return false;
    for (const card of slots) {
      card.readyAt = this.reselection.cardReadyAt(card.definition.id, battleCardTime(card.definition, clocks), clocks.battleTime);
    }
    this.slots = slots;
    this.cardIds = slots.map(card => card.definition.id);
    this.index = new Map(slots.map(card => [card.definition.id, card]));
    return true;
  }

  resetCooldowns(clocks: BattleCardClocks) {
    for (const card of this.slots) card.readyAt = battleCardTime(card.definition, clocks);
  }

  deadlines(): CardDeadline[] { return this.slots.map(card => ({ id: card.definition.id, readyAt: card.readyAt })); }

  restoreDeadlines(deadlines: readonly CardDeadline[]) {
    for (const { id, readyAt } of deadlines) {
      const card = this.index.get(id);
      if (card) card.readyAt = readyAt;
    }
  }
}

function createSlots(definitions: readonly CardDefinition[]): BattleCardState[] {
  const ids = Array.from(definitions, definition => definition?.id);
  if (ids.some(id => typeof id !== "string" || !id || id === "?") ||
      uniqueLoadout(ids, CARD_SLOT_COUNT).length !== ids.length) throw new Error("Invalid battle loadout");
  return definitions.map(definition => ({ definition, readyAt: 0 }));
}
