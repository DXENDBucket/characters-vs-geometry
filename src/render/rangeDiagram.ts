import Phaser from "phaser";
import { palette } from "../config";
import type { DetailRange } from "../encyclopediaRanges";

/** Every diagram has a fixed drawing box; cell size adapts to the declared geometry. */
export function drawRangeDiagram(
  scene: Phaser.Scene, parent: Phaser.GameObjects.Container, range: DetailRange,
  x: number, y: number, width: number, height: number, color = 0x9cdfff
) {
  if (range.shape.kind === "nonSpatial") return;
  const { left, right, top, bottom, cells, extensions } = range.diagram;
  const columns = right - left + 1, rows = bottom - top + 1;
  const size = Math.min(18, (width - 20) / columns, (height - 20) / rows);
  const ox = x + (width - columns * size) / 2 - left * size + size / 2;
  const oy = y + (height - rows * size) / 2 - top * size + size / 2;
  const graphics = scene.add.graphics().setName("range-diagram").setData("range", range);
  parent.add(graphics);
  const continuous = ["circle", "rectangle", "column", "row", "fan"].includes(range.shape.kind);
  for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
    const active = !continuous && cells.some(([cx, cy]) => cx === col && cy === row);
    graphics.fillStyle(active ? color : palette.dim, active ? .7 : .35);
    graphics.fillRect(ox + (col - .5) * size + 1, oy + (row - .5) * size + 1, size - 2, size - 2);
  }
  graphics.fillStyle(color, .35).lineStyle(1.5, color, .95);
  const shape = range.shape;
  if (shape.kind === "circle") {
    graphics.fillCircle(ox, oy, shape.radius * size).strokeCircle(ox, oy, shape.radius * size);
  } else if (shape.kind === "rectangle" || shape.kind === "column") {
    const halfHeight = shape.kind === "column" ? (bottom - top + 1) / 2 : shape.halfHeight;
    graphics.fillRect(ox - shape.halfWidth * size, oy - halfHeight * size, shape.halfWidth * size * 2, halfHeight * size * 2);
    if (shape.kind === "rectangle") graphics.strokeRect(ox - shape.halfWidth * size, oy - halfHeight * size, shape.halfWidth * size * 2, halfHeight * size * 2);
  } else if (shape.kind === "row") {
    graphics.fillRect(ox + (left - .5) * size, oy - shape.halfHeight * size, columns * size, shape.halfHeight * size * 2);
  } else if (shape.kind === "fan") {
    const horizontal = shape.direction === "right";
    const distance = horizontal ? right + .5 : shape.direction === "up" ? -top + .5 : bottom + .5;
    const end = distance * size * (shape.direction === "up" ? -1 : 1);
    const farWidth = (shape.halfWidth + shape.slope * distance) * size;
    const points = horizontal
      ? [[ox, oy - shape.halfWidth * size], [ox + end, oy - farWidth], [ox + end, oy + farWidth], [ox, oy + shape.halfWidth * size]]
      : [[ox - shape.halfWidth * size, oy], [ox - farWidth, oy + end], [ox + farWidth, oy + end], [ox + shape.halfWidth * size, oy]];
    graphics.beginPath(); graphics.moveTo(points[0][0], points[0][1]);
    for (const [px, py] of points.slice(1)) graphics.lineTo(px, py);
    graphics.closePath(); graphics.fillPath(); graphics.strokePath();
  }
  graphics.lineStyle(1.5, range.origin === "impact" ? palette.white : 0xffdd88);
  graphics.strokeRect(ox - size / 2 + 1, oy - size / 2 + 1, size - 2, size - 2);
  if (range.origin === "impact") {
    graphics.lineBetween(ox - 3, oy, ox + 3, oy); graphics.lineBetween(ox, oy - 3, ox, oy + 3);
  }
  graphics.lineStyle(1.5, color);
  for (const direction of extensions) {
    const dx = direction === "left" ? -1 : direction === "right" ? 1 : 0;
    const dy = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    const ax = ox + (dx < 0 ? left - .5 : dx > 0 ? right + .5 : 0) * size + dx * 5;
    const ay = oy + (dy < 0 ? top - .5 : dy > 0 ? bottom + .5 : 0) * size + dy * 5;
    for (const offset of [0, 4]) {
      const tipX = ax + dx * offset, tipY = ay + dy * offset;
      graphics.lineBetween(tipX - dx * 3 - dy * 3, tipY - dy * 3 + dx * 3, tipX, tipY);
      graphics.lineBetween(tipX - dx * 3 + dy * 3, tipY - dy * 3 - dx * 3, tipX, tipY);
    }
  }
}
