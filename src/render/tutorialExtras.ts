import type Phaser from "phaser";
import { BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, palette, uiTextColors } from "../config";
import { DAMAGE_SYMBOLS, t } from "../i18n";
import { createUnitBorder } from "./unitShapes";
import type { UnitCategory } from "../types";
import { damageLessons, damageLessonResult } from "../game/damageTutorialLessons";

const CATEGORY_ITEMS: Array<{ category: UnitCategory; labelKey: string }> = [
  { category: "production", labelKey: "tutorial.types.category.production" },
  { category: "attack", labelKey: "tutorial.types.category.attack" },
  { category: "defense", labelKey: "tutorial.types.category.defense" },
  { category: "function", labelKey: "tutorial.types.category.function" },
  { category: "healing", labelKey: "tutorial.types.category.healing" }
];

export function createCategoryLegend(scene: Phaser.Scene) {
  const width = 850;
  const height = 132;
  const centerX = BOARD_X + BOARD_WIDTH / 2;
  const centerY = BOARD_Y + BOARD_HEIGHT / 2;
  const plate = scene.add.rectangle(0, 0, width, height, palette.black, 0.96).setStrokeStyle(2, palette.mid, 0.92);
  const title = scene.add
    .text(0, -48, t("tutorial.types.legendTitle"), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "15px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const children: Phaser.GameObjects.GameObject[] = [plate, title];
  const gap = 160;
  const startX = -gap * 2;

  CATEGORY_ITEMS.forEach((item, index) => {
    const x = startX + index * gap;
    const border = createUnitBorder(scene, item.category, 18, 2).setPosition(x, -7);
    const label = scene.add
      .text(x, 31, t(item.labelKey), {
        align: "center",
        color: "#d8d8d8",
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "700"
      })
      .setOrigin(0.5, 0);
    children.push(border, label);
  });

  return scene.add.container(centerX, centerY, children).setDepth(168);
}

export function drawDamageTutorial(scene: Phaser.Scene, diagram: Phaser.GameObjects.Container, index: number, fired: boolean) {
  const lesson = damageLessons[index];
  diagram.removeAll(true);
  const backdrop = scene.add.rectangle(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, palette.black, .98)
    .setOrigin(0).setInteractive();
  backdrop.on("pointerdown", (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  diagram.add(backdrop);
  const text = (x: number, y: number, value: string, size = 20, color = uiTextColors.primary, width = BOARD_WIDTH - 72) => {
    const label = scene.add.text(x, y, value, { fontFamily: "monospace", fontSize: `${size}px`, color,
      wordWrap: { width, useAdvancedWrap: true }, lineSpacing: 6 });
    diagram.add(label);
    return label;
  };
  text(BOARD_X + 36, BOARD_Y + 24, t("tutorial.damage.lab"), 18, uiTextColors.secondary);
  if (!lesson) {
    text(BOARD_X + 36, BOARD_Y + 90, t("tutorial.damage.formula"), 26);
    const keys = ["physical", "magic", "true"] as const;
    keys.forEach((type, i) => {
      const color = type === "physical" ? "#f5f5f5" : type === "magic" ? "#9fdcff" : "#ffd75a";
      text(BOARD_X + 36, BOARD_Y + 170 + i * 82, `${DAMAGE_SYMBOLS[type]}  ${t(`tutorial.damage.legend.${type}`)}`, 20, color);
    });
    text(BOARD_X + 36, BOARD_Y + BOARD_HEIGHT - 64, t("tutorial.damage.scope"), 14, uiTextColors.secondary);
    return;
  }
  const result = damageLessonResult(lesson);
  const color = lesson.type === "physical" ? palette.white : lesson.type === "magic" ? palette.magic : palette.gold;
  const sourceX = BOARD_X + 160, targetX = BOARD_X + BOARD_WIDTH - 220, y = BOARD_Y + 210;
  const shape = scene.add.graphics().lineStyle(3, color);
  shape.strokeRect(sourceX - 34, y - 34, 68, 68);
  shape.strokeRect(targetX - 42, y - 42, 84, 84);
  if (fired) {
    shape.lineBetween(sourceX + 34, y, targetX - 46, y);
    shape.lineBetween(targetX - 62, y - 10, targetX - 46, y);
    shape.lineBetween(targetX - 62, y + 10, targetX - 46, y);
  }
  diagram.add(shape);
  text(sourceX - 10, y - 18, DAMAGE_SYMBOLS[lesson.type], 28);
  text(BOARD_X + 36, BOARD_Y + 72, t("tutorial.damage.input", {
    attack: lesson.attack, multiplier: lesson.multiplier * 100, hits: lesson.hits, raw: result.raw
  }), 20);
  text(sourceX - 110, y + 72, t(`tutorial.damage.${lesson.type}.title`), 18, uiTextColors.primary, 240);
  text(targetX - 110, y + 72, t("tutorial.damage.target", { armor: lesson.armor, resistance: lesson.resistance }), 18, uiTextColors.primary, 220);
  const hp = 1000 - (fired ? result.total : 0);
  const bar = scene.add.rectangle(targetX - 90, y + 130, 180, 8, palette.dim).setOrigin(0, .5);
  const fill = scene.add.rectangle(targetX - 90, y + 130, 180 * hp / 1000, 8, color).setOrigin(0, .5);
  diagram.add([bar, fill]);
  text(targetX - 90, y + 143, `${hp} / 1000`, 16, uiTextColors.secondary, 200);
  text(BOARD_X + 36, BOARD_Y + 422, fired ? t("tutorial.damage.result", {
    perHit: result.perHit, hits: lesson.hits, total: result.total
  }) : t("tutorial.damage.ready"), 22);
  text(BOARD_X + 36, BOARD_Y + BOARD_HEIGHT - 42, t("tutorial.damage.scope"), 13, uiTextColors.secondary);
}
