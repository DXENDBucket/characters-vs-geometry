import type Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH } from "../config";
import type { Tower } from "../types";
import { physicalTowerCell, towerCell, validTowerCell } from "../game/towerTopology";

// Trace the union of physical cells: swapped-out cells become holes and remote
// cells get their own outline, without drawing distracting internal grid lines.
export function drawLogicalTowerRange(graphics: Phaser.GameObjects.Graphics, tower: Tower, radius: number, omitCorners: boolean, color: number, alpha = 1) {
  const origin = towerCell(tower), cells = new Map<string, { lane: number; column: number }>();
  for (let dl = -radius; dl <= radius; dl++) for (let dc = -radius; dc <= radius; dc++) {
    if (omitCorners && Math.abs(dl) === radius && Math.abs(dc) === radius) continue;
    const logical = { lane: origin.lane + dl, column: origin.column + dc };
    if (!validTowerCell(logical)) continue;
    const cell = physicalTowerCell(tower, logical);
    cells.set(`${cell.lane}:${cell.column}`, cell);
  }
  graphics.lineStyle(2, color, alpha);
  for (const cell of cells.values()) {
    const x = BOARD_X + cell.column * CELL_WIDTH - tower.x, y = BOARD_Y + cell.lane * CELL_HEIGHT - tower.y;
    if (!cells.has(`${cell.lane - 1}:${cell.column}`)) graphics.lineBetween(x, y, x + CELL_WIDTH, y);
    if (!cells.has(`${cell.lane + 1}:${cell.column}`)) graphics.lineBetween(x, y + CELL_HEIGHT, x + CELL_WIDTH, y + CELL_HEIGHT);
    if (!cells.has(`${cell.lane}:${cell.column - 1}`)) graphics.lineBetween(x, y, x, y + CELL_HEIGHT);
    if (!cells.has(`${cell.lane}:${cell.column + 1}`)) graphics.lineBetween(x + CELL_WIDTH, y, x + CELL_WIDTH, y + CELL_HEIGHT);
  }
}
