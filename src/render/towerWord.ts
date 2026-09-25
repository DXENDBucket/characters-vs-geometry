import type Phaser from "phaser";
import { palette, uiTextColors } from "../config";
import { getCardDefinition } from "../registry/cardDefinitions";
import type { CardId } from "../types";
import { createUnitBorder } from "./unitShapes";

export function createTowerWord(scene: Phaser.Scene, letters: readonly CardId[], spacing = 128) {
  const word = scene.add.container(0, 0);
  letters.forEach((id, index) => {
    const tower = scene.add.container((index - (letters.length - 1) / 2) * spacing, 0);
    const category = getCardDefinition(id).category;
    const border = createUnitBorder(scene, category, 51, category === "defense" ? 3 : 2);
    const label = scene.add.text(0, category === "function" ? 3 : -3, id, {
      fontFamily: "monospace", fontSize: "54px", fontStyle: "700", color: uiTextColors.primary
    }).setOrigin(0.5);
    const hp = scene.add.rectangle(0, 73, 42, 3, palette.white, 0.75);
    tower.add([border, label, hp]);
    word.add(tower);
  });
  return word;
}
