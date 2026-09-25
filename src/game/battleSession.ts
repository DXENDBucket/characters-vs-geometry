import type { CardId } from "../types";
import { BattleActionQueue } from "./battleActions";
import { type BattleCommand, type BattleReplay, type RecordedBattleCommand, validateReplay } from "./battleCommands";
import {
  BATTLE_RULES_VERSION, BATTLE_STEP_MS, BattleClock, BattleRandom,
  type BattleClockState, canRestoreBattleVersion, validBattleClock
} from "./battleSimulation";
import type { SaveGraph } from "./saveGraph";
import { copyBattleParticipants, sameBattleParticipants, type BattleOperationActor } from "./battleParticipants";
import { copyBattlePolicy, LEGACY_BATTLE_POLICY, sameBattlePolicy, type BattlePolicy } from "./battlePolicy";
import { copyBattleControlState, createBattleControlState, type BattleControlState } from "./battleControls";

export interface BattleSessionSnapshot {
  version: number;
  clock: BattleClockState;
  randomState: number;
  participants?: readonly BattleOperationActor[];
  policy?: BattlePolicy;
  controls?: BattleControlState;
}

export type BattleSessionOptions = Omit<BattleReplay, "commands" | "endTick" | "checkpoint">;
export type BattleCommandExecutor = (command: BattleCommand) => void;
export const MAX_REPLICA_FRAME_TICKS = 600;
export const MAX_REPLICA_FRAME_COMMANDS = 256;

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
  readonly controls = createBattleControlState();
  private recording: BattleReplay;
  private readonly replay?: BattleReplay;
  private replayCursor = 0;
  private executing = false;
  private advancing = false;
  private actors: readonly BattleOperationActor[];
  private epoch = 0;
  private savedPolicy?: BattlePolicy;
  private commandOffset = 0;

  constructor(options: BattleSessionOptions, playback?: BattleReplay, readonly replica = false) {
    if (replica && playback) throw new Error("A replica cannot also play a recording");
    this.recording = { ...structuredClone(options), endTick: 0, commands: [] };
    validateReplay(this.recording);
    if (playback) {
      validateReplay(playback);
      this.replay = structuredClone(playback);
    }
    this.random = new BattleRandom(this.replay?.seed ?? options.seed);
    this.actors = copyBattleParticipants((this.replay ?? this.recording).participants);
    const policy = (this.replay ?? this.recording).policy;
    this.savedPolicy = policy ? copyBattlePolicy(policy) : undefined;
    this.controls.debugEnabled = (this.replay ?? this.recording).debug;
  }

  get playback(): Readonly<BattleReplay> | undefined { return this.replay; }
  get executingCommand() { return this.executing; }
  get atBoundary() { return !this.advancing && !this.executing; }
  get nextCommandSequence() { return this.commandOffset + this.recording.commands.length; }
  get commandEpoch() { return this.epoch; }
  actor(id: string) { return this.actors.find(actor => actor.id === id); }
  get participants() { return this.actors; }
  get policy() { return this.savedPolicy ?? LEGACY_BATTLE_POLICY; }
  get playbackComplete() { return !!this.replay && this.clock.tick >= this.replay.endTick; }

  // False means playback was already complete; no simulation or render refresh is needed.
  advance(delta: number, runtime: BattleSessionRuntime) {
    if (this.replica) return false;
    if (this.advancing) throw new Error("Battle session is already advancing");
    this.advancing = true;
    try {
      this.applyReplayCommands(runtime.executeCommand);
      if (this.controls.paused || !runtime.canAdvance() || this.playbackComplete) return false;
      this.clock.advance(delta * this.controls.speed, () => {
        runtime.step();
        this.applyReplayCommands(runtime.executeCommand);
        return !this.controls.paused && runtime.canAdvance() && !this.playbackComplete;
      });
      return true;
    } finally { this.advancing = false; }
  }

  // Local, trusted commands only. Network schema validation and authorization are separate gates.
  submit(command: BattleCommand, execute: BattleCommandExecutor) {
    if (this.replay || this.replica || this.executing) return false;
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

  // Trusted host frames only. This uses the same fixed step and executor as local play/replay.
  followFrame(tick: number, entries: readonly RecordedBattleCommand[], runtime: BattleSessionRuntime) {
    if (!this.replica || this.advancing || this.executing) throw new Error("Replica is unavailable");
    if (!Number.isSafeInteger(tick) || tick < this.clock.tick || tick - this.clock.tick > MAX_REPLICA_FRAME_TICKS ||
        entries.length > MAX_REPLICA_FRAME_COMMANDS || entries.some((entry, index) => entry.tick < this.clock.tick ||
          entry.sequence !== this.nextCommandSequence + index || !["operation", "control"].includes(entry.command.type))) {
      throw new Error("Invalid replica frame");
    }
    validateReplay({ ...this.recording, commands: entries.map((entry, sequence) => ({ ...entry, sequence })), endTick: tick });
    const frame = structuredClone(entries);
    this.advancing = true;
    try {
      let cursor = 0;
      const apply = () => {
        while (cursor < frame.length && frame[cursor].tick === this.clock.tick) {
          const entry = frame[cursor++];
          this.recording.commands.push(entry);
          this.execute(entry.command, runtime.executeCommand);
        }
      };
      // Rendering backlog and speed do not decide how many authoritative ticks to reproduce.
      this.clock.restore({ tick: this.clock.tick, remainder: 0 });
      apply();
      while (this.clock.tick < tick) {
        if (this.controls.paused || !runtime.canAdvance()) throw new Error("Replica cannot advance to host tick");
        this.clock.advance(BATTLE_STEP_MS, () => { runtime.step(); return false; });
        apply();
      }
    } finally { this.advancing = false; }
  }

  recordedCommands(from: number, limit = MAX_REPLICA_FRAME_COMMANDS) {
    if (!Number.isSafeInteger(from) || from < this.commandOffset || from > this.nextCommandSequence ||
        !Number.isSafeInteger(limit) || limit < 0 || limit > MAX_REPLICA_FRAME_COMMANDS) throw new Error("Invalid command range");
    return structuredClone(this.recording.commands.slice(from - this.commandOffset, from - this.commandOffset + limit)
      .map(entry => ({ ...entry, sequence: entry.sequence + this.commandOffset })));
  }

  // A durable host restores its global command cursor; the new replay stays checkpoint-relative.
  restoreCommandOffset(sequence: number) {
    if (!this.atBoundary || this.replay || this.replica || this.recording.commands.length || !this.recording.checkpoint ||
        !Number.isSafeInteger(sequence) || sequence < 0 || sequence >= Number.MAX_SAFE_INTEGER) throw new Error("Invalid restored command cursor");
    this.commandOffset = sequence;
    this.epoch++;
  }

  checkpointReplay(checkpoint: SaveGraph, selectedCards: readonly CardId[]): BattleReplay {
    const { commands: _commands, checkpoint: _checkpoint, endTick: _endTick, ...header } = this.recording;
    return structuredClone({ ...header, selectedCards: [...selectedCards], checkpoint, commands: [], endTick: this.clock.tick });
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
      ...(participants ? { participants: structuredClone(this.actors) } : {}),
      ...(this.savedPolicy ? { policy: structuredClone(this.savedPolicy) } : {}),
      controls: copyBattleControlState(this.controls) };
  }

  restore(state: BattleSessionSnapshot | undefined, battleTime: number, legacyControls?: BattleControlState) {
    if (state && !canRestoreBattleVersion(state.version)) throw new Error("Incompatible battle rules");
    if (!state && (!Number.isFinite(battleTime) || battleTime < 0)) throw new Error("Invalid legacy battle time");
    const clock = state?.clock ?? { tick: Math.floor(battleTime / BATTLE_STEP_MS), remainder: 0 };
    if (!validBattleClock(clock)) throw new Error("Invalid battle clock");
    if (state && (!Number.isSafeInteger(state.randomState) || state.randomState < 0 || state.randomState > 0xffffffff)) {
      throw new Error("Invalid battle random state");
    }
    const actors = copyBattleParticipants(state?.participants);
    if (this.replay && !sameBattleParticipants(actors, this.actors)) throw new Error("Replay participants differ from checkpoint");
    const policy = state?.policy !== undefined ? copyBattlePolicy(state.policy) : this.replay ? undefined : this.savedPolicy;
    if (this.replay && !sameBattlePolicy(policy ?? LEGACY_BATTLE_POLICY, this.policy)) throw new Error("Replay policy differs from checkpoint");
    if (this.replay && (this.replay.endTick < clock.tick || this.replay.commands.some(entry => entry.tick < clock.tick))) {
      throw new Error("Replay predates checkpoint");
    }
    const controls = copyBattleControlState(state?.controls !== undefined ? state.controls : legacyControls ?? {
      ...createBattleControlState(), debugEnabled: (this.replay ?? this.recording).debug
    });
    this.clock.restore(clock);
    Object.assign(this.controls, controls);
    this.actors = actors;
    this.savedPolicy = policy;
    if (!this.replay) {
      if (state?.participants) this.recording.participants = structuredClone(actors);
      else delete this.recording.participants;
      if (policy) this.recording.policy = structuredClone(policy);
      else delete this.recording.policy;
    }
    if (state) this.random.state = state.randomState;
    this.replayCursor = 0;
    this.epoch++;
  }

  startRecordingFromCheckpoint(checkpoint: SaveGraph, selectedCards: readonly CardId[]) {
    if (this.replay) return;
    this.epoch++;
    this.commandOffset = 0;
    this.recording = { ...this.recording, selectedCards: [...selectedCards],
      checkpoint: structuredClone(checkpoint), commands: [] };
  }

  exportReplay(): BattleReplay {
    return structuredClone(this.replay ?? { ...this.recording, endTick: this.clock.tick });
  }
}
