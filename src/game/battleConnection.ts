import { BattleSyncClient, type BattleInputPort, type BattleInputStatus, type BattleSyncClientRuntime } from "./battleSyncClient";
import type { BattleIntent, BattleReceipt } from "./battleAuthority";
import { MAX_BATTLE_SYNC_BYTES, parseBoundedSyncText, decodeSyncMessage, type DecodedBattleSyncMessage } from "./battleSyncProtocol";

export type BattleConnectionStatus = BattleInputStatus;
export interface BattleTransport {
  send(text: string): void;
  close(): void;
}
export interface BattleTransportEvents {
  open(): void;
  message(text: string): void;
  closed(retryable?: boolean): void;
}
// Authenticate outside this adapter. Each factory call must create a new ordered connection.
export type BattleTransportFactory = (events: BattleTransportEvents) => BattleTransport;
export interface BattleConnectionScheduler {
  set(delayMs: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}
const scheduler: BattleConnectionScheduler = {
  set: (delay, callback) => globalThis.setTimeout(callback, delay),
  clear: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};
export interface BattleConnectionOptions {
  scheduler?: BattleConnectionScheduler;
  retryMs?: number;
  reconnectMs?: number;
  timeoutMs?: number;
  frameSliceTicks?: number;
  snapshotCatchUpTicks?: number;
  snapshotSkipCooldownMs?: number;
}

// Owns ingress timers and connection lifetime, never simulation time or battle state.
export class BattleConnection implements BattleInputPort {
  private readonly client: BattleSyncClient;
  private readonly clock: BattleConnectionScheduler;
  private readonly retryMs: number;
  private readonly reconnectMs: number;
  private readonly timeoutMs: number;
  private readonly snapshotCatchUpTicks: number;
  private readonly snapshotSkipCooldownMs: number;
  private transport?: BattleTransport;
  private opened = false;
  private epoch = 0;
  private failures = 0;
  private retryTimer?: unknown;
  private watchdog?: unknown;
  private reconnectTimer?: unknown;
  private sliceTimer?: unknown;
  private snapshotSkipTimer?: unknown;
  private inbox: { message: DecodedBattleSyncMessage; characters: number }[] = [];
  private inboxCharacters = 0;
  private processing = false;
  private current: BattleConnectionStatus = "idle";
  private readonly listeners = new Set<(status: BattleConnectionStatus) => void>();

  constructor(runtime: BattleSyncClientRuntime, private readonly factory: BattleTransportFactory, options: BattleConnectionOptions = {}) {
    this.client = new BattleSyncClient(runtime, options.frameSliceTicks);
    this.clock = options.scheduler ?? scheduler;
    this.retryMs = options.retryMs ?? 1500;
    this.reconnectMs = options.reconnectMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.snapshotCatchUpTicks = options.snapshotCatchUpTicks ?? 120;
    this.snapshotSkipCooldownMs = options.snapshotSkipCooldownMs ?? 5000;
    if (![this.retryMs, this.reconnectMs, this.timeoutMs].every(Number.isFinite) ||
      this.retryMs < 1000 || this.reconnectMs < 100 || this.timeoutMs <= this.retryMs) throw new Error("Invalid connection timing");
    if (!Number.isSafeInteger(this.snapshotCatchUpTicks) || this.snapshotCatchUpTicks < 0 ||
      !Number.isFinite(this.snapshotSkipCooldownMs) || this.snapshotSkipCooldownMs < 1000) throw new Error("Invalid snapshot catch-up policy");
  }
  get status() { return this.current; }
  // Input-slot state is independent from replica catch-up below.
  get ready() { return this.current !== "closed" && this.client.acceptingInput; }
  get busy() { return this.client.inputPending; }
  get catchingUp() { return this.client.applying || this.inbox.length > 0; }

