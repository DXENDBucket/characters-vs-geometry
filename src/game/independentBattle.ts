import type { BattleReplay } from "./battleCommands";
import type { BattleSessionOptions } from "./battleSession";
import { createBattleContext } from "./battleSetup";
import { BattleRuntime } from "./battleRuntime";
import { captureBattleSnapshot } from "./captureBattleSnapshot";
import { restoreBattleData } from "./restoreBattleData";
import { validateBattleSave } from "./validateBattleSave";
import type { SaveGraph } from "./saveGraph";
import { decodeSaveGraph } from "./saveGraph";
import type { BattleSaveData } from "./battleSaveState";

export interface IndependentBattleOptions {
  playback?: BattleReplay;
  replica?: boolean;
  checkpoint?: SaveGraph;
}

// Headless host, replica and semantic replay entry point; no timer, transport or profile.
export function createIndependentBattle(options: BattleSessionOptions, mode: IndependentBattleOptions = {}) {
  const { session, world } = createBattleContext(options, mode.playback, mode.replica);
  if (mode.playback?.commands.some(entry => entry.command.type !== "operation" && entry.command.type !== "control")) {
    throw new Error("Legacy input replay requires a local input adapter");
  }
  const runtime = new BattleRuntime(world, session);
  const checkpoint = mode.checkpoint ?? mode.playback?.checkpoint;
  if (mode.replica && !checkpoint) throw new Error("Replica requires a checkpoint");
  if (checkpoint) {
    const saved = decodeSaveGraph<BattleSaveData>(checkpoint, () => ({}));
    validateBattleSave(checkpoint, saved.wave, world.options.level.bossKind);
    if (saved.cardDeadlines.length !== world.loadout.ids.length || saved.cardDeadlines.some((card, index) => card.id !== world.loadout.ids[index])) {
      throw new Error("Checkpoint loadout differs from battle configuration");
    }
    runtime.restore(restoreBattleData(checkpoint));
    if (!mode.playback) session.startRecordingFromCheckpoint(captureBattleSnapshot(runtime.snapshot(world.loadout.ids[0])), world.loadout.ids);
  } else runtime.initialize();
  return runtime;
}
