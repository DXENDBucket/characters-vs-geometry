import type Phaser from "phaser";
import type { CardId } from "../types";

export function drawTowerShellBorder(graphics: Phaser.GameObjects.Graphics, color: number, width = 3, offset = 0, type: CardId = "()") {
  graphics.clear().lineStyle(width, color, 0.95);
  for (const side of [-1, 1]) {
    graphics.beginPath();
    if (type === "[]") {
      const outer = side * (34 + offset), inner = side * (26 + offset);
      graphics.moveTo(inner, -24);
      graphics.lineTo(outer, -24);
      graphics.lineTo(outer, 24);
      graphics.lineTo(inner, 24);
      graphics.strokePath();
      continue;
    }
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, x = side * (27 + offset + 7 * Math.sin(t * Math.PI)), y = -24 + t * 48;
      if (i === 0) graphics.moveTo(x, y); else graphics.lineTo(x, y);
    }
    graphics.strokePath();
  }
}
