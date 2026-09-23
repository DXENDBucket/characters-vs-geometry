import type Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } from "../config";
import type { TimedCellSeal } from "../game/timedCellSeals";
import { timedCellSealScale } from "../game/timedCellSeals";

export function drawTimedCellSeals(graphics: Phaser.GameObjects.Graphics, seals: readonly TimedCellSeal[], time: number,
  warningGraphics = graphics) {
  graphics.clear();
  if (warningGraphics !== graphics) warningGraphics.clear();
  for (const seal of seals) {
    if (time < seal.warnedAt) continue;
    const x = BOARD_X + seal.column * CELL_WIDTH, y = BOARD_Y + seal.lane * CELL_HEIGHT;
    const cx = x + CELL_WIDTH / 2, cy = y + CELL_HEIGHT / 2;
    if (seal.active) {
      const scale = timedCellSealScale(seal, time), halfSize = 15 * scale;
      graphics.lineStyle(6 * scale, 0x2a0000, 1);
      graphics.lineBetween(cx - halfSize, cy - halfSize, cx + halfSize, cy + halfSize);
      graphics.lineBetween(cx - halfSize, cy + halfSize, cx + halfSize, cy - halfSize);
      graphics.lineStyle(3 * scale, 0xff4d4d, .82);
      graphics.lineBetween(cx - halfSize, cy - halfSize, cx + halfSize, cy + halfSize);
      graphics.lineBetween(cx - halfSize, cy + halfSize, cx + halfSize, cy - halfSize);
    } else {
      const progress = Math.min(1, Math.max(0, (time - seal.warnedAt) / (seal.sealsAt - seal.warnedAt)));
      const pulse = .55 + .35 * Math.sin((time - seal.warnedAt) * .014);
      warningGraphics.fillStyle(0xff4d4d, .08 + pulse * .08);
      warningGraphics.fillRect(x + 3, y + 3, CELL_WIDTH - 6, CELL_HEIGHT - 6);
      warningGraphics.lineStyle(2, 0xff4d4d, pulse);
      warningGraphics.strokeRect(x + 3, y + 3, CELL_WIDTH - 6, CELL_HEIGHT - 6);
      warningGraphics.fillStyle(0xff4d4d, .9);
      warningGraphics.fillRect(x + 6, y + CELL_HEIGHT - 9, (CELL_WIDTH - 12) * progress, 3);
    }
  }
}
