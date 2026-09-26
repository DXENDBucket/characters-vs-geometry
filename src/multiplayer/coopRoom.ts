import { DEFAULT_DIFFICULTY, DIFFICULTY_VERSION, validStoredDifficulty } from "../config";
import { levelNodes, getLevelConfig } from "../data/levels";
import { BattleAuthority } from "../game/battleAuthority";
import { BattleSyncHost, type BattleSyncPeer } from "../game/battleSyncHost";
import { MAX_BATTLE_SYNC_BYTES } from "../game/battleSyncProtocol";
import { BattleHostLoop } from "../game/battleHostLoop";
import { createIndependentBattle } from "../game/independentBattle";
import { BATTLE_RULES_VERSION } from "../game/battleSimulation";
import { captureBattleSnapshot } from "../game/captureBattleSnapshot";
import { battleChecksum } from "../game/battleChecksum";
import { copyBattlePolicy, validBattlePolicy, type BattlePolicy } from "../game/battlePolicy";
import { validPlayerCards } from "../game/battlePlayerConfig";
import { BATTLE_PERMISSIONS } from "../game/battleParticipants";
import type { CardId } from "../types";

export interface CoopProfile { name: string; policy: BattlePolicy; completed: string[] }
export interface CoopState {
  code: string; phase: "lobby" | "battle" | "closed"; levelId: string; difficulty: number;
  levels: string[]; error?: string;
  players: { id: string; name: string; ready: boolean; cards: CardId[]; connected: boolean }[];
}
interface Player { id: string; profile: CoopProfile; cards: CardId[]; ready: boolean }
interface PushLink { send(text: string): void; close(): void }
interface Link { id: string; peer?: BattleSyncPeer; queue: string[]; bytes: number; push?: PushLink }

export function coopLevels(completed: readonly string[]) {
  return levelNodes.filter(node => completed.includes(node.id) && !getLevelConfig(node.id).survival).map(node => node.id);
}

export function validateCoopProfile(value: unknown): asserts value is CoopProfile {
  const p = value as CoopProfile;
  if (!p || typeof p.name !== "string" || p.name.trim().length < 1 || p.name.length > 24 ||
    !validBattlePolicy(p.policy) || p.policy.players || !Array.isArray(p.completed) || p.completed.length > levelNodes.length ||
    !p.completed.every(id => typeof id === "string") || coopLevels(p.completed).length !== new Set(p.completed).size) {
    throw new Error("Invalid local profile");
  }
}

// Local unlock claims are captured at admission; this is not an anti-cheat service.
export class CoopRoom {
  readonly players: Player[];
  readonly links = new Map<string, Link>();
  phase: CoopState["phase"] = "lobby";
  levelId: string;
  difficulty = DEFAULT_DIFFICULTY;
  error?: string;
  runtime?: ReturnType<typeof createIndependentBattle>;
  private authority?: BattleAuthority;
  private sync?: BattleSyncHost;
  private loop?: BattleHostLoop;

