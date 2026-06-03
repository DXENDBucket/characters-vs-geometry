import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, palette } from "../config";
import { chapterDefinitions, levelNodesForChapter, type ChapterDefinition } from "../data/chapters";
import { t } from "../i18n";
import { EncyclopediaPanel } from "../render/encyclopediaPanel";

interface ChapterCard {
  definition: ChapterDefinition;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  meta: Phaser.GameObjects.Text;
}

export class ChapterSelectScene extends Phaser.Scene {
  private chapterCards: ChapterCard[] = [];
  private encyclopediaButton!: Phaser.GameObjects.Rectangle;
  private encyclopediaText!: Phaser.GameObjects.Text;
  private encyclopediaPanel!: EncyclopediaPanel;
  private settingsButton!: Phaser.GameObjects.Rectangle;
  private settingsText!: Phaser.GameObjects.Text;

  constructor() {
    super("ChapterSelectScene");
  }

  create() {
    this.chapterCards = [];
    this.cameras.main.setBackgroundColor(palette.black);
    this.drawBackdrop();
    this.drawChapterPath();
    this.createChapterCards();
    this.encyclopediaPanel = new EncyclopediaPanel(this);
    this.createEncyclopediaButton();
    this.createSettingsButton();
  }

  private drawBackdrop() {
    this.add
      .text(48, 40, t("app.title"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "30px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);

    this.add
      .text(50, 88, t("label.chapterSelect"), {
        color: "#8c8c8c",
        fontFamily: "monospace",
        fontSize: "17px"
      })
      .setOrigin(0, 0);

    const frame = this.add.graphics();
    frame.lineStyle(1, palette.dim, 1);
    frame.strokeRect(38, 130, GAME_WIDTH - 76, GAME_HEIGHT - 184);
  }

  private drawChapterPath() {
    const graphics = this.add.graphics();
    graphics.lineStyle(2, palette.dim, 0.9);
    for (const chapter of chapterDefinitions) {
      if (!chapter.parentId) {
        continue;
      }

      const parent = chapterDefinitions.find((candidate) => candidate.id === chapter.parentId);
      if (!parent) {
        continue;
      }

      graphics.lineBetween(parent.x + 98, parent.y, chapter.x - 98, chapter.y);
    }
  }

  private createChapterCards() {
    for (const chapter of chapterDefinitions) {
      const levelCount = levelNodesForChapter(chapter.id).length;
      const frame = this.add
        .rectangle(chapter.x, chapter.y, 196, 86, palette.black, 1)
        .setStrokeStyle(2, chapter.unlocked ? palette.mid : palette.dim, chapter.unlocked ? 0.95 : 0.45)
        .setInteractive({ useHandCursor: chapter.unlocked });
      const label = this.add
        .text(chapter.x, chapter.y - 18, t(chapter.labelKey), {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "22px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      const meta = this.add
        .text(chapter.x, chapter.y + 20, t("label.levelCount", { count: levelCount }), {
          color: "#8c8c8c",
          fontFamily: "monospace",
          fontSize: "14px"
        })
        .setOrigin(0.5);

      const alpha = chapter.unlocked ? 1 : 0.34;
      frame.setAlpha(alpha);
      label.setAlpha(alpha);
      meta.setAlpha(alpha);

      frame.on("pointerdown", () => this.openChapter(chapter));
      label.setInteractive({ useHandCursor: chapter.unlocked }).on("pointerdown", () => this.openChapter(chapter));
      meta.setInteractive({ useHandCursor: chapter.unlocked }).on("pointerdown", () => this.openChapter(chapter));
      this.chapterCards.push({ definition: chapter, frame, label, meta });
    }
  }

  private createSettingsButton() {
    this.settingsButton = this.add
      .rectangle(GAME_WIDTH - 78, 52, 92, 34, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    this.settingsText = this.add
      .text(GAME_WIDTH - 78, 50, t("button.settings"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    this.settingsButton.on("pointerdown", () => this.openSettings());
    this.settingsText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.openSettings());
  }

  private createEncyclopediaButton() {
    this.encyclopediaButton = this.add
      .rectangle(GAME_WIDTH - 206, 52, 132, 34, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    this.encyclopediaText = this.add
      .text(GAME_WIDTH - 206, 50, t("button.encyclopedia"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    this.encyclopediaButton.on("pointerdown", () => this.encyclopediaPanel.open("enemies"));
    this.encyclopediaText
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.encyclopediaPanel.open("enemies"));
  }

  private openChapter(chapter: ChapterDefinition) {
    if (!chapter.unlocked || this.encyclopediaPanel.isOpen()) {
      return;
    }

    this.scene.start("LevelSelectScene", { chapterId: chapter.id });
  }

  private openSettings() {
    this.scene.start("SettingsScene", { returnScene: "ChapterSelectScene" });
  }
}
