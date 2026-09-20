import type Phaser from "phaser";
import type { EdgeTower } from "../types";
import { edgePosition } from "../game/projectileCircuit";

export function drawCircuitEdges(graphics: Phaser.GameObjects.Graphics, edges: EdgeTower[],
  active: (edge: EdgeTower) => boolean, preview?: EdgeTower, canPlace = false) {
  graphics.clear();
  const draw = (edge: EdgeTower, color: number, alpha: number) => {
    const { x, y } = edgePosition(edge), horizontal = edge.axis === "horizontal";
    graphics.lineStyle(3, color, alpha);
    for (const offset of [-4, 4]) {
      if (horizontal) graphics.lineBetween(x - 13, y + offset, x + 13, y + offset);
      else graphics.lineBetween(x + offset, y - 13, x + offset, y + 13);
    }
  };
  for (const edge of edges) draw(edge, active(edge) ? 0x8ce4ba : 0xd6d6d6, .95);
  if (preview) draw(preview, canPlace ? 0x8ce4ba : 0xff7070, .55);
}
