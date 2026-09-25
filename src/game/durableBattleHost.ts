import { BattleAuthority, BATTLE_PROTOCOL_VERSION, MAX_BATTLE_REQUEST_BYTES, type BattleAuthorityCheckpoint } from "./battleAuthority";
import { BattleSyncHost, type BattleSyncPeer } from "./battleSyncHost";
import { decodeSyncMessage, exactSyncFields, parseBoundedSyncText, type BattleSyncMessage, type BattleSyncSnapshot } from "./battleSyncProtocol";
import { encodeBattleWireGraph } from "./battleWireGraph";
import { createIndependentBattle } from "./independentBattle";
import { captureBattleSnapshot } from "./captureBattleSnapshot";
import { battleChecksum } from "./battleChecksum";
import type { BattleSessionOptions } from "./battleSession";
import type { BattleRuntime } from "./battleRuntime";

export const MAX_HOST_CHECKPOINT_BYTES = 32 * 1024 * 1024;
export const MAX_PENDING_HOST_TASKS = 64;
interface HostCheckpoint {
  version: 1;
  stream: number;
  snapshot: BattleSyncSnapshot;
  authority: BattleAuthorityCheckpoint;
}
export interface DurableBattleHostPorts {
  inputTime(): number;
  // Must atomically replace durable storage before resolving; one writer owns the battle.
  save(text: string): Promise<void>;
}

// All mutation and publication is serialized across the asynchronous durability barrier.
export class DurableBattleHost {
  private readonly authority: BattleAuthority;
  private readonly sync: BattleSyncHost;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private stopped = false;
  private closing = false;
  private outputs: (() => void)[] = [];
  private committed = "";
  private checksumCache?: { tick: number; sequence: number; value: string };

  private constructor(private readonly runtime: BattleRuntime, battleId: string, private readonly ports: DurableBattleHostPorts,
    saved?: HostCheckpoint) {
    this.authority = new BattleAuthority(battleId, runtime.session, {
      available: () => !runtime.world.gameOver, inputTime: () => ports.inputTime(),
      execute: command => runtime.executeCommand(command)
    }, saved?.authority);
    this.sync = new BattleSyncHost(runtime.session, this.authority, {
      checkpoint: () => this.replay(), checksum: () => this.checksum(), inputTime: () => ports.inputTime()
    }, saved?.stream);
  }

  static async create(battleId: string, options: BattleSessionOptions, ports: DurableBattleHostPorts) {
    if (!options.policy) throw new Error("A hosted battle requires an explicit access policy");
    const host = new DurableBattleHost(createIndependentBattle(options), battleId, ports);
    await host.run(() => {});
    return host;
  }

