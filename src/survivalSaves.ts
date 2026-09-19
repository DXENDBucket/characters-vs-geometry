import { levelConfigs } from "./data/levels";
import { cardDefinitions } from "./data/cards";
import { isEnemyKind } from "./game/enemyIdentity";
import { validateSaveGraph, type SaveGraph } from "./game/saveGraph";
import { validateBattleSave } from "./game/validateBattleSave";
import type { CardId } from "./types";

const PREFIX = "charset-survival-v1:";
const cards = new Set<string>(cardDefinitions.map(card => card.id));
export interface SurvivalSave {
  version: 1;
  levelId: string;
  savedAt: number;
  wave: number;
  difficulty: number;
  unlimitedFirepower: boolean;
  selectedCards: CardId[];
  graph: SaveGraph;
}

function validate(save: SurvivalSave) {
  if (!save || save.version !== 1 || !Object.hasOwn(levelConfigs, save.levelId) || !levelConfigs[save.levelId].survival ||
      !Number.isSafeInteger(save.wave) || save.wave < 0 || !Number.isFinite(save.savedAt) ||
      !Number.isInteger(save.difficulty) || save.difficulty < 0 || save.difficulty > 8 ||
      typeof save.unlimitedFirepower !== "boolean" || !Array.isArray(save.selectedCards) ||
      save.selectedCards.length > 10 || save.selectedCards.some(id => !cards.has(id))) throw new Error("Invalid survival save");
  validateSaveGraph(save.graph);
  for (const node of save.graph.nodes) {
    const data = node.data;
    if (node.kind === "tower" && !cards.has(data.type as string)) throw new Error("Unknown saved tower");
    if (node.kind === "enemy" && !isEnemyKind(data.kind)) throw new Error("Unknown saved enemy");
    if (node.kind !== "object" && node.kind !== "array") {
      for (const field of ["x", "y"]) if (typeof data[field] !== "number" || !Number.isFinite(data[field])) throw new Error("Invalid unit position");
      if ("body" in data || "shape" in data) throw new Error("Visual objects cannot be loaded from saves");
    }
  }
  validateBattleSave(save.graph, save.wave);
}

export function readSurvivalSave(levelId: string): SurvivalSave | undefined {
  try {
    const raw = window.localStorage.getItem(PREFIX + levelId);
    if (!raw) return;
    const save = JSON.parse(raw) as SurvivalSave;
    validate(save);
    if (save.levelId === levelId) return save;
  } catch {
    // Leave unrecognized saves intact until an explicit new run or progress reset.
  }
}

export function writeSurvivalSave(save: SurvivalSave): boolean {
  try {
    validate(save);
    window.localStorage.setItem(PREFIX + save.levelId, JSON.stringify(save));
    return true;
  } catch { return false; }
}

export function deleteSurvivalSave(levelId: string) {
  try { window.localStorage.removeItem(PREFIX + levelId); } catch { /* Storage may be disabled. */ }
}

export function clearSurvivalSaves() {
  for (const level of Object.values(levelConfigs)) if (level.survival) deleteSurvivalSave(level.id);
}
