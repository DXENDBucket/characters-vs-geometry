import type { CardId } from "../types";
import type { TutorialToolId } from "./tutorial";

export interface GuidedTutorialCopy { lesson: number; titleKey: string; bodyKey: string; buttonKey?: string }
export type TutorialHighlight =
  | { type: "card"; id: CardId } | { type: "cell"; lane: number; column: number }
  | { type: "tool"; id: TutorialToolId } | { type: "enemies" } | { type: "direction"; lane: number }
  | { type: "placement"; id: CardId; lane: number; column: number };

// Derived presentation instructions only. Rendering and animation never feed lesson rules.
export class TutorialPresentation {
  copy!: GuidedTutorialCopy;
  readonly highlights: TutorialHighlight[] = [];
  showCategories = false;
  damage?: { index: number; fired: boolean };
  constructor(readonly totalLessons: number, readonly progressKey: string) {}
  setCopy(copy: GuidedTutorialCopy) { this.copy = { ...copy }; }
  beginHighlights() { this.highlights.length = 0; }
  drawCardHighlight(id: CardId) { this.highlights.push({ type: "card", id }); }
  drawCellHighlight(lane: number, column: number) { this.highlights.push({ type: "cell", lane, column }); }
  drawToolHighlight(id: TutorialToolId) { this.highlights.push({ type: "tool", id }); }
  drawEnemyHighlights() { this.highlights.push({ type: "enemies" }); }
  drawLaneDirectionGuide(lane: number) { this.highlights.push({ type: "direction", lane }); }
  drawPlacementHint(id: CardId, lane: number, column: number) { this.highlights.push({ type: "placement", id, lane, column }); }
}
