import { BATTLE_PROTOCOL_VERSION, validBattleIntent, type BattleIntent, type BattleReceipt, type BattleRequest } from "./battleAuthority";
import type { RecordedBattleCommand } from "./battleCommands";
import { olderSyncCursor, sameSyncCursor, parseBoundedSyncText, decodeSyncMessage,
  type BattleSyncCursor, type BattleSyncInput, type BattleSyncRestoreSnapshot, type BattleSyncFrame, type DecodedBattleSyncMessage } from "./battleSyncProtocol";
import { MAX_REPLICA_FRAME_TICKS } from "./battleSession";

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
export type BattleSyncResult = "applied" | "ignored" | "invalid" | "resync" | "pending";

export class BattleSyncClient {
  private battleId?: string;
  private stream = 0;
  private cursor?: BattleSyncCursor;
  private baseSequence = 0;
  private nextRequest = 0;
  private pending?: BattleRequest;
  private deferredRequest = false;
  private completed?: (receipt: BattleReceipt) => void;
  private send?: (message: BattleSyncInput) => void;
  private synchronized = false;
  private resyncRequested = false;
  private frame?: { message: BattleSyncFrame; tick: number; index: number };
  private epoch = 0;
  // A snapshot replaces state without replacing its sender; current-link send failures still matter.
  private transportEpoch = 0;

  constructor(private readonly runtime: BattleSyncClientRuntime, private readonly frameSliceTicks?: number) {
    if (frameSliceTicks !== undefined && (!Number.isSafeInteger(frameSliceTicks) || frameSliceTicks < 1 ||
      frameSliceTicks > MAX_REPLICA_FRAME_TICKS)) throw new Error("Invalid replica slice size");
  }
  get applying() { return this.frame !== undefined; }
  // A validated baseline can accept one intent while a newer frame is still applying.
  get acceptingInput() { return this.synchronized && !!this.send; }
  get inputPending() { return !!this.pending; }
  get ready() { return this.acceptingInput && !this.applying; }
  get busy() { return !!this.pending || this.applying; }
  get pendingRequest() { return this.pending ? structuredClone(this.pending) : undefined; }
  get position() { return this.cursor ? { ...this.cursor } : undefined; }

  exceedsCatchUpLimit(message: DecodedBattleSyncMessage, ticks: number) {
    return ticks > 0 && this.acceptingInput && this.cursor !== undefined && message.type === "frame" &&
      message.battleId === this.battleId && message.stream === this.stream &&
      message.to.tick - (this.frame?.tick ?? this.cursor.tick) > ticks;
  }

  connect(send: (message: BattleSyncInput) => void) {
    this.epoch++; this.transportEpoch++;
    this.frame = undefined; this.send = send; this.synchronized = false; this.resyncRequested = false;
  }
  disconnect() { this.epoch++; this.transportEpoch++; this.frame = undefined; this.send = undefined; this.synchronized = false; this.resyncRequested = false; }
  dispose() { this.disconnect(); this.pending = undefined; this.deferredRequest = false; this.completed = undefined; }

  private transmit(message: BattleSyncInput) {
    const epoch = this.transportEpoch;
    try { this.send?.(message); }
    catch { if (epoch === this.transportEpoch) this.disconnect(); }
  }

  request(intent: BattleIntent, completed?: (receipt: BattleReceipt) => void) {
    if (!this.acceptingInput || this.pending || !validBattleIntent(intent) || !this.battleId) return false;
    this.pending = { version: BATTLE_PROTOCOL_VERSION, battleId: this.battleId, sequence: this.nextRequest, intent: structuredClone(intent) };
    this.deferredRequest = this.applying;
    this.completed = completed;
    this.retry(); return true;
  }

  retry() {
    if (this.applying) return;
    if (!this.synchronized) { this.resyncRequested = false; this.resync(); return; }
    if (this.ready && this.pending) {
      this.deferredRequest = false;
      this.transmit({ type: "request", stream: this.stream, request: structuredClone(this.pending) });
    }
  }

  resync() {
    this.epoch++;
    this.frame = undefined;
    this.synchronized = false;
    if (this.send && this.cursor && !this.resyncRequested) {
      this.resyncRequested = true; this.transmit({ type: "resync", stream: this.stream });
    }
  }

