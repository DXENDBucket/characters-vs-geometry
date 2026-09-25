import type { CardId } from "../types";
import { BattleActionQueue } from "./battleActions";
import { type BattleCommand, type BattleReplay, validateReplay } from "./battleCommands";
import {
  BATTLE_RULES_VERSION, BATTLE_STEP_MS, BattleClock, BattleRandom,
  type BattleClockState, canRestoreBattleVersion, validBattleClock
} from "./battleSimulation";
import type { SaveGraph } from "./saveGraph";
import { copyBattleParticipants, sameBattleParticipants, type BattleOperationActor } from "./battleParticipants";

export interface BattleSessionSnapshot {
  version: number;
  clock: BattleClockState;
  randomState: number;
  participants?: readonly BattleOperationActor[];
}

export type BattleSessionOptions = Omit<BattleReplay, "commands" | "endTick" | "checkpoint">;
export type BattleCommandExecutor = (command: BattleCommand) => void;

export interface BattleSessionRuntime {
  step(): void;
  executeCommand: BattleCommandExecutor;
  canAdvance(): boolean;
}

// Owns deterministic scheduling and recording; the runtime still supplies world simulation.
export class BattleSession {
  readonly clock = new BattleClock();
  readonly random: BattleRandom;
  readonly actions = new BattleActionQueue();
  private recording: BattleReplay;
  private readonly replay?: BattleReplay;
  private replayCursor = 0;
  private executing = false;
  private advancing = false;
  private actors: readonly BattleOperationActor[];
  private epoch = 0;

  constructor(options: BattleSessionOptions, playback?: BattleReplay) {
    this.recording = { ...structuredClone(options), endTick: 0, commands: [] };
    validateReplay(this.recording);
    if (playback) {
      validateReplay(playback);
      this.replay = structuredClone(playback);
    }
    this.random = new BattleRandom(this.replay?.seed ?? options.seed);
    this.actors = copyBattleParticipants((this.replay ?? this.recording).participants);
  }

  get playback(): Readonly<BattleReplay> | undefined { return this.replay; }
  get executingCommand() { return this.executing; }
  get nextCommandSequence() { return this.recording.commands.length; }
  get commandEpoch() { return this.epoch; }
  actor(id: string) { return this.actors.find(actor => actor.id === id); }
  get playbackComplete() { return !!this.replay && this.clock.tick >= this.replay.endTick; }

  // False means playback was already complete; no simulation or render refresh is needed.
  advance(delta: number, runtime: BattleSessionRuntime) {
    if (this.advancing) throw new Error("Battle session is already advancing");
    this.advancing = true;
    try {
      this.applyReplayCommands(runtime.executeCommand);
      if (!runtime.canAdvance() || this.playbackComplete) return false;
      this.clock.advance(delta, () => {
        runtime.step();
        this.applyReplayCommands(runtime.executeCommand);
        return runtime.canAdvance() && !this.playbackComplete;
      });
      return true;
    } finally { this.advancing = false; }
  }

  // Local, trusted commands only. Network schema validation and authorization are separate gates.
  submit(command: BattleCommand, execute: BattleCommandExecutor) {
    if (this.replay || this.executing) return false;
    const entry = { tick: this.clock.tick, sequence: this.recording.commands.length, command: structuredClone(command) };
    validateReplay({ ...this.recording, commands: [{ ...entry, sequence: 0 }], endTick: entry.tick });
    this.recording.commands.push(entry);
    this.execute(entry.command, execute);
    return true;
  }

  private execute(command: BattleCommand, execute: BattleCommandExecutor) {
    this.executing = true;
    try { execute(structuredClone(command)); }
    finally { this.executing = false; }
  }

  private applyReplayCommands(execute: BattleCommandExecutor) {
    if (!this.replay) return;
    while (this.replayCursor < this.replay.commands.length) {
      const entry = this.replay.commands[this.replayCursor];
      if (entry.tick > this.clock.tick) break;
      this.replayCursor++;
      this.execute(entry.command, execute);
    }
  }

  snapshot(): BattleSessionSnapshot {
    const participants = (this.replay ?? this.recording).participants;
    return { version: BATTLE_RULES_VERSION, clock: this.clock.snapshot(), randomState: this.random.state,
      ...(participants ? { participants: structuredClone(this.actors) } : {}) };
  }

  restore(state: BattleSessionSnapshot | undefined, battleTime: number) {
    if (state && !canRestoreBattleVersion(state.version)) throw new Error("Incompatible battle rules");
    if (!state && (!Number.isFinite(battleTime) || battleTime < 0)) throw new Error("Invalid legacy battle time");
    const clock = state?.clock ?? { tick: Math.floor(battleTime / BATTLE_STEP_MS), remainder: 0 };
    if (!validBattleClock(clock)) throw new Error("Invalid battle clock");
    if (state && (!Number.isSafeInteger(state.randomState) || state.randomState < 0 || state.randomState > 0xffffffff)) {
      throw new Error("Invalid battle random state");
    }
    const actors = copyBattleParticipants(state?.participants);
    if (this.replay && !sameBattleParticipants(actors, this.actors)) throw new Error("Replay participants differ from checkpoint");
    if (this.replay && (this.replay.endTick < clock.tick || this.replay.commands.some(entry => entry.tick < clock.tick))) {
      throw new Error("Replay predates checkpoint");
    }
    this.clock.restore(clock);
    this.actors = actors;
    if (!this.replay) {
      if (state?.participants) this.recording.participants = structuredClone(actors);
      else delete this.recording.participants;
    }
    if (state) this.random.state = state.randomState;
    this.replayCursor = 0;
    this.epoch++;
  }

  startRecordingFromCheckpoint(checkpoint: SaveGraph, selectedCards: readonly CardId[]) {
    if (this.replay) return;
    this.epoch++;
    this.recording = { ...this.recording, selectedCards: [...selectedCards],
      checkpoint: structuredClone(checkpoint), commands: [] };
  }

  exportReplay(): BattleReplay {
    return structuredClone(this.replay ?? { ...this.recording, endTick: this.clock.tick });
  }
}
