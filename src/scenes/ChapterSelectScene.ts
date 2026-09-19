import Phaser from "phaser";
import { createPageHeading, createHeaderNavigation } from "../render/pageHeader";
import { GAME_HEIGHT, GAME_WIDTH, palette, uiTextColors } from "../config";
import { levelNodesForChapter, type ChapterDefinition } from "../data/chapters";
import { chaptersInGroup, getChapterGroup } from "../data/chapterGroups";
import { t } from "../i18n";
import {
  completedLevelCountForChapter,
  isChapterGroupUnlocked,
  isChapterCompleted,
  isChapterUnlocked
} from "../progress";
import { EncyclopediaPanel } from "../render/encyclopediaPanel";

interface ChapterCard {
  definition: ChapterDefinition;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  meta: Phaser.GameObjects.Text;
}

const CHAPTER_CARD_WIDTH = 196;
const CHAPTER_CARD_HEIGHT = 86;

export class ChapterSelectScene extends Phaser.Scene {
  private groupId = "main";
  private chapters: ChapterDefinition[] = [];
  private chapterCards: ChapterCard[] = [];
  private mapContainer!: Phaser.GameObjects.Container;
  private mapBounds!: Phaser.Geom.Rectangle;
  private readonly mapViewport = new Phaser.Geom.Rectangle(38, 130, GAME_WIDTH - 76, GAME_HEIGHT - 184);
  private mapDragPointer: Phaser.Input.Pointer | null = null;
  private mapDragTimer: Phaser.Time.TimerEvent | null = null;
  private mapDragging = false;
  private mapPointerStartX = 0;
  private mapPointerStartY = 0;
  private mapStartX = 0;
  private mapStartY = 0;
  private suppressChapterClickUntil = 0;
  private encyclopediaPanel!: EncyclopediaPanel;

  constructor() {
    super("ChapterSelectScene");
  }

  init(data: { groupId?: string }) {
    this.groupId = getChapterGroup(data.groupId).id;
    this.chapters = chaptersInGroup(this.groupId);
  }

  create() {
    if (!isChapterGroupUnlocked(this.groupId)) {
      this.scene.start("ChapterGroupSelectScene", { groupId: this.groupId });
      return;
    }
    this.chapterCards = [];
    this.cameras.main.setBackgroundColor(palette.black);
    this.drawBackdrop();
    this.createMapContainer();
    this.drawChapterPath();
    this.createChapterCards();
    this.createMapDragControls();
    this.encyclopediaPanel = new EncyclopediaPanel(this);
    createHeaderNavigation(this, [
      { label: t("button.back"), run: () => this.goToGroups() },
      { label: t("button.encyclopedia"), run: () => this.encyclopediaPanel.open("enemies") },
      { label: t("button.settings"), run: () => this.openSettings() }
    ]);
    this.input.keyboard?.on("keydown-ESC", this.goToGroups, this);
    this.events.once("shutdown", () => this.input.keyboard?.off("keydown-ESC", this.goToGroups, this));
  }

  private drawBackdrop() {
    createPageHeading(this, t("app.title"), t("label.chapterSelect"));

    const frame = this.add.graphics();
    frame.lineStyle(1, palette.dim, 1);
    frame.strokeRect(this.mapViewport.x, this.mapViewport.y, this.mapViewport.width, this.mapViewport.height);
  }

  private createMapContainer() {
    this.mapBounds = this.calculateMapBounds();
    this.mapContainer = this.add.container(0, 0);
    this.mapContainer.setDepth(5);

    const maskGraphics = this.add.graphics().setVisible(false);
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(this.mapViewport.x, this.mapViewport.y, this.mapViewport.width, this.mapViewport.height);
    this.mapContainer.setMask(maskGraphics.createGeometryMask());
  }

  private calculateMapBounds() {
    const padding = 96;
    const left = Math.min(...this.chapters.map((chapter) => chapter.x - CHAPTER_CARD_WIDTH / 2)) - padding;
    const right = Math.max(...this.chapters.map((chapter) => chapter.x + CHAPTER_CARD_WIDTH / 2)) + padding;
    const top = Math.min(...this.chapters.map((chapter) => chapter.y - CHAPTER_CARD_HEIGHT / 2)) - padding;
    const bottom = Math.max(...this.chapters.map((chapter) => chapter.y + CHAPTER_CARD_HEIGHT / 2)) + padding;
    return new Phaser.Geom.Rectangle(left, top, right - left, bottom - top);
  }

  private createMapDragControls() {
    this.input.on("wheel", this.onMapWheel);
    this.events.once("shutdown", () => this.input.off("wheel", this.onMapWheel));
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.encyclopediaPanel.isOpen() || !this.mapViewport.contains(pointer.x, pointer.y)) {
        return;
      }

