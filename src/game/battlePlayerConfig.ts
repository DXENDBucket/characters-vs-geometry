import type { CardId } from "../types";
import { battleBuilderIds, DEFAULT_BATTLE_PARTICIPANTS, type BattleOperationActor } from "./battleParticipants";
import { battleCardAllowed, battlePolicyForActor, type BattlePolicy } from "./battlePolicy";
import { uniqueLoadout } from "./cardIdentity";
import { isLoadoutCardId } from "./cardEligibility";

export interface BattlePlayerLoadout { readonly actorId: string; readonly cards: readonly CardId[] }

export function validPlayerCards(value: unknown, policy: BattlePolicy): value is CardId[] {
  return Array.isArray(value) && value.length > 0 && value.length <= policy.slotCount &&
    Array.from(value).every(id => typeof id === "string" && isLoadoutCardId(id) && battleCardAllowed(policy, id)) &&
    uniqueLoadout(value, policy.slotCount).length === value.length;
}

export function validateBattlePlayerLoadouts(value: unknown, policy?: BattlePolicy,
  participants: readonly BattleOperationActor[] = DEFAULT_BATTLE_PARTICIPANTS): asserts value is readonly BattlePlayerLoadout[] | undefined {
  if (value === undefined) return;
  const actors = battleBuilderIds(participants);
  if (policy?.resourceMode !== "individual" || !actors.length || !Array.isArray(value) || value.length !== actors.length ||
    !Array.from(value).every((entry, index) => entry && Object.getPrototypeOf(entry) === Object.prototype &&
      Object.keys(entry).length === 2 && Object.hasOwn(entry, "actorId") && Object.hasOwn(entry, "cards") &&
      entry.actorId === actors[index] && validPlayerCards(entry.cards, battlePolicyForActor(policy, entry.actorId))) ||
    policy?.players && (policy.players.length !== actors.length || policy.players.some(p => !actors.includes(p.actorId)))) {
    throw new Error("Invalid player loadouts");
  }
}
