import type { BattleCommand } from "./battleCommands";
import { validBattleControl, type BattleControl } from "./battleControls";
import { validBattleOperation, type BattleOperation, type BattleOperationResult } from "./battleOperations";
import { validBattleActorId } from "./battleParticipants";
import type { BattleSession } from "./battleSession";
import { BATTLE_RULES_VERSION } from "./battleSimulation";

export const BATTLE_PROTOCOL_VERSION = 3;
export const MAX_BATTLE_REQUEST_BYTES = 65536;
export const BATTLE_RECEIPT_WINDOW = 64;
export const MAX_BATTLE_REQUESTS_PER_WINDOW = 128;
export const BATTLE_REQUEST_WINDOW_MS = 1000;
export type BattleIntent = { type: "operation"; operation: BattleOperation } | { type: "control"; control: BattleControl };
export interface BattleRequest {
  version: typeof BATTLE_PROTOCOL_VERSION;
  battleId: string;
  sequence: number;
  intent: BattleIntent;
}
export interface BattleAuthorityHello {
  version: typeof BATTLE_PROTOCOL_VERSION;
  rulesVersion: typeof BATTLE_RULES_VERSION;
  battleId: string;
  tick: number;
  nextSequence: number;
  oldestReceipt: number;
}
export type SemanticBattleCommand = Extract<BattleCommand, { type: "operation" | "control" }>;
type Rejection = "invalid" | "forbidden" | "wrongBattle" | "gap" | "expired" | "conflict" | "busy" | "unavailable" | "faulted";
export type BattleReceipt = {
  version: typeof BATTLE_PROTOCOL_VERSION;
  battleId: string;
  requestSequence: number | null;
  nextSequence: number | null;
} & ({ status: "executed"; tick: number; commandSequence: number; result: BattleOperationResult } |
  { status: "rejected"; reason: Rejection });

declare const channelBrand: unique symbol;
export interface BattleChannel { readonly [channelBrand]: true }
export interface BattleAuthorityRuntime {
  available(): boolean;
  // Host ingress time, independent of paused/scaled simulation time. Never used by combat or replay.
  inputTime(): number;
  execute(command: SemanticBattleCommand): BattleOperationResult;
}
interface ActorRequests {
  next: number;
  windowStartedAt: number;
  count: number;
  receipts: Map<number, { intent: string; receipt: BattleReceipt }>;
}
const fields = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  !!value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
export function validBattleIntent(value: unknown): value is BattleIntent {
  return fields(value, ["type", "operation"]) && value.type === "operation" && validBattleOperation(value.operation) ||
    fields(value, ["type", "control"]) && value.type === "control" && validBattleControl(value.control);
}
export function validBattleRequest(value: unknown): value is BattleRequest {
  return fields(value, ["version", "battleId", "sequence", "intent"]) && value.version === BATTLE_PROTOCOL_VERSION &&
    validBattleActorId(value.battleId) && Number.isSafeInteger(value.sequence) && (value.sequence as number) >= 0 &&
    (value.sequence as number) < Number.MAX_SAFE_INTEGER && validBattleIntent(value.intent);
}
// Only called after the bounded schema check; property order is not part of request identity.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

// Host-only object. The transport authenticates a peer before calling connect;
// neither this object nor its opaque channel handles should be exposed as RPCs.
export class BattleAuthority {
  private readonly channels = new WeakMap<BattleChannel, string>();
  private readonly active = new Map<string, BattleChannel>();
  private readonly actors = new Map<string, ActorRequests>();
  private readonly epoch: number;
  private closed = false;
  private failed = false;
  private executing = false;

  constructor(readonly battleId: string, private readonly session: BattleSession, private readonly runtime: BattleAuthorityRuntime) {
    if (!validBattleActorId(battleId)) throw new Error("Invalid battle authority ID");
    this.epoch = session.commandEpoch;
  }

  connect(actorId: string): BattleChannel | undefined {
    if (this.unavailable() || !this.session.actor(actorId)) return undefined;
    const previous = this.active.get(actorId);
    if (previous) this.disconnect(previous);
    const channel = Object.freeze({}) as BattleChannel;
    this.channels.set(channel, actorId); this.active.set(actorId, channel);
    return channel;
  }

  disconnect(channel: BattleChannel) {
    const actor = this.channels.get(channel);
    if (actor !== undefined && this.active.get(actor) === channel) this.active.delete(actor);
    this.channels.delete(channel);
  }

  describe(channel: BattleChannel): BattleAuthorityHello | undefined {
    const actor = this.channels.get(channel);
    if (actor === undefined || this.active.get(actor) !== channel || this.unavailable() || this.failed) return undefined;
    const nextSequence = this.actors.get(actor)?.next ?? 0;
    return { version: BATTLE_PROTOCOL_VERSION, rulesVersion: BATTLE_RULES_VERSION, battleId: this.battleId,
      tick: this.session.clock.tick, nextSequence, oldestReceipt: Math.max(0, nextSequence - BATTLE_RECEIPT_WINDOW) };
  }

