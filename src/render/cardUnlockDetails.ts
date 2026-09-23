import type Phaser from "phaser";
import { GAME_WIDTH, palette, uiTextColors } from "../config";
import { towerEncyclopediaEntry } from "../encyclopedia";
import { t } from "../i18n";
import { getCardDefinition } from "../registry/cards";
import type { CardId } from "../types";
import { bindButtonHover } from "./buttonHover";
import { drawTowerShellBorder } from "./parenthesisTower";
import { isTowerShellType } from "../game/towerOccupancy";
import { createUnitBorder } from "./unitShapes";

export function createUnlockedCardDetails(
  container: Phaser.GameObjects.Container, ids: CardId[], onOpen?: (id: CardId) => void, page = 0
) {
  container.removeAll(true);
  const scene = container.scene;
  const text = (x: number, y: number, value: string, size: number, color = uiTextColors.primary) => {
    const result = scene.add.text(x, y, value, { fontFamily: "monospace", fontSize: `${size}px`, color });
    container.add(result);
    return result;
  };
  text(160, 184, t("overlay.cardHint"), 14, uiTextColors.secondary).setWordWrapWidth(960, true);
  ids.slice(page * 2, page * 2 + 2).forEach((id, index) => {
    const entry = towerEncyclopediaEntry(id), card = entry.card ?? getCardDefinition(id);
    const y = 226 + index * 176;
    const row = scene.add.rectangle(GAME_WIDTH / 2, y + 78, 960, 156, palette.panel)
      .setStrokeStyle(1, palette.dim).setName(`unlock-card-${id}`);
    container.add(row);
    const icon = createUnitBorder(scene, card.category, 25, 2).setPosition(202, y + 40);
    container.add(icon);
    const glyph = text(202, y + (card.id === "*" ? 44 : 38), card.id, 24).setOrigin(.5);
    if (isTowerShellType(id)) { drawTowerShellBorder(icon, palette.white, 3, 0, id); icon.setScale(25 / 34); glyph.setVisible(false); }
    const title = text(250, y + 12, entry.title, 20);
    const link = text(1096, y + 14, t("overlay.cardDetails"), 14, uiTextColors.secondary).setOrigin(1, 0);
    text(250, y + 44, id === "?" ? t("overlay.imitatorCost") : t("overlay.cardOverview", {
      cost: card.cost, cooldown: card.cooldown / 1000
    }), 14, uiTextColors.secondary);
    const description = text(250, y + 74, entry.description, 15, uiTextColors.body)
      .setWordWrapWidth(838, true).setLineSpacing(4);
    const lines = description.getWrappedText();
    if (lines.length > 3) description.setText([...lines.slice(0, 2), `${lines[2].slice(0, -3)}...`].join("\n"));
    if (onOpen) {
      row.setInteractive({ useHandCursor: true });
      row.on("pointerdown", (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation(); onOpen(id);
      });
      bindButtonHover(row, [title, link]);
    }
  });
  const pages = Math.ceil(ids.length / 2);
  if (pages <= 1) return;
  text(GAME_WIDTH / 2, 590, `${page + 1} / ${pages}`, 16).setOrigin(.5);
  for (const direction of [-1, 1]) {
    const x = GAME_WIDTH / 2 + direction * 70;
    const enabled = page + direction >= 0 && page + direction < pages;
    const button = scene.add.rectangle(x, 590, 38, 32, palette.black).setStrokeStyle(1, palette.mid)
      .setName(direction < 0 ? "unlock-prev" : "unlock-next").setAlpha(enabled ? 1 : .35);
    container.add(button);
    const label = text(x, 588, direction < 0 ? "<" : ">", 20).setOrigin(.5).setAlpha(enabled ? 1 : .35);
    if (enabled) {
      button.setInteractive({ useHandCursor: true });
      button.on("pointerdown", (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation(); createUnlockedCardDetails(container, ids, onOpen, page + direction);
      });
      bindButtonHover(button, [label]);
    }
  }
}
