import type Phaser from "phaser";
import type { EdgeTower } from "../types";
import { edgeKey, edgePosition } from "../game/projectileCircuit";

const labels = new WeakMap<Phaser.GameObjects.Graphics, Map<string, Phaser.GameObjects.Text>>();

export function drawCircuitEdges(graphics: Phaser.GameObjects.Graphics, edges: EdgeTower[],
  active: (edge: EdgeTower) => boolean, preview?: EdgeTower, canPlace = false, autoEnabled = true) {
  graphics.clear();
  let texts = labels.get(graphics);
  if (!texts) {
    texts = new Map(); labels.set(graphics, texts);
    graphics.once("destroy", () => { for (const text of texts!.values()) text.destroy(); texts!.clear(); });
  }
  const draw = (edge: EdgeTower, color: number, alpha: number) => {
    const { x, y } = edgePosition(edge), horizontal = edge.axis === "horizontal", mode = edge.mode ?? "=";
    const line = (ax: number, ay: number, bx: number, by: number) => horizontal
      ? graphics.lineBetween(x + ax, y + ay, x + bx, y + by)
      : graphics.lineBetween(x + ay, y + ax, x + by, y + bx);
    graphics.lineStyle(3, color, alpha);
    if (mode === ">" || mode === "<") {
      const direction = mode === ">" ? 1 : -1;
      line(-8 * direction, -9, 8 * direction, 0); line(8 * direction, 0, -8 * direction, 9);
    } else {
      for (const offset of [-4, 4]) line(-13, offset, 13, offset);
      if (mode === "!=") line(-9, 12, 9, -12);
    }
    if (edge.autoUpgrade) {
      graphics.lineStyle(1, 0x8ce4ba, autoEnabled ? .9 : .3);
      graphics.strokeRect(x - 18, y - 15, 36, 30);
    }
  };
  const visible = new Set<string>();
  for (const edge of edges) {
    draw(edge, edge.mode === "!=" ? 0xc17878 : active(edge) ? 0x8ce4ba : 0xd6d6d6, .95);
    const key = edgeKey(edge), { x, y } = edgePosition(edge); visible.add(key);
    let text = texts.get(key);
    if (!text) {
      text = graphics.scene.add.text(x, y, "", { fontFamily: "monospace", fontSize: "9px", color: "#bdbdbd",
        stroke: "#000000", strokeThickness: 2 }).setOrigin(.5).setDepth(graphics.depth + 1);
      texts.set(key, text);
    }
    text.setPosition(x + (edge.axis === "vertical" ? 19 : 0), y + (edge.axis === "horizontal" ? 18 : 0))
      .setText(String(edge.level ?? 1));
  }
  for (const [key, text] of texts) if (!visible.has(key)) { text.destroy(); texts.delete(key); }
  if (preview) {
    const existing = edges.find(edge => edgeKey(edge) === edgeKey(preview));
    draw(existing ?? preview, canPlace ? 0x8ce4ba : 0xff7070, .55);
  }
}