  close() { this.closed = true; this.active.clear(); this.actors.clear(); }

  receiveText(channel: BattleChannel, text: string): BattleReceipt {
    if (typeof text !== "string" || text.length > MAX_BATTLE_REQUEST_BYTES ||
        new TextEncoder().encode(text).byteLength > MAX_BATTLE_REQUEST_BYTES) return this.reject("invalid");
    let request: unknown;
    try { request = JSON.parse(text); } catch { return this.reject("invalid"); }
    return this.receive(channel, request);
  }

  receive(channel: BattleChannel, request: unknown): BattleReceipt {
    const actor = this.channels.get(channel);
    if (actor === undefined || this.active.get(actor) !== channel) return this.reject("forbidden");
    return this.receiveActor(actor, request, true);
  }

  // Single-player and trusted host callers use the same validation, ordering and execution path.
  submitTrusted(actorId: string, intent: BattleIntent): BattleOperationResult {
    const receipt = this.receiveActor(actorId, { version: BATTLE_PROTOCOL_VERSION, battleId: this.battleId,
      sequence: this.actors.get(actorId)?.next ?? 0, intent }, false);
    return receipt.status === "executed" ? receipt.result : receipt.reason === "invalid" ? "invalid" :
      receipt.reason === "forbidden" ? "forbidden" : "unavailable";
  }

  private unavailable() {
    return this.closed || this.session.commandEpoch !== this.epoch || !!this.session.playback || this.session.replica;
  }

  private reject(reason: Rejection, sequence: number | null = null, next: number | null = null): BattleReceipt {
    return { version: BATTLE_PROTOCOL_VERSION, battleId: this.battleId, requestSequence: sequence, nextSequence: next,
      status: "rejected", reason };
  }

  private receiveActor(actorId: string, value: unknown, rateLimited: boolean): BattleReceipt {
    if (!validBattleActorId(actorId) || !this.session.actor(actorId)) return this.reject("forbidden");
    if (!validBattleRequest(value)) return this.reject("invalid");
    const { sequence, intent } = value;
    if (value.battleId !== this.battleId) return this.reject("wrongBattle", sequence);
    if (this.unavailable()) return this.reject("unavailable", sequence);
    if (this.failed) return this.reject("faulted", sequence);
    const state = this.actors.get(actorId) ?? { next: 0, windowStartedAt: -1, count: 0, receipts: new Map() };
    this.actors.set(actorId, state);
    const identity = canonical(intent);
    if (sequence < state.next) {
      const previous = state.receipts.get(sequence);
      if (!previous) return this.reject("expired", sequence, state.next);
      return previous.intent === identity ? structuredClone(previous.receipt) : this.reject("conflict", sequence, state.next);
    }
    if (sequence > state.next) return this.reject("gap", sequence, state.next);
    if (this.executing || this.session.executingCommand) return this.reject("busy", sequence, state.next);
    if (!this.runtime.available()) return this.reject("unavailable", sequence, state.next);
    const tick = this.session.clock.tick;
    if (rateLimited) {
      const now = this.runtime.inputTime();
      if (!Number.isFinite(now) || now < 0 || now < state.windowStartedAt) throw new Error("Invalid authority ingress clock");
      if (state.windowStartedAt < 0 || now - state.windowStartedAt >= BATTLE_REQUEST_WINDOW_MS) {
        state.windowStartedAt = now; state.count = 0;
      }
      if (state.count >= MAX_BATTLE_REQUESTS_PER_WINDOW) return this.reject("busy", sequence, state.next);
    }
    const commandSequence = this.session.nextCommandSequence;
    let result: BattleOperationResult = "unavailable";
    this.executing = true;
    try {
      const submitted = this.session.submit({ ...structuredClone(intent), actorId }, command => {
        result = this.runtime.execute(command as SemanticBattleCommand);
      });
      if (!submitted) return this.reject("unavailable", sequence, state.next);
    } catch (error) {
      // A throwing live handler may already have changed the world. Do not retry it.
      this.failed = true;
      throw error;
    } finally { this.executing = false; }
    state.next++;
    if (rateLimited) state.count++;
    const receipt: BattleReceipt = { version: BATTLE_PROTOCOL_VERSION, battleId: this.battleId,
      requestSequence: sequence, nextSequence: state.next, status: "executed", tick, commandSequence, result };
    state.receipts.set(sequence, { intent: identity, receipt });
    if (state.receipts.size > BATTLE_RECEIPT_WINDOW) state.receipts.delete(state.receipts.keys().next().value!);
    return structuredClone(receipt);
  }
}
