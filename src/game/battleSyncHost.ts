import { BattleAuthority, BATTLE_PROTOCOL_VERSION, MAX_BATTLE_REQUEST_BYTES, type BattleChannel } from "./battleAuthority";
import { BattleSession, MAX_REPLICA_FRAME_COMMANDS, MAX_REPLICA_FRAME_TICKS } from "./battleSession";
import type { BattleReplay } from "./battleCommands";
import { encodeBattleWireGraph } from "./battleWireGraph";
import { exactSyncFields, parseBoundedSyncText, sameSyncCursor,
  type BattleSyncCursor, type BattleSyncMessage, type BattleSyncSnapshot } from "./battleSyncProtocol";

export interface BattleSyncHostRuntime {
  checkpoint(): BattleReplay;
  // Optional transaction-owned encoder; it must retain encodeBattleWireGraph validation.
  encodeCheckpoint?: typeof encodeBattleWireGraph;
  checksum(): string;
  inputTime(): number;
}
declare const peerBrand: unique symbol;
export interface BattleSyncPeer { readonly [peerBrand]: true }
interface Peer {
  actor: string;
  channel: BattleChannel;
  stream: number;
  lastResync: number;
  send(message: BattleSyncMessage): void;
}

// Authentication and transport lifetime are supplied by the host, not claimed in a message.
export class BattleSyncHost {
  private readonly peers = new Map<BattleSyncPeer, Peer>();
  private readonly epoch: number;
  private stream = 0;
  private cursor: BattleSyncCursor;
  private closed = false;

  constructor(private readonly session: BattleSession, private readonly authority: BattleAuthority,
    private readonly runtime: BattleSyncHostRuntime, stream = 0) {
    if (session.replica || session.playback) throw new Error("Only a live authority can host battle sync");
    if (!Number.isSafeInteger(stream) || stream < 0 || stream >= Number.MAX_SAFE_INTEGER - 1) throw new Error("Invalid sync stream cursor");
    this.stream = stream;
    this.epoch = session.commandEpoch;
    this.cursor = this.currentCursor();
  }

  get streamCursor() { return this.stream; }

  private currentCursor() { return { tick: this.session.clock.tick, sequence: this.session.nextCommandSequence }; }
  private live() { return !this.closed && this.epoch === this.session.commandEpoch && this.session.atBoundary; }

  connect(actor: string, send: Peer["send"]): BattleSyncPeer | undefined {
    if (!this.live()) return;
    this.publish();
    const channel = this.authority.connect(actor);
    if (!channel) return;
    for (const [handle, peer] of this.peers) if (peer.actor === actor) this.disconnect(handle);
    const handle = Object.freeze({}) as BattleSyncPeer;
    const peer: Peer = { actor, channel, send, stream: 0, lastResync: -Infinity };
    this.peers.set(handle, peer);
    this.snapshot(peer);
    return handle;
  }

  disconnect(handle: BattleSyncPeer) {
    const peer = this.peers.get(handle);
    if (peer) this.authority.disconnect(peer.channel);
    this.peers.delete(handle);
  }

  close() { this.closed = true; for (const handle of this.peers.keys()) this.disconnect(handle); }

  private deliver(peer: Peer, message: BattleSyncMessage) {
    try { peer.send(structuredClone(message)); }
    catch { for (const [handle, value] of this.peers) if (value === peer) this.disconnect(handle); }
  }

  private snapshot(peer: Peer) {
    const hello = this.authority.describe(peer.channel);
    if (!hello) return;
    const replay = this.runtime.checkpoint();
    if (!replay.checkpoint) throw new Error("Battle sync requires a checkpoint");
    if (this.stream >= Number.MAX_SAFE_INTEGER - 1) throw new Error("Battle sync stream exhausted");
    peer.stream = ++this.stream;
    const snapshot: BattleSyncSnapshot = { version: BATTLE_PROTOCOL_VERSION, battleId: this.authority.battleId,
      stream: peer.stream, type: "snapshot", cursor: { ...this.cursor }, nextRequest: hello.nextSequence,
      replay: { ...replay, checkpoint: (this.runtime.encodeCheckpoint ?? encodeBattleWireGraph)(replay.checkpoint) },
      checksum: this.runtime.checksum() };
    this.deliver(peer, snapshot);
  }

  publish(force = true) {
    if (!this.live()) return;
    const to = this.currentCursor();
    if (sameSyncCursor(to, this.cursor)) return;
    if (!force && to.sequence === this.cursor.sequence && to.tick - this.cursor.tick < 6) return;
    const from = this.cursor;
    this.cursor = to;
    if (!this.peers.size) return;
    if (to.tick - from.tick > MAX_REPLICA_FRAME_TICKS || to.sequence - from.sequence > MAX_REPLICA_FRAME_COMMANDS) {
      for (const peer of this.peers.values()) this.snapshot(peer);
      return;
    }
    const commands = this.session.recordedCommands(from.sequence), checksum = this.runtime.checksum();
    for (const peer of this.peers.values()) this.deliver(peer, { version: BATTLE_PROTOCOL_VERSION,
      battleId: this.authority.battleId, stream: peer.stream, type: "frame", from, to, commands, checksum });
  }

  receiveText(handle: BattleSyncPeer, text: string) {
    if (!this.live()) return false;
    const peer = this.peers.get(handle);
    if (!peer) return false;
    let input: unknown;
    try { input = parseBoundedSyncText(text, MAX_BATTLE_REQUEST_BYTES + 128); } catch { return false; }
    if (exactSyncFields(input, ["type", "stream"]) && input.type === "resync" && input.stream === peer.stream) {
      const now = this.runtime.inputTime();
      if (!Number.isFinite(now) || now < 0 || now - peer.lastResync < 1000) return false;
      peer.lastResync = now;
      this.publish(); this.snapshot(peer); return true;
    }
    if (!exactSyncFields(input, ["type", "stream", "request"]) || input.type !== "request" || input.stream !== peer.stream) return false;
    const receipt = this.authority.receive(peer.channel, input.request);
    this.publish();
    this.deliver(peer, { version: BATTLE_PROTOCOL_VERSION, battleId: this.authority.battleId,
      stream: peer.stream, type: "receipt", receipt });
    return true;
  }
}