      this.mapDragPointer = pointer;
      this.mapPointerStartX = pointer.x;
      this.mapPointerStartY = pointer.y;
      this.mapStartX = this.mapContainer.x;
      this.mapStartY = this.mapContainer.y;
      this.mapDragging = false;
      this.mapDragTimer?.remove(false);
      this.mapDragTimer = this.time.delayedCall(150, () => {
        if (this.mapDragPointer !== pointer || !pointer.isDown) {
          return;
        }

        this.mapDragging = true;
        this.input.setDefaultCursor("grabbing");
        this.updateMapDrag(pointer);
      });
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.mapDragPointer !== pointer || !this.mapDragging) {
        return;
      }

      this.updateMapDrag(pointer);
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.stopMapDrag(pointer));
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.stopMapDrag(pointer));
  }

  private readonly onMapWheel = (
    pointer: Phaser.Input.Pointer,
    _objects: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number
  ) => {
    if (this.encyclopediaPanel.isOpen() || this.mapDragPointer || !this.mapViewport.contains(pointer.x, pointer.y)) return;
    const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    this.setMapOffset(this.mapContainer.x - delta, this.mapContainer.y);
  };

  private updateMapDrag(pointer: Phaser.Input.Pointer) {
    this.setMapOffset(
      this.mapStartX + pointer.x - this.mapPointerStartX,
      this.mapStartY + pointer.y - this.mapPointerStartY
    );
  }

  private stopMapDrag(pointer: Phaser.Input.Pointer) {
    if (this.mapDragPointer !== pointer) {
      return;
    }

    this.mapDragTimer?.remove(false);
    this.mapDragTimer = null;
    if (this.mapDragging) {
      this.suppressChapterClickUntil = this.time.now + 120;
    }

    this.mapDragPointer = null;
    this.mapDragging = false;
    this.input.setDefaultCursor("default");
  }

  private setMapOffset(x: number, y: number) {
    const bounds = this.mapBounds;
    const viewport = this.mapViewport;
    const minX = Math.min(0, viewport.right - bounds.right);
    const maxX = Math.max(0, viewport.left - bounds.left);
    const minY = Math.min(0, viewport.bottom - bounds.bottom);
    const maxY = Math.max(0, viewport.top - bounds.top);

    this.mapContainer.setPosition(
      Math.round(Phaser.Math.Clamp(x, minX, maxX)),
      Math.round(Phaser.Math.Clamp(y, minY, maxY))
    );
  }

  private drawChapterPath() {
    const graphics = this.add.graphics();
    this.mapContainer.add(graphics);
    graphics.lineStyle(2, palette.dim, 0.9);
    for (const chapter of this.chapters) {
      if (!chapter.parentId) {
        continue;
      }

      const parent = this.chapters.find((candidate) => candidate.id === chapter.parentId);
      if (!parent) {
        continue;
      }

      graphics.lineBetween(parent.x + 98, parent.y, chapter.x - 98, chapter.y);
    }
  }

  private createChapterCards() {
    for (const chapter of this.chapters) {
      const levelCount = levelNodesForChapter(chapter.id).length;
      const completedCount = completedLevelCountForChapter(chapter.id);
      const unlocked = isChapterUnlocked(chapter.id);
      const completed = isChapterCompleted(chapter.id);
      const frame = this.add
        .rectangle(chapter.x, chapter.y, CHAPTER_CARD_WIDTH, CHAPTER_CARD_HEIGHT, palette.black, 1)
        .setStrokeStyle(
          2,
          completed ? palette.green : unlocked ? palette.mid : palette.dim,
          unlocked ? 0.95 : 0.45
        )
        .setInteractive({ useHandCursor: unlocked });
      const label = this.add
        .text(chapter.x, chapter.y - 18, t(chapter.labelKey), {
          color: uiTextColors.primary,
          fontFamily: "monospace",
          fontSize: "22px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      const meta = this.add
        .text(
          chapter.x,
          chapter.y + 20,
          levelCount > 0 && !chapter.survival
            ? t("label.chapterProgress", { completed: completedCount, count: levelCount })
            : t("label.levelCount", { count: levelCount }),
          {
            color: completed ? "#48ff88" : uiTextColors.secondary,
            fontFamily: "monospace",
            fontSize: "14px"
          }
        )
        .setOrigin(0.5);

      const alpha = unlocked ? 1 : 0.34;
      frame.setAlpha(alpha);
      label.setAlpha(alpha);
      meta.setAlpha(alpha);

      this.mapContainer.add([frame, label, meta]);
      frame.on("pointerup", (pointer: Phaser.Input.Pointer) => this.openChapter(chapter, pointer));
      label
        .setInteractive({ useHandCursor: unlocked })
        .on("pointerup", (pointer: Phaser.Input.Pointer) => this.openChapter(chapter, pointer));
      meta
        .setInteractive({ useHandCursor: unlocked })
        .on("pointerup", (pointer: Phaser.Input.Pointer) => this.openChapter(chapter, pointer));
      this.chapterCards.push({ definition: chapter, frame, label, meta });
    }
  }

  private goToGroups() {
    if (this.encyclopediaPanel.isOpen()) {
      this.encyclopediaPanel.close();
      return;
    }
    this.scene.start("ChapterGroupSelectScene", { groupId: this.groupId });
  }

  private openChapter(chapter: ChapterDefinition, pointer: Phaser.Input.Pointer) {
    if (
      !isChapterUnlocked(chapter.id) ||
      this.mapDragging ||
      this.time.now < this.suppressChapterClickUntil ||
      this.encyclopediaPanel.isOpen() ||
      !this.mapViewport.contains(pointer.x, pointer.y)
    ) {
      return;
    }

    this.scene.start("LevelSelectScene", { chapterId: chapter.id });
  }

  private openSettings() {
    this.scene.start("SettingsScene", { returnScene: "ChapterSelectScene", returnData: { groupId: this.groupId } });
  }
}