  subscribe(listener: (status: BattleConnectionStatus) => void) {
    if (this.current !== "closed") this.listeners.add(listener);
    listener(this.current);
    return () => { this.listeners.delete(listener); };
  }
  private statusChanged(status: BattleConnectionStatus) {
    if (this.current === status) return;
    this.current = status;
    for (const listener of [...this.listeners]) listener(status);
  }
  start() { if (this.current === "idle") this.connect(); }
  reconnect() { if (this.current !== "closed") { this.retire(); this.connect(); } }
  close() {
    if (this.current === "closed") return;
    this.retire(); this.client.dispose();
    this.statusChanged("closed"); this.listeners.clear();
  }
  request(intent: BattleIntent, completed?: (receipt: BattleReceipt) => void) {
    if (!this.ready) return false;
    const accepted = this.client.request(intent, completed);
    this.refresh();
    return accepted;
  }
  private clearTimer(key: "retryTimer" | "watchdog" | "reconnectTimer" | "sliceTimer" | "snapshotSkipTimer") {
    if (this[key] !== undefined) this.clock.clear(this[key]);
    this[key] = undefined;
  }
  private retire() {
    this.epoch++;
    this.clearTimer("retryTimer"); this.clearTimer("watchdog"); this.clearTimer("reconnectTimer");
    this.clearTimer("sliceTimer"); this.inbox = []; this.inboxCharacters = 0;
    this.clearTimer("snapshotSkipTimer");
    this.client.disconnect(); this.opened = false;
    const transport = this.transport; this.transport = undefined;
    try { transport?.close(); } catch { /* The old epoch is already detached. */ }
  }
  private lost(retryable: boolean) {
    if (this.current === "closed") return;
    this.retire();
    if (!retryable) { this.statusChanged("failed"); return; }
    const epoch = this.epoch;
    this.statusChanged("reconnecting");
    if (epoch !== this.epoch) return;
    const delay = Math.min(10000, this.reconnectMs * 2 ** Math.min(this.failures++, 6));
    this.reconnectTimer = this.clock.set(delay, () => {
      if (epoch !== this.epoch) return;
      this.reconnectTimer = undefined; this.connect();
    });
  }
  private connect() {
    const epoch = ++this.epoch;
    this.statusChanged("connecting");
    if (epoch !== this.epoch) return;
    // Factories may report open/snapshot synchronously; don't process until the link exists.
    let constructing = true;
    let startupOverflow = false, queuedCharacters = 0;
    const queued: (() => void)[] = [];
    const dispatch = (action: () => void) => {
      if (epoch !== this.epoch || this.current === "closed") return;
      if (constructing) {
        if (queued.length >= 64) { startupOverflow = true; return; }
        if (startupOverflow) return;
        queued.push(action);
      } else action();
    };
    try {
      this.transport = this.factory({
        open: () => dispatch(() => {
          if (this.opened) return;
          this.opened = true;
          this.client.connect(message => {
            if (epoch !== this.epoch) return;
            try { this.transport!.send(JSON.stringify(message)); }
            catch { if (epoch === this.epoch) this.lost(true); }
          });
          this.refresh();
        }),
        message: text => {
          if (epoch !== this.epoch) return;
          if (typeof text !== "string" || text.length > MAX_BATTLE_SYNC_BYTES ||
            constructing && (queuedCharacters += text.length) > MAX_BATTLE_SYNC_BYTES) {
            if (constructing) startupOverflow = true;
            else this.lost(false);
            return;
          }
          dispatch(() => {
            if (!this.opened) { this.lost(false); return; }
            if (this.inbox.length >= 64 || this.inboxCharacters + text.length > MAX_BATTLE_SYNC_BYTES) {
              this.lost(false); return;
            }
            let message: DecodedBattleSyncMessage;
            try { message = decodeSyncMessage(parseBoundedSyncText(text)); }
            catch { this.lost(false); return; }
            this.inbox.push({ message, characters: text.length }); this.inboxCharacters += text.length;
            this.drain();
          });
        },
        closed: (retryable = true) => dispatch(() => this.lost(retryable))
      });
      constructing = false;
      if (startupOverflow) { this.lost(false); return; }
      for (const action of queued) dispatch(action);
      if (epoch === this.epoch) this.refresh();
    } catch { if (epoch === this.epoch) this.lost(true); }
    finally { queued.length = 0; constructing = false; }
  }
  private drain() {
    if (this.processing) return;
    const epoch = this.epoch;
    this.processing = true;
    try {
      if (this.snapshotSkipTimer === undefined &&
        !this.inbox.some(entry => entry.message.type === "snapshot") &&
        this.inbox.some(entry => this.client.exceedsCatchUpLimit(entry.message, this.snapshotCatchUpTicks))) {
        // Obsolete history is replaced only by a validated authoritative snapshot.
        // Pending input stays in the client and is retried with its original sequence.
        this.inbox = []; this.inboxCharacters = 0;
        this.clearTimer("sliceTimer");
        this.snapshotSkipTimer = this.clock.set(this.snapshotSkipCooldownMs, () => {
          if (epoch !== this.epoch) return;
          this.snapshotSkipTimer = undefined; this.drain();
        });
        this.client.resync();
        if (epoch !== this.epoch) return;
      }
      if (this.sliceTimer !== undefined) return;
      if (this.client.applying) {
        const result = this.client.continueFrame();
        if (epoch !== this.epoch) return;
        if (result === "invalid") { this.lost(false); return; }
      }
      while (epoch === this.epoch && !this.client.applying && this.inbox.length) {
        const entry = this.inbox.shift()!; this.inboxCharacters -= entry.characters;
        const result = this.client.receiveDecoded(entry.message);
        if (epoch !== this.epoch) return;
        if (result === "invalid") { this.lost(false); return; }
      }
      if (epoch !== this.epoch) return;
      if (this.client.applying) this.scheduleDrain();
      this.refresh();
    } finally {
      this.processing = false;
      // A callback may replace the connection while the old frame is unwinding.
      if (epoch !== this.epoch && this.inbox.length) this.scheduleDrain();
    }
  }
  private scheduleDrain() {
    if (this.sliceTimer !== undefined) return;
    const epoch = this.epoch;
    this.sliceTimer = this.clock.set(1, () => {
      if (epoch !== this.epoch) return;
      this.sliceTimer = undefined; this.drain();
    });
  }
  private refresh() {
    if (["closed", "failed", "reconnecting", "idle"].includes(this.current)) return;
    const epoch = this.epoch;
    this.statusChanged(!this.opened ? "connecting" : this.client.ready || this.client.applying ? "ready" : "synchronizing");
    if (epoch !== this.epoch) return;
    if (this.client.ready) this.failures = 0;
    if (this.client.ready && !this.client.busy) {
      this.clearTimer("watchdog"); this.clearTimer("retryTimer"); return;
    }
    if (this.watchdog === undefined) this.watchdog = this.clock.set(this.timeoutMs, () => {
      if (epoch === this.epoch) this.lost(true);
    });
    if (this.opened && this.retryTimer === undefined) this.retryTimer = this.clock.set(this.retryMs, () => {
      if (epoch !== this.epoch) return;
      this.retryTimer = undefined; this.client.retry(); this.refresh();
    });
  }
}
