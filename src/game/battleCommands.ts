import type { CardId } from "../types";
import type { ToolControlAction } from "../settings/keybindings";
import type { SaveGraph } from "./saveGraph";
import { BATTLE_RULES_VERSION } from "./battleSimulation";
import { validStoredDifficulty } from "../config";
import { validBattleActorId, validBattleOperation, type BattleOperation } from "./battleOperations";
import { validBattleControl, type BattleControl } from "./battleControls";
import { validBattleParticipants, type BattleOperationActor } from "./battleParticipants";

export interface BattlePointer {
  x: number;
  y: number;
  shift: boolean;
  ctrl: boolean;
  right: boolean;
}

export type BattleCommand =
  | { type: "control"; actorId: string; control: BattleControl }
  | { type: "operation"; actorId: string; operation: BattleOperation }
  | { type: "pointer"; pointer: BattlePointer }
  | { type: "selectCard"; id: CardId }
  | { type: "tool"; action: Exclude<ToolControlAction, "tool:pause" | "tool:reselect"> }
  | { type: "reserve"; value: number }
  | { type: "reserveConfirm" }
  | { type: "cancelTargeting" }
  | { type: "debugMode"; enabled: boolean }
  | { type: "tutorialAdvance" }
  | { type: "reselect"; cards: CardId[] };

export interface RecordedBattleCommand { tick: number; sequence: number; command: BattleCommand }
export interface BattleReplay {
  version: typeof BATTLE_RULES_VERSION;
  levelId: string;
  difficulty: number;
  difficultyVersion?: number;
  unlimitedFirepower: boolean;
  selectedCards: CardId[];
  debug: boolean;
  seed: number;
  endTick: number;
  commands: RecordedBattleCommand[];
  checkpoint?: SaveGraph;
  participants?: readonly BattleOperationActor[];
}

export function validateReplay(replay: BattleReplay) {
  if (!replay || typeof replay.levelId !== "string" || !validStoredDifficulty(replay.difficulty, replay.difficultyVersion) ||
      ((replay.difficultyVersion ?? 1) === 1 && (replay.difficulty === 0 || replay.difficulty === 9)) ||
      typeof replay.unlimitedFirepower !== "boolean" || typeof replay.debug !== "boolean" ||
      !Array.isArray(replay.selectedCards) || !replay.selectedCards.length || replay.selectedCards.length > 10 ||
      replay.selectedCards.some(id => typeof id !== "string") ||
      replay.version !== BATTLE_RULES_VERSION || !Number.isSafeInteger(replay.seed) || replay.seed < 0 ||
      replay.seed > 0xffffffff || !Number.isSafeInteger(replay.endTick) || replay.endTick < 0 ||
      !Array.isArray(replay.commands) ||
      (replay.participants !== undefined && !validBattleParticipants(replay.participants))) throw new Error("Unsupported battle replay");
  let tick = -1;
  replay.commands.forEach((entry, index) => {
    if (!Number.isSafeInteger(entry.tick) || entry.tick < tick || entry.tick > replay.endTick || entry.sequence !== index)
      throw new Error("Invalid battle command order");
    tick = entry.tick;
    const command = entry.command;
    switch (command.type) {
      case "control":
        if (!validBattleActorId(command.actorId) || !validBattleControl(command.control)) throw new Error("Invalid battle control");
        break;
      case "operation":
        if (!validBattleActorId(command.actorId) || !validBattleOperation(command.operation)) throw new Error("Invalid battle operation");
        break;
      case "pointer":
        if (![command.pointer.x, command.pointer.y].every(Number.isFinite) ||
            ![command.pointer.shift, command.pointer.ctrl, command.pointer.right].every(x => typeof x === "boolean"))
          throw new Error("Invalid battle pointer");
        break;
      case "reserve": if (!Number.isFinite(command.value) || command.value < 0) throw new Error("Invalid reserve"); break;
      case "selectCard": if (typeof command.id !== "string") throw new Error("Invalid card"); break;
      case "reselect": if (!Array.isArray(command.cards) || command.cards.some(id => typeof id !== "string")) throw new Error("Invalid cards"); break;
      case "tool":
        if (!["tool:erase", "tool:autoUpgrade", "tool:shifter", "tool:debugDamage", "tool:superDebugDamage",
          "tool:debugChars", "tool:autoUpgradeEnabled", "tool:autoUpgradeReserve"].includes(command.action)) throw new Error("Invalid tool");
        break;
      case "debugMode": if (typeof command.enabled !== "boolean") throw new Error("Invalid debug mode"); break;
      case "reserveConfirm": case "cancelTargeting": case "tutorialAdvance": break;
      default: throw new Error("Invalid battle command");
    }
  });
}
