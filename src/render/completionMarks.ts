import Phaser from "phaser";
import { palette, uiTextColors } from "../config";

export function createCompletionMarks(scene: Phaser.Scene, x: number, y: number, completed: boolean, difficulty?: number) {
  if (!completed) return [];
  const marks = [scene.add.text(x, y, "\u2713", {
    color: uiTextColors.completed, fontFamily: "monospace", fontSize: "17px", fontStyle: "700"
  }).setOrigin(0.5).setName("completion-mark")];
  if (difficulty !== undefined) {
    marks.push(scene.add.text(x - 14, y, `\u25c7${difficulty}`, {
      color: `#${palette.gold.toString(16)}`, fontFamily: "monospace", fontSize: "15px", fontStyle: "700"
    }).setOrigin(1, 0.5).setName("flawless-mark"));
  }
  return marks;
}
