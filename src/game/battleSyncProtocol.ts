import { DIFFICULTY_VERSION } from "../config";
import { levelConfigs } from "../data/levels";
import { isLoadoutCardId } from "./cardEligibility";
import { uniqueLoadout } from "./cardIdentity";
import { BATTLE_PROTOCOL_VERSION, validBattleIntent, type BattleReceipt, type BattleRequest } from "./battleAuthority";
import { BATTLE_RULES_VERSION } from "./battleSimulation";
import { MAX_REPLICA_FRAME_COMMANDS, MAX_REPLICA_FRAME_TICKS } from "./battleSession";
import { validateReplay, type BattleReplay, type RecordedBattleCommand } from "./battleCommands";
import { validBattleActorId, sameBattleParticipants, copyBattleParticipants } from "./battleParticipants";
import { sameBattlePolicy } from "./battlePolicy";
import { decodeSaveGraph } from "./saveGraph";
import { validateBattleSave } from "./validateBattleSave";
import { battleChecksum } from "./battleChecksum";
import type { BattleSaveState } from "./battleSaveState";

export const MAX_BATTLE_SYNC_BYTES = 16 * 1024 * 1024;
export interface BattleSyncCursor { tick: number; sequence: number }
interface Envelope { version: typeof BATTLE_PROTOCOL_VERSION; battleId: string; stream: number }
export interface BattleSyncSnapshot extends Envelope {
  type: "snapshot";
  cursor: BattleSyncCursor;
  nextRequest: number;
  replay: BattleReplay;
  checksum: string;
}
export interface BattleSyncFrame extends Envelope {
  type: "frame";
  from: BattleSyncCursor;
  to: BattleSyncCursor;
  commands: RecordedBattleCommand[];
  checksum: string;
}
export interface BattleSyncReceipt extends Envelope { type: "receipt"; receipt: BattleReceipt }
export type BattleSyncMessage = BattleSyncSnapshot | BattleSyncFrame | BattleSyncReceipt;
export type BattleSyncInput = { type: "request"; stream: number; request: BattleRequest } | { type: "resync"; stream: number };

export const exactSyncFields = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  !!value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const natural = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < Number.MAX_SAFE_INTEGER;
const cursor = (value: unknown): value is BattleSyncCursor => exactSyncFields(value, ["tick", "sequence"]) && natural(value.tick) && natural(value.sequence);
const checksum = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}$/.test(value);
export const sameSyncCursor = (a: BattleSyncCursor, b: BattleSyncCursor) => a.tick === b.tick && a.sequence === b.sequence;
export const olderSyncCursor = (a: BattleSyncCursor, b: BattleSyncCursor) => a.tick <= b.tick && a.sequence <= b.sequence;

export function parseBoundedSyncText(text: string, maxBytes = MAX_BATTLE_SYNC_BYTES): unknown {
  if (typeof text !== "string" || text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error("Oversized battle message");
  }
  return JSON.parse(text);
}

export function validateSyncMessage(value: unknown): asserts value is BattleSyncMessage {
  const common = ["version", "battleId", "stream", "type"];
  const message = value as BattleSyncMessage;
  if (!message || message.version !== BATTLE_PROTOCOL_VERSION || !validBattleActorId(message.battleId) ||
      !natural(message.stream) || message.stream === 0) throw new Error("Invalid battle sync envelope");
  if (message.type === "snapshot") {
    if (!exactSyncFields(value, [...common, "cursor", "nextRequest", "replay", "checksum"]) || !cursor(message.cursor) ||
        !natural(message.nextRequest) || !checksum(message.checksum)) throw new Error("Invalid battle snapshot envelope");
    const replay = message.replay;
    validateReplay(replay);
    if (replay.difficultyVersion !== DIFFICULTY_VERSION || !Object.hasOwn(levelConfigs, replay.levelId) ||
        replay.commands.length || !replay.checkpoint || !replay.policy || !replay.selectedCards.every(isLoadoutCardId) ||
        uniqueLoadout(replay.selectedCards, 10).length !== replay.selectedCards.length) throw new Error("Invalid sync battle configuration");
    const state = decodeSaveGraph<BattleSaveState>(replay.checkpoint, () => ({}));
    const simulation = state?.simulation;
    if (!state?.lifecycle || !state.entityIds || !simulation?.controls || !simulation.policy ||
        simulation.version !== BATTLE_RULES_VERSION || simulation.clock.tick !== message.cursor.tick || replay.endTick !== message.cursor.tick ||
        !sameBattlePolicy(replay.policy, simulation.policy) ||
        !sameBattleParticipants(copyBattleParticipants(replay.participants), copyBattleParticipants(simulation.participants))) {
      throw new Error("Inconsistent sync checkpoint");
    }
    validateBattleSave(replay.checkpoint, state.wave, levelConfigs[replay.levelId].bossKind);
    if (battleChecksum(state) !== message.checksum) throw new Error("Corrupted sync checkpoint");
    return;
  }
  if (message.type === "frame") {
    if (!exactSyncFields(value, [...common, "from", "to", "commands", "checksum"]) || !cursor(message.from) || !cursor(message.to) ||
        !olderSyncCursor(message.from, message.to) || message.to.tick - message.from.tick > MAX_REPLICA_FRAME_TICKS ||
        !Array.isArray(message.commands) || message.commands.length > MAX_REPLICA_FRAME_COMMANDS ||
        message.to.sequence - message.from.sequence !== message.commands.length || !checksum(message.checksum)) throw new Error("Invalid battle frame");
    let tick = message.from.tick;
    for (const [index, entry] of message.commands.entries()) {
      const command = entry?.command;
      if (!exactSyncFields(entry, ["tick", "sequence", "command"]) || !natural(entry.tick) || entry.tick < tick ||
          entry.tick > message.to.tick || entry.sequence !== message.from.sequence + index || !command ||
          !exactSyncFields(command, command.type === "operation" ? ["type", "actorId", "operation"] : ["type", "actorId", "control"]) ||
          !("actorId" in command) || !validBattleActorId(command.actorId)) throw new Error("Invalid synchronized command");
      const { actorId: _actor, ...intent } = command;
      if (!validBattleIntent(intent)) throw new Error("Invalid synchronized intent");
      tick = entry.tick;
    }
    return;
  }
  if (message.type === "receipt") {
    const receipt = message.receipt;
    const receiptKeys = ["version", "battleId", "requestSequence", "nextSequence", "status"];
    if (!exactSyncFields(value, [...common, "receipt"]) || !receipt || receipt.version !== BATTLE_PROTOCOL_VERSION ||
        receipt.battleId !== message.battleId || !(receipt.requestSequence === null || natural(receipt.requestSequence)) ||
        !(receipt.nextSequence === null || natural(receipt.nextSequence))) throw new Error("Invalid sync receipt");
    if (receipt.status === "executed" && exactSyncFields(receipt, [...receiptKeys, "tick", "commandSequence", "result"]) &&
        natural(receipt.tick) && natural(receipt.commandSequence) && receipt.requestSequence !== null &&
        receipt.nextSequence === receipt.requestSequence + 1 &&
        ["deployed", "handled", "moved", "invalid", "forbidden", "unavailable", "stale", "occupied", "cooldown", "noChars", "empty"].includes(receipt.result)) return;
    if (receipt.status === "rejected" && exactSyncFields(receipt, [...receiptKeys, "reason"]) &&
        ["invalid", "forbidden", "wrongBattle", "gap", "expired", "conflict", "busy", "unavailable", "faulted"].includes(receipt.reason)) return;
  }
  throw new Error("Invalid battle sync message");
}
