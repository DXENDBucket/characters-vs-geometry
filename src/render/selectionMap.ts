import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, palette } from "../config";

export function createSelectionMapViewport() {
  return new Phaser.Geom.Rectangle(38, 130, GAME_WIDTH - 76, GAME_HEIGHT - 220);
}

export function drawSelectionMapFrame(scene: Phaser.Scene, viewport: Phaser.Geom.Rectangle) {
  const frame = scene.add.graphics().setName("selection-map-frame");
  frame.lineStyle(1, palette.dim, 1);
  frame.strokeRect(viewport.x, viewport.y, viewport.width, viewport.height);
  return frame;
}
