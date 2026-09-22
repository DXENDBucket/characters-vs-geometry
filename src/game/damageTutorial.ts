import Phaser from "phaser";
import { BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, palette, uiTextColors } from "../config";
import { DAMAGE_SYMBOLS, t } from "../i18n";
import { GuidedTutorialView, type TutorialRuntime } from "./tutorial";
import { damageLessons, damageLessonResult } from "./damageTutorialLessons";

export class DamageTutorialController {
  private readonly view: GuidedTutorialView;
  private readonly diagram: Phaser.GameObjects.Container;
  private index = -1;
  private fired = false;
  private destroyed = false;

  constructor(private readonly runtime: TutorialRuntime) {
    this.view = new GuidedTutorialView(runtime, damageLessons.length + 2, "tutorial.damage.progress", () => this.advance());
    this.diagram = runtime.scene.add.container(0, 0).setDepth(160);
    this.refresh();
  }

  update() { this.view.beginHighlights(); }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.view.destroy();
    this.diagram.destroy(true);
  }

  private advance() {
    if (this.destroyed) return;
    if (this.index >= damageLessons.length) { this.runtime.finish(); return; }
    if (this.index >= 0 && !this.fired) this.fired = true;
    else { this.index++; this.fired = false; }
    this.refresh();
  }

  private refresh() {
    const lesson = damageLessons[this.index];
    const id = this.index < 0 ? "intro" : lesson?.id ?? "complete";
    this.view.setCopy({ lesson: this.index + 2, titleKey: `tutorial.damage.${id}.title`,
      bodyKey: `tutorial.damage.${id}.body`,
      buttonKey: !lesson ? this.index < 0 ? "tutorial.continue" : "tutorial.finish"
        : this.fired ? "tutorial.continue" : "tutorial.damage.fire" });
    this.diagram.removeAll(true);
    const scene = this.runtime.scene;
    const backdrop = scene.add.rectangle(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, palette.black, .98)
      .setOrigin(0).setInteractive();
    backdrop.on("pointerdown", (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
    this.diagram.add(backdrop);
    const text = (x: number, y: number, value: string, size = 20, color = uiTextColors.primary, width = BOARD_WIDTH - 72) => {
      const label = scene.add.text(x, y, value, { fontFamily: "monospace", fontSize: `${size}px`, color,
        wordWrap: { width, useAdvancedWrap: true }, lineSpacing: 6 });
      this.diagram.add(label);
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
    if (this.fired) {
      shape.lineBetween(sourceX + 34, y, targetX - 46, y);
      shape.lineBetween(targetX - 62, y - 10, targetX - 46, y);
      shape.lineBetween(targetX - 62, y + 10, targetX - 46, y);
    }
    this.diagram.add(shape);
    text(sourceX - 10, y - 18, DAMAGE_SYMBOLS[lesson.type], 28);
    text(BOARD_X + 36, BOARD_Y + 72, t("tutorial.damage.input", {
      attack: lesson.attack, multiplier: lesson.multiplier * 100, hits: lesson.hits, raw: result.raw
    }), 20);
    text(sourceX - 110, y + 72, t(`tutorial.damage.${lesson.type}.title`), 18, uiTextColors.primary, 240);
    text(targetX - 110, y + 72, t("tutorial.damage.target", { armor: lesson.armor, resistance: lesson.resistance }), 18, uiTextColors.primary, 220);
    const hp = 1000 - (this.fired ? result.total : 0);
    const bar = scene.add.rectangle(targetX - 90, y + 130, 180, 8, palette.dim).setOrigin(0, .5);
    const fill = scene.add.rectangle(targetX - 90, y + 130, 180 * hp / 1000, 8, color).setOrigin(0, .5);
    this.diagram.add([bar, fill]);
    text(targetX - 90, y + 143, `${hp} / 1000`, 16, uiTextColors.secondary, 200);
    text(BOARD_X + 36, BOARD_Y + 422, this.fired ? t("tutorial.damage.result", {
      perHit: result.perHit, hits: lesson.hits, total: result.total
    }) : t("tutorial.damage.ready"), 22);
    text(BOARD_X + 36, BOARD_Y + BOARD_HEIGHT - 42, t("tutorial.damage.scope"), 13, uiTextColors.secondary);
  }
}
