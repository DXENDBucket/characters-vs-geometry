import type Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } from "../config";
import type { TimedCellSeal } from "../game/timedCellSeals";

export function drawTimedCellSeals(graphics: Phaser.GameObjects.Graphics, seals: readonly TimedCellSeal[], time: number) {
  graphics.clear();
  for (const seal of seals) {
    if (time < seal.warnedAt) continue;
    const x = BOARD_X + seal.column * CELL_WIDTH, y = BOARD_Y + seal.lane * CELL_HEIGHT;
    const cx = x + CELL_WIDTH / 2, cy = y + CELL_HEIGHT / 2;
    if (seal.active) {
      graphics.lineStyle(6, 0x2a0000, 1);
      graphics.lineBetween(cx - 15, cy - 15, cx + 15, cy + 15);
      graphics.lineBetween(cx - 15, cy + 15, cx + 15, cy - 15);
      graphics.lineStyle(3, 0xff4d4d, .82);
      graphics.lineBetween(cx - 15, cy - 15, cx + 15, cy + 15);
      graphics.lineBetween(cx - 15, cy + 15, cx + 15, cy - 15);
    } else {
      const progress = Math.min(1, Math.max(0, (time - seal.warnedAt) / (seal.sealsAt - seal.warnedAt)));
      const pulse = .55 + .35 * Math.sin((time - seal.warnedAt) * .014);
      graphics.fillStyle(0xff4d4d, .08 + pulse * .08);
      graphics.fillRect(x + 3, y + 3, CELL_WIDTH - 6, CELL_HEIGHT - 6);
      graphics.lineStyle(2, 0xff4d4d, pulse);
      graphics.strokeRect(x + 3, y + 3, CELL_WIDTH - 6, CELL_HEIGHT - 6);
      graphics.fillStyle(0xff4d4d, .9);
      graphics.fillRect(x + 6, y + CELL_HEIGHT - 9, (CELL_WIDTH - 12) * progress, 3);
    }
  }
}
