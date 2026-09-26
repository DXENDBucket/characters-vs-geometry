import { allCardDefinitions, getCardDefinition } from "../registry/cardDefinitions";
import type { CardId } from "../types";
import { battleBuilderIds, DEFAULT_BATTLE_PARTICIPANTS, type BattleOperationActor } from "./battleParticipants";
import { battlePolicyForActor, type BattlePolicy } from "./battlePolicy";
import { BattleLoadout, type CardDeadline } from "./battleLoadout";
import { TowerExtractionPool } from "./towerExtraction";
import { createTowerShifterCooldown, type TowerShifterCooldown } from "./towerShifterRules";
import type { LoadoutReselection } from "./loadoutReselection";
import { validPlayerCards, validateBattlePlayerLoadouts, type BattlePlayerLoadout } from "./battlePlayerConfig";
import { isLoadoutCardId } from "./cardEligibility";
import { cardCooldownKey } from "./cardIdentity";

export interface BattlePlayerResource {
  loadout: BattleLoadout;
  cardTime: number;
  extraction: TowerExtractionPool;
  shifter: TowerShifterCooldown;
  auto: { autoUpgradeEnabled: boolean; reserveChars: number };
}

export interface BattlePlayerResourceSnapshot {
  actorId: string;
  cardTime: number;
  cards: CardDeadline[];
  extraction: number;
  shifter: TowerShifterCooldown;
  reselection: ReturnType<LoadoutReselection["snapshot"]>;
  autoUpgradeEnabled: boolean;
  reserveChars: number;
}

const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
function fields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}

export function validateBattlePlayerResources(value: unknown, policy?: BattlePolicy,
  participants: readonly BattleOperationActor[] = DEFAULT_BATTLE_PARTICIPANTS): asserts value is BattlePlayerResourceSnapshot[] | undefined {
  if (policy?.resourceMode !== "individual") {
    if (value !== undefined) throw new Error("Unexpected player resources");
    return;
  }
  const actors = battleBuilderIds(participants);
  if (!actors.length || !Array.isArray(value) || value.length !== actors.length) throw new Error("Invalid player resources");
  for (const [index, entry] of value.entries()) {
    if (!fields(entry, ["actorId", "cardTime", "cards", "extraction", "shifter", "reselection", "autoUpgradeEnabled", "reserveChars"]) ||
      entry.actorId !== actors[index] || !nonnegative(entry.cardTime) || !nonnegative(entry.extraction) ||
      typeof entry.autoUpgradeEnabled !== "boolean" || !Number.isSafeInteger(entry.reserveChars) || !nonnegative(entry.reserveChars) ||
      !Array.isArray(entry.cards) || !Array.from(entry.cards).every(card => fields(card, ["id", "readyAt"]) && nonnegative(card.readyAt)) ||
      !validPlayerCards(entry.cards.map(card => card.id), battlePolicyForActor(policy, entry.actorId as string))) throw new Error("Invalid player resource cards");
    const shifter = entry.shifter, reselection = entry.reselection;
    if (!fields(shifter, ["readyAt", "cooldownStartedAt", "cooldownDuration"]) ||
      !nonnegative(shifter.readyAt) || !nonnegative(shifter.cooldownStartedAt) || !nonnegative(shifter.cooldownDuration) ||
      shifter.cooldownDuration <= 0 || shifter.readyAt < shifter.cooldownStartedAt ||
      !fields(reselection, ["readyAt", "cards"]) || !nonnegative(reselection.readyAt) || !Array.isArray(reselection.cards) ||
      reselection.cards.length > allCardDefinitions.length || !Array.from(reselection.cards).every(card => Array.isArray(card) && card.length === 2 &&
        typeof card[0] === "string" && (card[0] === "?" || isLoadoutCardId(card[0]) && cardCooldownKey(card[0]) === card[0]) && nonnegative(card[1])) ||
      new Set(reselection.cards.map(card => card[0])).size !== reselection.cards.length) throw new Error("Invalid player resource cooldowns");
  }
}

function createResource(cards: readonly CardId[]): BattlePlayerResource {
  return { loadout: new BattleLoadout(cards.map(getCardDefinition)), cardTime: 0,
    extraction: new TowerExtractionPool(), shifter: createTowerShifterCooldown(),
    auto: { autoUpgradeEnabled: true, reserveChars: 0 } };
}

// The shared resource object is the legacy world/session view, not a second copy.
export class BattlePlayerResources {
  private entries?: Map<string, BattlePlayerResource>;
  constructor(readonly shared: BattlePlayerResource, policy: BattlePolicy,
    participants: readonly BattleOperationActor[], loadouts?: readonly BattlePlayerLoadout[]) {
    validateBattlePlayerLoadouts(loadouts, policy, participants);
    if (policy.resourceMode !== "individual") return;
    const actors = battleBuilderIds(participants);
    if (!actors.length) throw new Error("Individual resources require a builder");
    this.entries = new Map(actors.map((id, index) => {
      const cards = loadouts?.[index].cards ?? shared.loadout.ids;
      if (!validPlayerCards(cards, policy)) throw new Error("Invalid initial player cards");
      return [id, createResource(cards)];
    }));
  }

  get individual() { return this.entries !== undefined; }
  get actorIds(): Iterable<string> { return this.entries?.keys() ?? []; }
  has(actorId: string) { return !this.entries || this.entries.has(actorId); }
  get(actorId?: string) { return actorId === undefined ? this.shared : this.entries?.get(actorId) ?? this.shared; }

  advanceClocks(delta: number, multiplier: (actorId: string) => number) {
    if (this.entries) for (const [id, resource] of this.entries) resource.cardTime += delta * multiplier(id);
  }

  snapshot(): BattlePlayerResourceSnapshot[] | undefined {
    return this.entries ? Array.from(this.entries, ([actorId, resource]) => ({ actorId, cardTime: resource.cardTime,
      cards: resource.loadout.deadlines(), extraction: resource.extraction.value, shifter: { ...resource.shifter },
      reselection: resource.loadout.reselection.snapshot(), ...resource.auto })) : undefined;
  }

  restore(value: BattlePlayerResourceSnapshot[] | undefined, policy: BattlePolicy, participants: readonly BattleOperationActor[]) {
    validateBattlePlayerResources(value, policy, participants);
    this.entries = value ? new Map(value.map(entry => {
      const resource = createResource(entry.cards.map(card => card.id));
      resource.cardTime = entry.cardTime; resource.loadout.restoreDeadlines(entry.cards);
      resource.loadout.reselection.restore(entry.reselection); resource.extraction.restore(entry.extraction);
      Object.assign(resource.shifter, entry.shifter);
      resource.auto.autoUpgradeEnabled = entry.autoUpgradeEnabled; resource.auto.reserveChars = entry.reserveChars;
      return [entry.actorId, resource];
    })) : undefined;
  }
}
