import { CARD_SLOT_COUNT } from "../config";
import { allCardDefinitions, hasCardDefinition } from "../registry/cardDefinitions";
import type { CardId } from "../types";
import { imitatedCardId } from "./cardIdentity";
import { validBattleActorId, MAX_BATTLE_PARTICIPANTS } from "./battleParticipants";

export interface BattlePlayerPolicy {
  readonly actorId: string;
  readonly slotCount: number;
  readonly allowedCards: readonly CardId[];
  readonly reselectEnabled: boolean;
}

export interface BattlePolicy {
  readonly version: 1;
  readonly slotCount: number;
  readonly allowedCards: readonly CardId[];
  readonly reselectEnabled: boolean;
  readonly pauseOnLocalModal: boolean;
  readonly towerAccess?: "shared" | "owner";
  readonly walletMode?: "shared" | "individual";
  readonly resourceMode?: "shared" | "individual";
  readonly players?: readonly BattlePlayerPolicy[];
}

const nativeCards = new Set<string>(allCardDefinitions.map(card => card.id));
export function validBattlePolicy(value: unknown): value is BattlePolicy {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const data = value as Record<string, unknown>;
  const keys = ["version", "slotCount", "allowedCards", "reselectEnabled", "pauseOnLocalModal"];
  if (Object.hasOwn(data, "towerAccess")) keys.push("towerAccess");
  if (Object.hasOwn(data, "walletMode")) keys.push("walletMode");
  if (Object.hasOwn(data, "resourceMode")) keys.push("resourceMode");
  if (Object.hasOwn(data, "players")) keys.push("players");
  return Object.keys(data).length === keys.length && keys.every(key => Object.hasOwn(data, key)) && data.version === 1 &&
    (!Object.hasOwn(data, "towerAccess") || data.towerAccess === "shared" || data.towerAccess === "owner") &&
    (!Object.hasOwn(data, "walletMode") || data.walletMode === "shared" || data.walletMode === "individual" && data.towerAccess === "owner") &&
    (!Object.hasOwn(data, "resourceMode") || data.resourceMode === "shared" || data.resourceMode === "individual" && data.towerAccess === "owner") &&
    Number.isSafeInteger(data.slotCount) && (data.slotCount as number) >= 1 && (data.slotCount as number) <= CARD_SLOT_COUNT &&
    Array.isArray(data.allowedCards) && data.allowedCards.length > 0 && data.allowedCards.length <= nativeCards.size &&
    Array.from(data.allowedCards).every(id => typeof id === "string" && nativeCards.has(id)) &&
    new Set(data.allowedCards).size === data.allowedCards.length &&
    typeof data.reselectEnabled === "boolean" && typeof data.pauseOnLocalModal === "boolean" &&
    (!Object.hasOwn(data, "players") || data.resourceMode === "individual" && Array.isArray(data.players) &&
      data.players.length > 0 && data.players.length <= MAX_BATTLE_PARTICIPANTS &&
      data.players.every(p => p && Object.getPrototypeOf(p) === Object.prototype && Object.keys(p).length === 4 &&
        validBattleActorId(p.actorId) && Number.isSafeInteger(p.slotCount) && p.slotCount >= 1 && p.slotCount <= (data.slotCount as number) &&
        typeof p.reselectEnabled === "boolean" && Array.isArray(p.allowedCards) && p.allowedCards.length > 0 &&
        p.allowedCards.every((id: unknown) => (data.allowedCards as unknown[]).includes(id)) && new Set(p.allowedCards).size === p.allowedCards.length) &&
      new Set(data.players.map(p => p.actorId)).size === data.players.length);
}

export function copyBattlePolicy(value: BattlePolicy): BattlePolicy {
  if (!validBattlePolicy(value)) throw new Error("Invalid battle policy");
  return Object.freeze({ ...value, allowedCards: Object.freeze([...value.allowedCards].sort()),
    ...(value.players ? { players: Object.freeze(value.players.map(p => Object.freeze({ ...p,
      allowedCards: Object.freeze([...p.allowedCards].sort()) })).sort((a, b) => a.actorId < b.actorId ? -1 : 1)) } : {}) });
}

export function battlePolicyForActor(policy: BattlePolicy, actorId?: string): BattlePolicy {
  const player = policy.players?.find(p => p.actorId === actorId);
  if (!player) return policy;
  const { players: _players, ...base } = policy;
  return { ...base, slotCount: player.slotCount, allowedCards: player.allowedCards, reselectEnabled: player.reselectEnabled };
}

// Old recordings did not capture access restrictions; preserve their original permissive playback.
export const LEGACY_BATTLE_POLICY = copyBattlePolicy({ version: 1, slotCount: CARD_SLOT_COUNT,
  allowedCards: allCardDefinitions.map(card => card.id), reselectEnabled: true, pauseOnLocalModal: true });

export function battleCardAllowed(policy: BattlePolicy, id: CardId) {
  if (!hasCardDefinition(id)) return false;
  const target = imitatedCardId(id);
  return target ? policy.allowedCards.includes("?") && policy.allowedCards.includes(target) : policy.allowedCards.includes(id);
}

export function sameBattlePolicy(a: BattlePolicy, b: BattlePolicy) {
  return a.version === b.version && a.slotCount === b.slotCount && a.reselectEnabled === b.reselectEnabled &&
    (a.towerAccess ?? "shared") === (b.towerAccess ?? "shared") &&
    (a.walletMode ?? "shared") === (b.walletMode ?? "shared") &&
    (a.resourceMode ?? "shared") === (b.resourceMode ?? "shared") &&
    a.pauseOnLocalModal === b.pauseOnLocalModal && a.allowedCards.length === b.allowedCards.length &&
    a.allowedCards.every(id => b.allowedCards.includes(id)) &&
    (a.players?.length ?? 0) === (b.players?.length ?? 0) && (a.players ?? []).every(p => {
      const other = b.players?.find(q => q.actorId === p.actorId);
      return !!other && p.slotCount === other.slotCount && p.reselectEnabled === other.reselectEnabled &&
        p.allowedCards.length === other.allowedCards.length && p.allowedCards.every(id => other.allowedCards.includes(id));
    });
}
