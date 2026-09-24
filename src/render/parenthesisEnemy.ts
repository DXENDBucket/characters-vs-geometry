import type Phaser from "phaser";
import type { Enemy } from "../types";
import { parenthesisHalfSpan } from "../game/enemyContainers";

export function drawParentheses(frame: Phaser.GameObjects.Graphics, halfWidth: number, scale = 1) {
  frame.clear().lineStyle(3, 0xf5f5f5, 1);
  for (const side of [-1, 1]) {
    frame.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = side * (halfWidth - 6 + (6 - 12 * (2 * t - 1) ** 2) * scale);
      const y = (-28 + t * 56) * scale;
      if (i === 0) frame.moveTo(x, y); else frame.lineTo(x, y);
    }
    frame.strokePath();
  }
}

export function syncParenthesisVisual(enemy: Enemy, scale?: number) {
  const frame = enemy.shape.getData("parenthesisFrame") as Phaser.GameObjects.Graphics | undefined;
  if (!frame) return;
  scale ??= (frame.getData("hpScale") as number | undefined) ?? 1;
  const width = 28 + parenthesisHalfSpan(enemy);
  if (frame.getData("width") === width && frame.getData("hpScale") === scale) return;
  frame.setData("width", width);
  frame.setData("hpScale", scale);
  drawParentheses(frame, width, scale);
  const label = enemy.shape.getData("parenthesisLabel") as Phaser.GameObjects.Image | undefined;
  label?.setY(enemy.parenthesisCargo?.length ? -62 : -42);
  enemy.frozenBorder.setSize(width * 2 + 8, 64);
}
