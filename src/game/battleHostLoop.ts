import { BATTLE_STEP_MS } from "./battleSimulation";

export interface BattleHostTiming {
  tick: number;
  remainder: number;
  speed: number;
  paused: boolean;
  ended: boolean;
}
export interface ScheduledBattleHost {
  readonly available: boolean;
  readonly timing: BattleHostTiming;
  advance(deltaMs: number): Promise<unknown>;
}
export interface BattleHostScheduler {
  now(): number;
  // Call once, asynchronously, no earlier than delayMs; clear must cancel pending callbacks.
  set(delayMs: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}
const defaultScheduler: BattleHostScheduler = {
  now: () => performance.now(),
  set: (delay, callback) => globalThis.setTimeout(callback, delay),
  clear: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};
export interface BattleHostLoopOptions {
  scheduler?: BattleHostScheduler;
  intervalMs?: number;
  maxLagMs?: number;
  // The owner must notify/disconnect clients and close or replace the host. Never throw here.
  failed(error: Error): void;
}

// Outer wall-clock scheduling only. All simulation time, speed and pause rules stay in the host.
export class BattleHostLoop {
  private readonly scheduler: BattleHostScheduler;
  private readonly intervalMs: number;
  private readonly maxLagMs: number;
  private current: "idle" | "running" | "stopped" | "failed" = "idle";
  private timer?: unknown;
  private flight?: Promise<void>;
  private lastTime = 0;
  private observedTime = Number.NEGATIVE_INFINITY;
  private generation = 0;

  constructor(private readonly host: ScheduledBattleHost, private readonly options: BattleHostLoopOptions) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.intervalMs = options.intervalMs ?? 100;
    this.maxLagMs = options.maxLagMs ?? 2000;
    if (!Number.isFinite(this.intervalMs) || this.intervalMs < 1 || this.intervalMs > 1000 ||
        !Number.isFinite(this.maxLagMs) || this.maxLagMs < this.intervalMs || typeof options.failed !== "function") {
      throw new Error("Invalid host loop options");
    }
  }
  get status() { return this.current; }
  get busy() { return this.flight !== undefined; }

  start() {
    if (this.current !== "idle") return;
    this.current = "running";
    try { this.lastTime = this.now(); this.schedule(this.intervalMs); }
    catch (error) { this.fail(error); }
  }

  async stop() {
    if (this.current !== "failed") this.current = "stopped";
    this.generation++;
    this.clearTimer();
    await this.flight;
  }

  private now() {
    const time = this.scheduler.now();
    if (!Number.isFinite(time) || time < this.observedTime) throw new Error("Host clock must be finite and monotonic");
    this.observedTime = time;
    return time;
  }
  private clearTimer() {
    if (this.timer !== undefined) this.scheduler.clear(this.timer);
    this.timer = undefined;
  }
  private fail(value: unknown) {
    if (this.current === "failed") return;
    this.current = "failed"; this.generation++; this.clearTimer();
    this.options.failed(value instanceof Error ? value : new Error(String(value)));
  }
  private schedule(delay: number) {
    if (this.current !== "running") return;
    const generation = this.generation;
    this.timer = this.scheduler.set(Math.max(1, delay), () => {
      if (generation !== this.generation || this.current !== "running") return;
      this.timer = undefined;
      // Defer invocation until flight is installed, including synchronous host errors.
      this.flight = Promise.resolve().then(() => this.advance()).catch(error => this.fail(error)).finally(() => {
        this.flight = undefined;
      });
    });
  }
  private async advance() {
    if (this.current !== "running") return;
    if (!this.host.available) throw new Error("Scheduled host is unavailable");
    const started = this.now(), elapsed = started - this.lastTime;
    this.lastTime = started;
    const before = this.host.timing;
    if (before.ended) { this.current = "stopped"; return; }
    if (before.paused) { this.schedule(this.intervalMs); return; }
    // DurableBattleHost accepts at most one second per call. Suspension/overload
    // is an explicit integration failure, not a clamped frame that discards elapsed time.
    if (elapsed > 1000 || before.remainder + elapsed * before.speed > this.maxLagMs) {
      throw new Error("Host simulation backlog exceeded scheduling limit");
    }
    await this.host.advance(elapsed);
    if (this.current !== "running") return;
    const ended = this.now(), after = this.host.timing;
    if (after.ended) { this.current = "stopped"; return; }
    this.schedule(!after.paused && after.remainder + 1e-7 >= BATTLE_STEP_MS ? 1 : this.intervalMs - (ended - started));
  }
}
