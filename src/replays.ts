import { validateReplay, type BattleReplay } from "./game/battleCommands";
import { levelConfigs } from "./data/levels";
import { isLoadoutCardId } from "./game/cardEligibility";
import { decodeSaveGraph } from "./game/saveGraph";
import { validateBattleSave } from "./game/validateBattleSave";
import type { BattleSaveData } from "./game/battleSaveState";
import { sameBattlePolicy, LEGACY_BATTLE_POLICY } from "./game/battlePolicy";
import { copyBattleParticipants, sameBattleParticipants } from "./game/battleParticipants";

export const MAX_REPLAY_BYTES = 32 * 1024 * 1024;
export interface ReplayEntry {
  format: "charset-replay";
  version: 1;
  id: string;
  savedAt: number;
  outcome: "victory" | "defeat" | "unfinished";
  actorId: string;
  replay: BattleReplay;
}

export function replayStartTick(replay: BattleReplay) {
  return replay.checkpoint ? decodeSaveGraph<BattleSaveData>(replay.checkpoint, () => ({})).simulation?.clock.tick ?? 0 : 0;
}

export function validateReplayEntry(value: unknown): asserts value is ReplayEntry {
  const entry = value as ReplayEntry;
  if (!entry || entry.format !== "charset-replay" || entry.version !== 1 || typeof entry.id !== "string" || entry.id.length > 100 ||
    !Number.isFinite(entry.savedAt) || entry.savedAt < 0 || !["victory", "defeat", "unfinished"].includes(entry.outcome) ||
    typeof entry.actorId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.actorId)) throw Error("Invalid replay file");
  const replay = entry.replay;
  validateReplay(replay);
  if (!Object.hasOwn(levelConfigs, replay.levelId) || !replay.selectedCards.every(isLoadoutCardId) ||
    new Set(replay.selectedCards).size !== replay.selectedCards.length || replay.commands.length > 250000 ||
    !copyBattleParticipants(replay.participants).some(actor => actor.id === entry.actorId)) throw Error("Invalid replay configuration");
  if (replay.checkpoint) {
    const state = decodeSaveGraph<BattleSaveData>(replay.checkpoint, () => ({}));
    const level = levelConfigs[replay.levelId];
    validateBattleSave(replay.checkpoint, state.wave, level.bossKind, !!level.periodicDelSweep);
    const start = state.simulation?.clock.tick ?? 0;
    if (start > replay.endTick || replay.commands.some(command => command.tick < start) ||
      state.cardDeadlines.length !== replay.selectedCards.length || state.cardDeadlines.some((card, i) => card.id !== replay.selectedCards[i]) ||
      !sameBattlePolicy(state.simulation?.policy ?? LEGACY_BATTLE_POLICY, replay.policy ?? LEGACY_BATTLE_POLICY) ||
      !sameBattleParticipants(copyBattleParticipants(state.simulation?.participants), copyBattleParticipants(replay.participants))) throw Error("Replay checkpoint differs");
  }
}

export function parseReplayFile(text: string): ReplayEntry {
  if (text.length > MAX_REPLAY_BYTES || new TextEncoder().encode(text).length > MAX_REPLAY_BYTES) throw Error("Replay file too large");
  const entry: unknown = JSON.parse(text);
  validateReplayEntry(entry);
  return entry;
}

export function exportReplayFile(entry: ReplayEntry) {
  validateReplayEntry(entry);
  const text = JSON.stringify(entry);
  if (new TextEncoder().encode(text).length > MAX_REPLAY_BYTES) throw Error("Replay file too large");
  return text;
}

// A separate database keeps large battle checkpoints out of the progress/settings quota.
export class ReplayLibrary {
  private pending: Promise<unknown> = Promise.resolve();
  private memory: ReplayEntry[] = [];
  private database?: Promise<IDBDatabase>;
  constructor(private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {}

  private open() {
    return this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) { reject(Error("Replay storage unavailable")); return; }
      const request = this.factory.open("charset-replays", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("recent", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error("Replay storage blocked"));
    });
  }

  save(entry: ReplayEntry): Promise<boolean> {
    const saved = structuredClone(entry);
    const job = this.pending.catch(() => {}).then(async () => {
      this.memory = this.latest([...this.memory.filter(item => item.id !== saved.id), saved]);
      try {
        const db = await this.open();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("recent", "readwrite"), store = tx.objectStore("recent");
          const request = store.getAll();
          request.onsuccess = () => {
            const entries = this.latest([...(request.result as ReplayEntry[]).filter(item => item.id !== saved.id), saved]);
            store.clear(); for (const item of entries) store.put(item);
          };
          tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
        });
        return true;
      } catch { return false; }
    });
    this.pending = job;
    return job;
  }

  async recent(): Promise<ReplayEntry[]> {
    await this.pending.catch(() => {});
    try {
      const db = await this.open();
      const entries = await new Promise<ReplayEntry[]>((resolve, reject) => {
        const request = db.transaction("recent").objectStore("recent").getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return this.latest([...entries.filter(entry => !this.memory.some(item => item.id === entry.id)), ...this.memory]);
    } catch { return structuredClone(this.memory); }
  }

  private latest(entries: ReplayEntry[]) { return entries.sort((a, b) => b.savedAt - a.savedAt).slice(0, 3); }
}

export const replayLibrary = new ReplayLibrary();
