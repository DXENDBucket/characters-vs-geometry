import type Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } from "../config";
import type { TimedCellSeal } from "../game/timedCellSeals";
import { timedCellSealScale } from "../game/timedCellSeals";
import { createCellSealMark } from "./cellSealMark";

const markCaches = new WeakMap<Phaser.GameObjects.Graphics, Map<string, Phaser.GameObjects.Text>>();

function sealMarks(graphics: Phaser.GameObjects.Graphics) {
  let marks = markCaches.get(graphics);
  if (!marks) {
    marks = new Map();
    markCaches.set(graphics, marks);
    const ownedMarks = marks;
    graphics.once("destroy", () => {
      for (const mark of ownedMarks.values()) mark.destroy();
      ownedMarks.clear();
      markCaches.delete(graphics);
    });
  }
  return marks;
}

export function drawTimedCellSeals(graphics: Phaser.GameObjects.Graphics, seals: readonly TimedCellSeal[], time: number,
  warningGraphics = graphics) {
  graphics.clear();
  if (warningGraphics !== graphics) warningGraphics.clear();
  // Reuse Text objects; changing scale does not rerasterize the glyph every frame.
  const marks = sealMarks(graphics);
  const scales = new Map<string, { lane: number; column: number; scale: number }>();
  for (const seal of seals) {
    if (time < seal.warnedAt) continue;
    const x = BOARD_X + seal.column * CELL_WIDTH, y = BOARD_Y + seal.lane * CELL_HEIGHT;
    if (seal.active) {
      if (time >= seal.expiresAt) continue;
      const key = `${seal.lane}:${seal.column}`, scale = timedCellSealScale(seal, time);
      if (scale > (scales.get(key)?.scale ?? 0)) scales.set(key, { lane: seal.lane, column: seal.column, scale });
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
  for (const [key, entry] of scales) {
    let mark = marks.get(key);
    if (!mark) {
      mark = createCellSealMark(graphics.scene, entry.lane, entry.column, graphics.depth);
      graphics.parentContainer?.add(mark);
      if (!graphics.parentContainer && graphics.displayList !== graphics.scene.children) graphics.displayList?.add(mark);
      marks.set(key, mark);
    }
    mark.setScale(entry.scale);
  }
  for (const [key, mark] of marks) {
    if (scales.has(key)) continue;
    mark.destroy();
    marks.delete(key);
  }
}
