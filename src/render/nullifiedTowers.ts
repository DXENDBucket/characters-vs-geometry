import type Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } from "../config";
import type { NullifiedTowers } from "../game/towerNullificationRules";
import { drawNulGlyph } from "./delBoss";

export function drawNullifiedTowers(graphics: Phaser.GameObjects.Graphics, state: NullifiedTowers | undefined, time: number) {
  graphics.clear();
  if (!state) return;
  const drawn = new Set<string>();
  for (const tower of state.towers) {
    const key = `${tower.lane}:${tower.column}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    drawNulGlyph(graphics, BOARD_X+(tower.column+.5)*CELL_WIDTH, BOARD_Y+(tower.lane+.5)*CELL_HEIGHT, time);
  }
}
