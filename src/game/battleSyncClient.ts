import { BATTLE_PROTOCOL_VERSION, validBattleIntent, type BattleIntent, type BattleReceipt, type BattleRequest } from "./battleAuthority";
import type { RecordedBattleCommand } from "./battleCommands";
import { olderSyncCursor, sameSyncCursor, parseBoundedSyncText, decodeSyncMessage,
  type BattleSyncCursor, type BattleSyncInput, type BattleSyncRestoreSnapshot } from "./battleSyncProtocol";

export interface BattleSyncClientRuntime {
  restore(snapshot: BattleSyncRestoreSnapshot): void;
  follow(tick: number, commands: RecordedBattleCommand[]): void;
  checksum(): string;
  receipt?(receipt: BattleReceipt): void;
}

export type BattleInputStatus = "idle" | "connecting" | "synchronizing" | "ready" | "reconnecting" | "failed" | "closed";
export interface BattleInputPort {
  readonly ready: boolean;
  readonly busy: boolean;
  readonly status?: BattleInputStatus;
  subscribe?(listener: (status: BattleInputStatus) => void): () => void;
  request(intent: BattleIntent, completed?: (receipt: BattleReceipt) => void): boolean;
}

export class BattleSyncClient {
  private battleId?: string;
  private stream = 0;
  private cursor?: BattleSyncCursor;
  private baseSequence = 0;
  private nextRequest = 0;
  private pending?: BattleRequest;
  private completed?: (receipt: BattleReceipt) => void;
  private send?: (message: BattleSyncInput) => void;
  private synchronized = false;
  private resyncRequested = false;

  constructor(private readonly runtime: BattleSyncClientRuntime) {}
  get ready() { return this.synchronized && !!this.send; }
  get busy() { return !!this.pending; }
  get pendingRequest() { return this.pending ? structuredClone(this.pending) : undefined; }
  get position() { return this.cursor ? { ...this.cursor } : undefined; }

  connect(send: (message: BattleSyncInput) => void) {
    this.send = send; this.synchronized = false; this.resyncRequested = false;
  }
  disconnect() { this.send = undefined; this.synchronized = false; this.resyncRequested = false; }
  dispose() { this.disconnect(); this.pending = undefined; this.completed = undefined; }

  private transmit(message: BattleSyncInput) {
    try { this.send?.(message); }
    catch { this.disconnect(); }
  }

  request(intent: BattleIntent, completed?: (receipt: BattleReceipt) => void) {
    if (!this.ready || this.pending || !validBattleIntent(intent) || !this.battleId) return false;
    this.pending = { version: BATTLE_PROTOCOL_VERSION, battleId: this.battleId, sequence: this.nextRequest, intent: structuredClone(intent) };
    this.completed = completed;
    this.retry(); return true;
  }

  retry() {
    if (!this.synchronized) { this.resyncRequested = false; this.resync(); return; }
    if (this.ready && this.pending) this.transmit({ type: "request", stream: this.stream, request: structuredClone(this.pending) });
  }

  resync() {
    this.synchronized = false;
    if (this.send && this.cursor && !this.resyncRequested) {
      this.resyncRequested = true; this.transmit({ type: "resync", stream: this.stream });
    }
  }

  receiveText(text: string): "applied" | "ignored" | "invalid" | "resync" {
    if (!this.send) return "ignored";
    let message: ReturnType<typeof decodeSyncMessage>;
    try { message = decodeSyncMessage(parseBoundedSyncText(text)); } catch { return "invalid"; }
    if (message.type === "snapshot") {
      if (this.battleId && message.battleId !== this.battleId) return "invalid";
      if (message.stream <= this.stream) return "ignored";
      try {
        this.runtime.restore(message);
        if (this.runtime.checksum() !== message.checksum) throw new Error("Snapshot reconstruction differs");
      } catch { this.synchronized = false; return "invalid"; }
      this.battleId = message.battleId; this.stream = message.stream; this.cursor = { ...message.cursor };
      this.baseSequence = message.cursor.sequence; this.nextRequest = message.nextRequest;
      this.synchronized = true; this.resyncRequested = false;
      this.retry(); return "applied";
    }
    if (message.battleId !== this.battleId || message.stream !== this.stream || !this.cursor) return "ignored";
    if (message.type === "receipt") {
      const receipt = message.receipt;
      if (!this.pending || receipt.requestSequence !== this.pending.sequence) return "ignored";
      let completed: typeof this.completed;
      if (receipt.status === "executed" || !["busy", "gap"].includes(receipt.reason)) {
        this.pending = undefined;
        if (receipt.nextSequence !== null) this.nextRequest = receipt.nextSequence;
        completed = this.completed;
        this.completed = undefined;
      }
      this.runtime.receipt?.(receipt);
      if (receipt.status === "rejected" && ["gap", "expired", "conflict", "wrongBattle", "faulted"].includes(receipt.reason)) this.resync();
      completed?.(receipt);
      return "applied";
    }
    if (!this.synchronized) return "ignored";
    if (olderSyncCursor(message.to, this.cursor)) {
      if (sameSyncCursor(message.to, this.cursor) && this.runtime.checksum() !== message.checksum) { this.resync(); return "resync"; }
      return "ignored";
    }
    if (!sameSyncCursor(message.from, this.cursor)) { this.resync(); return "resync"; }
    try {
      this.runtime.follow(message.to.tick, message.commands.map(entry => ({ ...entry, sequence: entry.sequence - this.baseSequence })));
      if (this.runtime.checksum() !== message.checksum) throw new Error("Battle checksum mismatch");
    } catch { this.resync(); return "resync"; }
    this.cursor = { ...message.to };
    return "applied";
  }
}