  static async restore(text: string, ports: DurableBattleHostPorts) {
    const value = parseBoundedSyncText(text, MAX_HOST_CHECKPOINT_BYTES);
    if (!exactSyncFields(value, ["version", "stream", "snapshot", "authority"]) || value.version !== 1 ||
        !Number.isSafeInteger(value.stream) || (value.stream as number) < 0 ||
        (value.stream as number) >= Number.MAX_SAFE_INTEGER - 1) throw new Error("Invalid host checkpoint");
    const saved = value as unknown as HostCheckpoint, snapshot = decodeSyncMessage(saved.snapshot);
    if (snapshot.type !== "snapshot" || snapshot.stream !== saved.stream + 1 || snapshot.nextRequest !== 0 ||
        saved.authority?.battleId !== snapshot.battleId || saved.authority.tick !== snapshot.cursor.tick ||
        saved.authority.commandSequence !== snapshot.cursor.sequence) throw new Error("Mismatched host checkpoint");
    const runtime = createIndependentBattle(snapshot.replay, { checkpoint: snapshot.replay.checkpoint });
    if (battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0])) !== snapshot.checksum) throw new Error("Restored host differs");
    runtime.session.restoreCommandOffset(snapshot.cursor.sequence);
    const host = new DurableBattleHost(runtime, snapshot.battleId, ports, saved);
    await host.run(() => {});
    return host;
  }

  get checkpointText() { return this.committed; }
  get available() { return !this.stopped && !this.closing; }

  private replay() {
    return this.runtime.session.checkpointReplay(captureBattleSnapshot(this.runtime.snapshot(this.runtime.world.loadout.ids[0])),
      this.runtime.world.loadout.ids);
  }
  private checksum() {
    // Sync publication and durable commit inspect the same command boundary. Never
    // retain this cache across transactions (including commands at the same tick).
    const tick = this.runtime.session.clock.tick, sequence = this.runtime.session.nextCommandSequence;
    if (this.checksumCache?.tick === tick && this.checksumCache.sequence === sequence) return this.checksumCache.value;
    const value = battleChecksum(this.runtime.snapshot(this.runtime.world.loadout.ids[0]));
    this.checksumCache = { tick, sequence, value };
    return value;
  }

  private checkpoint(): string {
    const replay = this.replay(), authority = this.authority.snapshot(), stream = this.sync.streamCursor;
    const data: HostCheckpoint = { version: 1, stream, authority, snapshot: {
      type: "snapshot", version: BATTLE_PROTOCOL_VERSION, battleId: this.authority.battleId, stream: stream + 1,
      cursor: { tick: authority.tick, sequence: authority.commandSequence }, nextRequest: 0,
      replay: { ...replay, checkpoint: encodeBattleWireGraph(replay.checkpoint!) }, checksum: this.checksum()
    } };
    const text = JSON.stringify(data);
    if (new TextEncoder().encode(text).byteLength > MAX_HOST_CHECKPOINT_BYTES) throw new Error("Host checkpoint exceeds storage bound");
    return text;
  }

  private run<T>(action: () => T): Promise<T> {
    if (!this.available) return Promise.reject(new Error("Durable host is closed"));
    if (this.pending >= MAX_PENDING_HOST_TASKS) return Promise.reject(new Error("Durable host queue is full"));
    this.pending++;
    const task = this.tail.then(async () => {
      if (this.stopped) throw new Error("Durable host is closed");
      this.checksumCache = undefined;
      try {
        const result = action();
        const text = this.checkpoint();
        await this.ports.save(text);
        this.committed = text;
        const outputs = this.outputs; this.outputs = [];
        for (const deliver of outputs) deliver();
        return result;
      } catch (error) {
        // The world may have advanced, but no uncommitted output may escape or be retried in place.
        this.stopped = true; this.outputs = []; this.sync.close(); this.authority.close();
        throw error;
      } finally {
        this.checksumCache = undefined;
      }
    });
    this.tail = task.then(() => { this.pending--; }, () => { this.pending--; });
    return task;
  }

  connect(actorId: string, send: (message: BattleSyncMessage) => void): Promise<BattleSyncPeer | undefined> {
    return this.run(() => {
      let peer: BattleSyncPeer | undefined;
      peer = this.sync.connect(actorId, message => this.outputs.push(() => {
        try { send(message); } catch { if (peer) this.sync.disconnect(peer); }
      }));
      return peer;
    });
  }

  disconnect(peer: BattleSyncPeer) { return this.run(() => this.sync.disconnect(peer)); }
  receiveText(peer: BattleSyncPeer, text: string) {
    if (typeof text !== "string" || text.length > MAX_BATTLE_REQUEST_BYTES + 128) return Promise.resolve(false);
    return this.run(() => this.sync.receiveText(peer, text));
  }
  advance(delta: number) {
    if (!Number.isFinite(delta) || delta < 0 || delta > 1000) return Promise.reject(new Error("Invalid host frame delta"));
    return this.run(() => {
      this.runtime.session.advance(delta, this.runtime.sessionRuntime);
      this.sync.publish(false);
    });
  }

  async close() {
    this.closing = true;
    await this.tail;
    this.stopped = true; this.sync.close(); this.authority.close();
  }
}
