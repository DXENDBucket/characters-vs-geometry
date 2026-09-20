import Phaser from "phaser";
import { bindButtonHover } from "../render/buttonHover";
import { createPageHeading } from "../render/pageHeader";
import { GAME_HEIGHT, GAME_WIDTH, palette, uiTextColors } from "../config";
import { chapterGroups, type ChapterGroupDefinition } from "../data/chapterGroups";
import { levelNodesForChapter } from "../data/chapters";
import { t } from "../i18n";
import { completedLevelCountForChapter, isChapterGroupUnlocked } from "../progress";
import { createTowerWord } from "../render/towerWord";

export class ChapterGroupSelectScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private strip!: Phaser.GameObjects.Container;
  private mask?: Phaser.Display.Masks.GeometryMask;
  private maskGraphics?: Phaser.GameObjects.Graphics;
  private viewport = new Phaser.Geom.Rectangle();
  private frames: Phaser.GameObjects.Rectangle[] = [];
  private indicator!: Phaser.GameObjects.Text;
  private offset = 0;
  private step = 0;
  private cardSize = 0;
  private selectedIndex = 0;
  private resizeFrame = 0;
  private drag?: { pointer: Phaser.Input.Pointer; x: number; y: number; offset: number; index: number; moved: boolean };

  constructor() {
    super("ChapterGroupSelectScene");
  }

  init(data: { groupId?: string }) {
    this.selectedIndex = Math.max(0, chapterGroups.findIndex(group => group.id === data.groupId));
    this.drag = undefined;
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.black);
    this.root = this.add.container(0, 0);
    this.layout();
    window.addEventListener("resize", this.onResize);
    this.input.on("pointerdown", this.onDown);
    this.input.on("pointermove", this.onMove);
    this.input.on("pointerup", this.onUp);
    this.input.on("pointerupoutside", this.cancelDrag);
    this.input.on("wheel", this.onWheel);
    this.input.keyboard?.on("keydown", this.onKey);
    this.events.once("shutdown", () => {
      window.removeEventListener("resize", this.onResize);
      cancelAnimationFrame(this.resizeFrame);
      this.input.off("pointerdown", this.onDown);
      this.input.off("pointermove", this.onMove);
      this.input.off("pointerup", this.onUp);
      this.input.off("pointerupoutside", this.cancelDrag);
      this.input.off("wheel", this.onWheel);
      this.input.keyboard?.off("keydown", this.onKey);
      this.cancelDrag();
      this.clearMask();
      this.scale.setGameSize(GAME_WIDTH, GAME_HEIGHT);
    });
  }

  private readonly onResize = () => {
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => this.layout());
  };

  private layout() {
    this.cancelDrag();
    this.clearMask();
    this.root.removeAll(true);
    this.frames = [];
    const parent = this.game.canvas.parentElement;
    const screenWidth = parent?.clientWidth || window.innerWidth;
    const screenHeight = parent?.clientHeight || window.innerHeight;
    const aspect = screenWidth / Math.max(1, screenHeight);
    const baseHeight = screenHeight < 500 && aspect > 1 ? 600 : GAME_HEIGHT;
    const width = Math.max(640, Math.round(baseHeight * aspect));
    const height = Math.max(baseHeight, Math.round(width / aspect));
    this.scale.setGameSize(width, height);
    this.cameras.main.setSize(width, height);
    this.root.add(createPageHeading(this, t("menu.singlePlayer"), t("label.chapterGroupSelect")));
    this.viewport.setTo(24, 112, width - 48, height - 226);
    this.cardSize = Math.min(480, this.viewport.width - 32, this.viewport.height - 20);
    this.step = this.cardSize + 64;
    this.strip = this.add.container(width / 2, this.viewport.centerY);
    this.root.add(this.strip);
    this.maskGraphics = this.add.graphics().setVisible(false);
    this.maskGraphics.fillStyle(0xffffff).fillRect(this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height);
    this.mask = this.maskGraphics.createGeometryMask();
    this.strip.setMask(this.mask);
    chapterGroups.forEach((group, index) => this.drawGroup(group, index));
    this.indicator = this.add.text(width / 2, height - 92, "", {
      fontFamily: "monospace", fontSize: "15px", color: uiTextColors.secondary
    }).setOrigin(0.5);
    this.root.add(this.indicator);
    this.setOffset(this.selectedIndex * this.step);
    this.addButton(width / 2, height - 48, 220, t("menu.return"), this.goBack);
    if (chapterGroups.length > 1) {
      this.addButton(width / 2 - 76, height - 92, 42, "<", () => this.select(this.selectedIndex - 1));
      this.addButton(width / 2 + 76, height - 92, 42, ">", () => this.select(this.selectedIndex + 1));
    }
  }

  private drawGroup(group: ChapterGroupDefinition, index: number) {
    const card = this.add.container(index * this.step, 0).setScale(this.cardSize / 480);
    const unlocked = isChapterGroupUnlocked(group.id);
    card.setAlpha(unlocked ? 1 : 0.5);
    const frame = this.add.rectangle(0, 0, 480, 480, palette.black, 1).setStrokeStyle(2, palette.mid);
    card.add(frame);
    this.frames.push(frame);
    const grid = this.add.graphics().lineStyle(1, palette.dim, 0.45);
    for (let position = -192; position <= 192; position += 64) {
      grid.lineBetween(position, -206, position, 82);
    }
    for (const y of [-206, -110, -14, 82]) grid.lineBetween(-216, y, 216, y);
    card.add(grid);
    if (group.backgroundSymbol === "infinity") {
      const symbol = this.add.graphics().lineStyle(26, 0x242424, 0.85);
      symbol.beginPath();
      for (let i = 0; i <= 160; i++) {
        const angle = i / 160 * Math.PI * 2;
        const sin = Math.sin(angle);
        const x = 186 * Math.cos(angle) / (1 + sin * sin);
        const y = -62 + 310 * sin * Math.cos(angle) / (1 + sin * sin);
        if (i === 0) symbol.moveTo(x, y);
        else symbol.lineTo(x, y);
      }
      symbol.closePath();
      symbol.strokePath();
      card.add(symbol);
    } else if (group.backgroundSymbol) {
      card.add(this.add.text(0, -62, group.backgroundSymbol, {
        fontFamily: "monospace", fontSize: "260px", fontStyle: "900", color: "#242424"
      }).setOrigin(0.5).setAlpha(0.85));
    }
    const spacing = group.titleSpacing ?? 128;
    const rowScale = (row: number) => group.titleRowScales?.[row] ?? (row === 0 ? 0.8 : 0.5);
    const titleFit = Math.min(1, ...group.titleRows.map((letters, row) =>
      416 / (letters.length * spacing * rowScale(row))));
    group.titleRows.forEach((letters, row) => {
      const scale = rowScale(row) * titleFit;
      card.add(createTowerWord(this, letters, spacing)
        .setPosition(0, -145 + row * (group.titleRowSpacing ?? 128)).setScale(scale));
    });
    card.add(this.add.text(0, 132, t(group.labelKey), {
      fontFamily: "monospace", fontSize: "28px", fontStyle: "700", color: uiTextColors.primary
    }).setOrigin(0.5));
    const count = group.chapterIds.reduce((total, id) => total + levelNodesForChapter(id).length, 0);
    const completed = group.chapterIds.reduce((total, id) => total + completedLevelCountForChapter(id), 0);
    const meta = unlocked ? t(group.survival ? "label.levelCount" : "label.chapterProgress", { completed, count })
      : t("label.unlockAfter", { level: group.unlockAfter ?? "" });
    card.add(this.add.text(0, 190, meta, {
      fontFamily: "monospace", fontSize: "17px", color: !group.survival && completed === count ? uiTextColors.completed : uiTextColors.secondary
    }).setOrigin(0.5));
    this.strip.add(card);
  }

  private addButton(x: number, y: number, width: number, label: string, action: () => void) {
    const button = this.add.rectangle(x, y, width, 42, palette.black).setStrokeStyle(1, palette.mid)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: "monospace", fontSize: "18px", color: uiTextColors.primary
    }).setOrigin(0.5);
    bindButtonHover(button, [text]);
    button.on("pointerup", action);
    this.root.add([button, text]);
  }

  private setOffset(offset: number) {
    this.offset = Phaser.Math.Clamp(offset, 0, Math.max(0, chapterGroups.length - 1) * this.step);
    this.strip.x = this.scale.width / 2 - this.offset;
    this.selectedIndex = Math.round(this.offset / this.step);
    this.indicator.setText(`${this.selectedIndex + 1} / ${chapterGroups.length}`);
  }

  private select(index: number) {
    this.setOffset(Phaser.Math.Clamp(index, 0, chapterGroups.length - 1) * this.step);
    this.highlight(this.selectedIndex);
  }

  private cardAt(x: number, y: number) {
    if (!this.viewport.contains(x, y) || Math.abs(y - this.viewport.centerY) > this.cardSize / 2) return -1;
    const localX = x - this.strip.x;
    const index = Math.round(localX / this.step);
    return index >= 0 && index < chapterGroups.length && Math.abs(localX - index * this.step) <= this.cardSize / 2 ? index : -1;
  }

  private highlight(index: number) {
    this.frames.forEach((frame, i) => frame.setStrokeStyle(2,
      i === index && isChapterGroupUnlocked(chapterGroups[i].id) ? palette.green : palette.mid));
  }

  private readonly onDown = (pointer: Phaser.Input.Pointer) => {
    if (!pointer.leftButtonDown() || !this.viewport.contains(pointer.x, pointer.y)) return;
    this.drag = { pointer, x: pointer.x, y: pointer.y, offset: this.offset, index: this.cardAt(pointer.x, pointer.y), moved: false };
  };

  private readonly onMove = (pointer: Phaser.Input.Pointer) => {
    const drag = this.drag;
    if (drag?.pointer === pointer) {
      if (Math.hypot(pointer.x - drag.x, pointer.y - drag.y) > 6) drag.moved = true;
      if (drag.moved) {
        this.setOffset(drag.offset + drag.x - pointer.x);
        this.highlight(-1);
        this.input.setDefaultCursor("grabbing");
      }
      return;
    }
    const index = this.cardAt(pointer.x, pointer.y);
    this.highlight(index);
    this.input.setDefaultCursor(index >= 0 && isChapterGroupUnlocked(chapterGroups[index].id) ? "pointer" : "default");
  };

  private readonly onUp = (pointer: Phaser.Input.Pointer) => {
    const drag = this.drag;
    if (drag?.pointer !== pointer) return;
    this.cancelDrag();
    if (!drag.moved && drag.index >= 0 && this.cardAt(pointer.x, pointer.y) === drag.index) this.openGroup(drag.index);
  };

  private readonly cancelDrag = () => {
    this.drag = undefined;
    this.input.setDefaultCursor("default");
  };

  private readonly onWheel = (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], dx: number, dy: number) => {
    if (!this.viewport.contains(pointer.x, pointer.y)) return;
    if (this.drag) this.drag.moved = true;
    this.setOffset(this.offset + (Math.abs(dx) > Math.abs(dy) ? dx : dy));
    this.highlight(-1);
  };

  private readonly onKey = (event: KeyboardEvent) => {
    if (event.code === "Escape") this.goBack();
    else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      event.preventDefault();
      this.select(this.selectedIndex + (event.code === "ArrowLeft" ? -1 : 1));
    } else if ((event.code === "Enter" || event.code === "Space") && !event.repeat) {
      event.preventDefault();
      this.openGroup(this.selectedIndex);
    }
  };

  private openGroup(index: number) {
    if (!isChapterGroupUnlocked(chapterGroups[index].id)) return;
    this.scene.start("ChapterSelectScene", { groupId: chapterGroups[index].id });
  }

  private readonly goBack = () => this.scene.start("MainMenuScene");

  private clearMask() {
    this.strip?.clearMask();
    this.mask?.destroy();
    this.maskGraphics?.destroy();
    this.mask = undefined;
    this.maskGraphics = undefined;
  }
}