  receiveText(text: string): BattleSyncResult {
    if (!this.send) return "ignored";
    if (this.applying) return "invalid"; // Ordered callers must retain later messages until this frame completes.
    let message: ReturnType<typeof decodeSyncMessage>;
    try { message = decodeSyncMessage(parseBoundedSyncText(text)); } catch { return "invalid"; }
    return this.receiveDecoded(message);
  }

  // Connection ingress validates once, before retaining messages in its bounded queue.
  receiveDecoded(message: DecodedBattleSyncMessage): BattleSyncResult {
    if (!this.send) return "ignored";
    if (this.applying) return "invalid";
    let epoch = this.epoch;
    if (message.type === "snapshot") {
      if (this.battleId && message.battleId !== this.battleId) return "invalid";
      if (message.stream <= this.stream) return "ignored";
      epoch = ++this.epoch;
      this.synchronized = false;
      try {
        this.runtime.restore(message);
        if (epoch !== this.epoch) return "ignored";
        if (this.runtime.checksum() !== message.checksum) throw new Error("Snapshot reconstruction differs");
      } catch {
        if (epoch !== this.epoch) return "ignored";
        this.synchronized = false; return "invalid";
      }
      if (epoch !== this.epoch) return "ignored";
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
        this.deferredRequest = false;
        if (receipt.nextSequence !== null) this.nextRequest = receipt.nextSequence;
        completed = this.completed;
        this.completed = undefined;
      }
      this.runtime.receipt?.(receipt);
      if (epoch !== this.epoch) return "ignored";
      const transportEpoch = this.transportEpoch;
      if (receipt.status === "rejected" && ["gap", "expired", "conflict", "wrongBattle", "faulted"].includes(receipt.reason)) this.resync();
      if (transportEpoch === this.transportEpoch) completed?.(receipt);
      return "applied";
    }
    if (!this.synchronized) return "ignored";
    if (olderSyncCursor(message.to, this.cursor)) {
      if (sameSyncCursor(message.to, this.cursor)) {
        try {
          if (this.runtime.checksum() !== message.checksum) throw new Error("Battle checksum mismatch");
        } catch {
          if (epoch !== this.epoch) return "ignored";
          this.resync(); return "resync";
        }
      }
      return "ignored";
    }
    if (!sameSyncCursor(message.from, this.cursor)) { this.resync(); return "resync"; }
    if (this.frameSliceTicks && message.to.tick > message.from.tick) {
      this.frame = { message, tick: message.from.tick, index: 0 };
      return this.continueFrame();
    }
    try {
      this.runtime.follow(message.to.tick, message.commands.map(entry => ({ ...entry, sequence: entry.sequence - this.baseSequence })));
      if (epoch !== this.epoch) return "ignored";
      if (this.runtime.checksum() !== message.checksum) throw new Error("Battle checksum mismatch");
    } catch {
      if (epoch !== this.epoch) return "ignored";
      this.resync(); return "resync";
    }
    if (epoch !== this.epoch) return "ignored";
    this.cursor = { ...message.to };
    return "applied";
  }

  // No wall clock here: the connection chooses when to resume a bounded deterministic slice.
  continueFrame(): BattleSyncResult {
    const frame = this.frame;
    if (!frame || !this.send) return "ignored";
    try {
      if (frame.tick < frame.message.to.tick) {
        const tick = Math.min(frame.message.to.tick, frame.tick + this.frameSliceTicks!);
        let end = frame.index;
        while (end < frame.message.commands.length && frame.message.commands[end].tick <= tick) end++;
        this.runtime.follow(tick, frame.message.commands.slice(frame.index, end)
          .map(entry => ({ ...entry, sequence: entry.sequence - this.baseSequence })));
        if (this.frame !== frame || !this.send) return "ignored";
        frame.tick = tick; frame.index = end;
        return "pending"; // Final checksum gets its own task instead of extending the last slice.
      }
      if (this.runtime.checksum() !== frame.message.checksum) throw new Error("Battle checksum mismatch");
    } catch {
      if (this.frame !== frame || !this.send) return "ignored";
      this.resync(); return "resync";
    }
    if (this.frame !== frame || !this.send) return "ignored";
    this.cursor = { ...frame.message.to }; this.frame = undefined;
    // One buffered intent may leave only after this frame is validated. Already
    // transmitted requests retain their normal retry cadence, not one per frame.
    if (this.deferredRequest) this.retry();
    return "applied";
  }
}
