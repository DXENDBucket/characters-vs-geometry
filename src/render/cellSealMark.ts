import type Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } from "../config";

export function createCellSealMark(scene: Phaser.Scene, lane: number, column: number, depth = 1) {
  return scene.add.text(BOARD_X + (column + .5) * CELL_WIDTH, BOARD_Y + (lane + .5) * CELL_HEIGHT - 2, "×", {
    color: "#ff4d4d", fontFamily: "monospace", fontSize: "58px", fontStyle: "700"
  }).setOrigin(.5).setDepth(depth).setAlpha(.82).setStroke("#2a0000", 4);
}
