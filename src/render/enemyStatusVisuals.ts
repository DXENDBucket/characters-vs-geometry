import type Phaser from "phaser";
import { palette } from "../config";
import { createSharedGlyph } from "./sharedGlyphs";

export function createEnemyStatusVisuals(scene: Phaser.Scene) {
  const icon = (text: string, y: number, color: string, size = 22) =>
    createSharedGlyph(scene, 0, y, text, { color, fontFamily: "monospace", fontSize: `${size}px`, fontStyle: "700" });
  const visuals = {
    statusBorder: scene.add.circle(0, 0, 28, palette.black, 0).setStrokeStyle(2, palette.magic, 0.92),
    frozenBorder: scene.add.rectangle(0, 0, 56, 56, palette.black, 0).setStrokeStyle(3, palette.magic, 0.92),
    powerIcon: icon("!", -38, "#ff6464"),
    sunderIcon: icon("▣", -56, "#f5f5f5", 20),
    armorIcon: icon("⬡", -38, "#f5f5f5"),
    magicResistanceIcon: icon("⬡", -38, "#9fdcff"),
    flyingHalo: scene.add.ellipse(0, -42, 30, 8, palette.black, 0).setStrokeStyle(2, palette.white, 0.94)
  };
  for (const visual of Object.values(visuals)) visual.setVisible(false);
  return visuals;
}
