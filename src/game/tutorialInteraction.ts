import { COLUMNS, LANES } from "../config";
import { parseBattleEntityId } from "./battleEntityIds";

// Tutorial observations are explicit lesson input, not another player's UI selection.
export interface TutorialInteraction {
  tool: "none" | "erase" | "autoUpgrade" | "shifter";
  selected: string[];
}

export function createTutorialInteraction(): TutorialInteraction { return { tool: "none", selected: [] }; }

export function validTutorialInteraction(value: unknown): value is TutorialInteraction {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 2 && Object.hasOwn(input, "tool") && Object.hasOwn(input, "selected") &&
    ["none", "erase", "autoUpgrade", "shifter"].includes(input.tool as string) && Array.isArray(input.selected) &&
    input.selected.length <= LANES * COLUMNS * 2 && (input.tool === "shifter" || input.selected.length === 0) &&
    Array.from(input.selected).every(id => typeof id === "string" && id.length <= 40 && parseBattleEntityId(id)?.kind === "tower") &&
    new Set(input.selected).size === input.selected.length;
}

export function sameTutorialInteraction(a: TutorialInteraction, b: TutorialInteraction) {
  return a.tool === b.tool && a.selected.length === b.selected.length && a.selected.every((id, index) => id === b.selected[index]);
}
