import type Phaser from "phaser";

export function drawParenthesisBorder(graphics: Phaser.GameObjects.Graphics, color: number, width = 3, offset = 0) {
  graphics.clear().lineStyle(width, color, 0.95);
  for (const side of [-1, 1]) {
    graphics.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, x = side * (27 + offset + 7 * Math.sin(t * Math.PI)), y = -24 + t * 48;
      if (i === 0) graphics.moveTo(x, y); else graphics.lineTo(x, y);
    }
    graphics.strokePath();
  }
}
