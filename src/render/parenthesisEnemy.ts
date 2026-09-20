import type Phaser from "phaser";
import type { Enemy } from "../types";
import { parenthesisHalfSpan } from "../game/enemyContainers";

export function drawParentheses(frame: Phaser.GameObjects.Graphics, halfWidth: number) {
  frame.clear().lineStyle(3, 0xf5f5f5, 1);
  for (const side of [-1, 1]) {
    frame.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = side * (halfWidth - 12 * (2 * t - 1) ** 2);
      const y = -28 + t * 56;
      if (i === 0) frame.moveTo(x, y); else frame.lineTo(x, y);
    }
    frame.strokePath();
  }
}

export function syncParenthesisVisual(enemy: Enemy) {
  const frame = enemy.shape.getData("parenthesisFrame") as Phaser.GameObjects.Graphics | undefined;
  if (!frame) return;
  const width = 28 + parenthesisHalfSpan(enemy);
  if (frame.getData("width") === width) return;
  frame.setData("width", width);
  drawParentheses(frame, width);
  const label = enemy.shape.getData("parenthesisLabel") as Phaser.GameObjects.Text | undefined;
  label?.setY(enemy.parenthesisCargo?.length ? -62 : -42);
  enemy.frozenBorder.setSize(width * 2 + 8, 64);
}