  constructor(readonly code: string, profile: CoopProfile) {
    validateCoopProfile(profile);
    this.players = [{ id: "host", profile: structuredClone(profile), cards: [], ready: false }];
    this.levelId = coopLevels(profile.completed)[0] ?? "";
  }
  join(profile: CoopProfile) {
    validateCoopProfile(profile);
    if (this.phase !== "lobby" || this.players.length !== 1) throw new Error("Room is full or already started");
    this.players.push({ id: "guest", profile: structuredClone(profile), cards: [], ready: false });
  }
  private player(actor: string) {
    const player = this.players.find(p => p.id === actor);
    if (!player || this.phase === "closed") throw new Error("Room is closed");
    return player;
  }
  state(): CoopState {
    return { code: this.code, phase: this.phase, levelId: this.levelId, difficulty: this.difficulty,
      levels: coopLevels(this.players[0].profile.completed), error: this.error,
      players: this.players.map(p => ({ id: p.id, name: p.profile.name, cards: [...p.cards], ready: p.ready, connected: this.links.has(p.id) })) };
  }
  configure(actor: string, levelId: string, difficulty: number) {
    this.player(actor);
    if (actor !== "host" || this.phase !== "lobby" || !coopLevels(this.players[0].profile.completed).includes(levelId) ||
      !validStoredDifficulty(difficulty, DIFFICULTY_VERSION)) throw new Error("Invalid host level selection");
    this.levelId = levelId; this.difficulty = difficulty;
    for (const p of this.players) p.ready = false;
  }
  select(actor: string, cards: CardId[]) {
    const p = this.player(actor);
    if (this.phase !== "lobby" || !validPlayerCards(cards, p.profile.policy)) throw new Error("Cards are locked or exceed your slots");
    p.cards = [...cards]; p.ready = false;
  }
  ready(actor: string, ready: boolean) {
    const p = this.player(actor);
    if (this.phase !== "lobby" || typeof ready !== "boolean" || ready && !validPlayerCards(p.cards, p.profile.policy)) throw new Error("Select cards first");
    p.ready = ready;
  }
  start(actor: string, seed: number, runLoop = true) {
    this.player(actor);
    if (actor !== "host" || this.phase !== "lobby" || !this.levelId || this.players.length !== 2 || this.players.some(p => !p.ready)) {
      throw new Error("Both players must be ready");
    }
    const players = [...this.players].sort((a, b) => a.id < b.id ? -1 : 1);
    const policy = copyBattlePolicy({ version: 1, slotCount: Math.max(...players.map(p => p.profile.policy.slotCount)),
      allowedCards: [...new Set(players.flatMap(p => [...p.profile.policy.allowedCards]))],
      reselectEnabled: players.some(p => p.profile.policy.reselectEnabled), pauseOnLocalModal: false,
      towerAccess: "owner", walletMode: "individual", resourceMode: "individual",
      players: players.map(p => ({ actorId: p.id, slotCount: p.profile.policy.slotCount,
        allowedCards: p.profile.policy.allowedCards, reselectEnabled: p.profile.policy.reselectEnabled })) });
    const runtime = this.runtime = createIndependentBattle({ version: BATTLE_RULES_VERSION, difficultyVersion: DIFFICULTY_VERSION,
      levelId: this.levelId, difficulty: this.difficulty, unlimitedFirepower: false, seed, debug: false,
      policy, selectedCards: [...this.players[0].cards], playerLoadouts: players.map(p => ({ actorId: p.id, cards: p.cards })),
      participants: players.map(p => ({ id: p.id, permissions: BATTLE_PERMISSIONS.filter(permission => permission !== "debug" &&
        (p.id === "host" || permission !== "time" && permission !== "tutorial")) })) });
    this.authority = new BattleAuthority(this.code, runtime.session, { available: () => !runtime.world.gameOver,
      inputTime: () => performance.now(), execute: command => runtime.executeCommand(command) });
    this.sync = new BattleSyncHost(runtime.session, this.authority, {
      inputTime: () => performance.now(), checksum: () => battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0])),
      checkpoint: () => runtime.session.checkpointReplay(captureBattleSnapshot(runtime.snapshot(runtime.world.loadout.ids[0])), runtime.world.loadout.ids) });
    this.phase = "battle";
    this.loop = new BattleHostLoop({ get available() { return true; },
      get timing() { return { tick: runtime.session.clock.tick, remainder: runtime.session.clock.snapshot().remainder,
        speed: runtime.session.controls.speed, paused: runtime.session.controls.paused, ended: runtime.world.gameOver }; },
      advance: async delta => {
        if (this.links.size < 2) return;
        runtime.session.advance(delta, runtime.sessionRuntime); this.sync!.publish();
      } }, { intervalMs: 1000 / 30, failed: error => { this.error = error.message; this.close(); } });
    if (runLoop) this.loop.start();
  }
  connect(actor: string, id: string, push?: PushLink) {
    this.player(actor);
    if (!this.sync || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("Battle is not ready");
    this.disconnect(actor);
    const link: Link = { id, queue: [], bytes: 0, push };
    this.links.set(actor, link);
    link.peer = this.sync.connect(actor, message => {
      const text = JSON.stringify(message);
      if (push) {
        try { push.send(text); } catch { this.disconnect(actor, id); }
        return;
      }
      if (link.queue.length >= 64 || link.bytes + text.length > MAX_BATTLE_SYNC_BYTES) { this.disconnect(actor, id); return; }
      link.queue.push(text); link.bytes += text.length;
    });
    if (!link.peer || this.links.get(actor) !== link) {
      if (link.peer) this.sync.disconnect(link.peer);
      if (this.links.get(actor) === link) this.disconnect(actor, id);
      throw new Error("Battle connection failed");
    }
  }
  disconnect(actor: string, id?: string) {
    const link = this.links.get(actor);
    if (!link || id !== undefined && link.id !== id) return;
    if (link.peer) this.sync?.disconnect(link.peer);
    this.links.delete(actor);
    link.push?.close();
  }
  private link(actor: string, id: string) {
    this.player(actor);
    const link = this.links.get(actor);
    if (!link?.peer || link.id !== id) throw new Error("Connection was replaced");
    return link;
  }
  poll(actor: string, id: string) { const link = this.link(actor, id); link.bytes = 0; return link.queue.splice(0); }
  receive(actor: string, id: string, text: string) { return this.sync!.receiveText(this.link(actor, id).peer!, text); }
  close() {
    this.phase = "closed"; void this.loop?.stop();
    for (const actor of [...this.links.keys()]) this.disconnect(actor);
    this.sync?.close(); this.authority?.close();
  }
}
