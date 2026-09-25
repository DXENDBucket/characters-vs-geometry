import { DEFAULT_GAME_SPEED, GAME_SPEED_MAX, GAME_SPEED_MIN } from "../config";
import type { CardId } from "../types";
import { cardCooldownKey } from "./cardIdentity";
import { validTutorialInteraction, type TutorialInteraction } from "./tutorialInteraction";
import { validBattleActorId, validBattlePoint, type BattleOperationActor, type BattleOperationPermission,
  type BattleOperationResult, type BattlePoint } from "./battleOperations";

export interface BattleControlState {
  paused: boolean;
  speed: number;
  autoUpgradeEnabled: boolean;
  reserveChars: number;
  debugEnabled: boolean;
}

export function createBattleControlState(): BattleControlState {
  return { paused: false, speed: DEFAULT_GAME_SPEED, autoUpgradeEnabled: true, reserveChars: 0, debugEnabled: false };
}

export type BattleControl =
  | { type: "pause"; paused: boolean }
  | { type: "speed"; speed: number }
  | { type: "autoUpgradeEnabled"; enabled: boolean }
  | { type: "reserve"; value: number }
  | { type: "reselect"; cards: CardId[] }
  | { type: "debugMode"; enabled: boolean }
  | { type: "debugChars" }
  | { type: "debugDamage"; mode: "normal" | "super"; point: BattlePoint }
  | { type: "tutorialAdvance" }
  | { type: "tutorialInput"; input: TutorialInteraction };

const permission: Record<BattleControl["type"], BattleOperationPermission> = {
  pause: "time", speed: "time", autoUpgradeEnabled: "settings", reserve: "settings",
  reselect: "loadout", debugMode: "debug", debugChars: "debug", debugDamage: "debug", tutorialAdvance: "tutorial", tutorialInput: "tutorial"
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype;
const fields = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
export const validReserveChars = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function copyBattleControlState(value: unknown): BattleControlState {
  if (!record(value) || !fields(value, ["paused", "speed", "autoUpgradeEnabled", "reserveChars", "debugEnabled"]) ||
      typeof value.paused !== "boolean" || typeof value.autoUpgradeEnabled !== "boolean" ||
      typeof value.debugEnabled !== "boolean" || !validReserveChars(value.reserveChars) ||
      !validBattleControl({ type: "speed", speed: value.speed })) throw new Error("Invalid battle controls");
  return { paused: value.paused, speed: value.speed as number, autoUpgradeEnabled: value.autoUpgradeEnabled,
    reserveChars: value.reserveChars, debugEnabled: value.debugEnabled };
}

export function validBattleControl(value: unknown): value is BattleControl {
  if (!record(value)) return false;
  switch (value.type) {
    case "pause": return fields(value, ["type", "paused"]) && typeof value.paused === "boolean";
    case "speed": return fields(value, ["type", "speed"]) && typeof value.speed === "number" &&
      value.speed >= GAME_SPEED_MIN && value.speed <= GAME_SPEED_MAX && Number.isInteger(value.speed * 10);
    case "autoUpgradeEnabled": case "debugMode": return fields(value, ["type", "enabled"]) && typeof value.enabled === "boolean";
    case "reserve": return fields(value, ["type", "value"]) && validReserveChars(value.value);
    case "reselect": return fields(value, ["type", "cards"]) && Array.isArray(value.cards) &&
      value.cards.length > 0 && value.cards.length <= 10 && Array.from(value.cards).every(id =>
        typeof id === "string" && id.length > 0 && id.length <= 16 && id !== "?") &&
      new Set((value.cards as CardId[]).map(cardCooldownKey)).size === value.cards.length;
    case "debugChars": case "tutorialAdvance": return fields(value, ["type"]);
    case "tutorialInput": return fields(value, ["type", "input"]) && validTutorialInteraction(value.input);
    case "debugDamage": return fields(value, ["type", "mode", "point"]) &&
      (value.mode === "normal" || value.mode === "super") && validBattlePoint(value.point);
    default: return false;
  }
}

// Host-supplied policy and effects. No local selection, focus, progress storage or wall clock is read here.
export interface BattleControlRuntime {
  state: BattleControlState;
  ended: boolean;
  actor(id: string): BattleOperationActor | undefined;
  authorize(actor: BattleOperationActor, control: BattleControl): boolean;
  slotCount: number;
  cardAllowed(id: CardId): boolean;
  reselectAvailable: boolean;
  reselectReady: boolean;
  reselect(cards: readonly CardId[]): boolean;
  tutorialAvailable: boolean;
  tutorialAdvance(): void;
  tutorialInput(input: TutorialInteraction): BattleOperationResult;
  pauseChanged(): void;
  speedChanged(): void;
  autoUpgradeChanged(): void;
  debugChanged(): void;
  debugChars(): void;
  debugDamage(point: BattlePoint, mode: "normal" | "super"): void;
}

export function executeBattleControl(actorId: string, value: unknown, runtime: BattleControlRuntime): BattleOperationResult {
  if (!validBattleActorId(actorId) || !validBattleControl(value)) return "invalid";
  if (runtime.ended) return "unavailable";
  const actor = runtime.actor(actorId);
  if (!actor || actor.id !== actorId || !actor.permissions.includes(permission[value.type]) || !runtime.authorize(actor, value)) return "forbidden";
  const state = runtime.state;
  switch (value.type) {
    case "pause":
      if (state.paused !== value.paused) { state.paused = value.paused; runtime.pauseChanged(); }
      break;
    case "speed":
      if (state.speed !== value.speed) { state.speed = value.speed; runtime.speedChanged(); }
      break;
    case "autoUpgradeEnabled":
      if (state.autoUpgradeEnabled !== value.enabled) { state.autoUpgradeEnabled = value.enabled; runtime.autoUpgradeChanged(); }
      break;
    case "reserve":
      if (state.reserveChars !== value.value) { state.reserveChars = value.value; runtime.autoUpgradeChanged(); }
      break;
    case "reselect":
      if (!runtime.reselectAvailable || value.cards.length > runtime.slotCount || value.cards.some(id => !runtime.cardAllowed(id))) return "forbidden";
      if (!runtime.reselectReady) return "cooldown";
      return runtime.reselect(value.cards) ? "handled" : "unavailable";
    case "debugMode":
      if (state.debugEnabled !== value.enabled) { state.debugEnabled = value.enabled; runtime.debugChanged(); }
      break;
    case "debugChars":
      if (!state.debugEnabled) return "forbidden";
      runtime.debugChars(); break;
    case "debugDamage":
      if (!state.debugEnabled) return "forbidden";
      runtime.debugDamage(value.point, value.mode); break;
    case "tutorialAdvance":
      if (!runtime.tutorialAvailable) return "unavailable";
      runtime.tutorialAdvance(); break;
    case "tutorialInput":
      if (!runtime.tutorialAvailable) return "unavailable";
      return runtime.tutorialInput(value.input);
  }
  return "handled";
}
