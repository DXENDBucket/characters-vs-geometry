import Phaser from "phaser";
import { CELL_WIDTH, CELL_HEIGHT, palette } from "../config";
import { drawParenthesisBorder } from "./parenthesisTower";

export interface BoardToolHint {
  x: number;
  y: number;
  shape: "tower" | "parenthesis" | "edge" | "cell";
  action: "select" | "deselect" | "autoOn" | "autoOff" | "erase" | "invalid";
}

export function drawTowerSelection(graphics: Phaser.GameObjects.Graphics, parenthesis: boolean, color = palette.magic) {
  if (parenthesis) drawParenthesisBorder(graphics, color, 2, 1);
  else graphics.lineStyle(2, color, .85).strokeRect(-24, -24, 48, 48);
}

/** A cached visual-only overlay; does not alter tower state or consume pointer input. */
export class BoardToolPreview {
  private readonly body: Phaser.GameObjects.Container;
  private key = "";

  constructor(private readonly scene: Phaser.Scene) {
    this.body = scene.add.container(0, 0).setDepth(60);
  }

  show(hints: readonly BoardToolHint[]) {
    const key = hints.map(hint => `${hint.x}:${hint.y}:${hint.shape}:${hint.action}`).join("|");
    if (key === this.key) return;
    this.clear(); this.key = key;
    for (const hint of hints) {
      const color = hint.action === "erase" || hint.action === "invalid" ? 0xff7070
        : hint.action === "autoOn" ? palette.green : hint.action === "autoOff" || hint.action === "deselect" ? palette.gold : palette.magic;
      const mark = this.scene.add.graphics().setPosition(hint.x, hint.y).setAlpha(.7);
      this.body.add(mark);
      if (hint.shape === "parenthesis") drawParenthesisBorder(mark, color, 3, 1);
      else if (hint.shape === "edge") mark.lineStyle(2, color, .9).strokeRect(-18, -15, 36, 30);
      else if (hint.shape === "cell") mark.lineStyle(2, color, .6).strokeRect(-CELL_WIDTH / 2 + 5, -CELL_HEIGHT / 2 + 5, CELL_WIDTH - 10, CELL_HEIGHT - 10);
      else if (hint.action === "autoOn" || hint.action === "autoOff") mark.lineStyle(2, color, .9).strokeCircle(0, 0, 24);
      else drawTowerSelection(mark, false, color);
      const symbol = hint.action === "erase" || hint.action === "invalid" ? "×"
        : hint.action === "deselect" || hint.action === "autoOff" ? "−" : hint.action === "autoOn" ? "↑" : "+";
      const x = hint.shape === "parenthesis" ? 32 : hint.shape === "edge" ? 0 : 19;
      const label = this.scene.add.text(hint.x + x, hint.y - 24, symbol, {
        fontFamily: "monospace", fontSize: "18px", color: `#${color.toString(16).padStart(6, "0")}`,
        stroke: "#000000", strokeThickness: 3
      }).setOrigin(.5).setAlpha(.85);
      this.body.add(label);
    }
  }

  clear() { this.key = ""; this.body.removeAll(true); }
}
