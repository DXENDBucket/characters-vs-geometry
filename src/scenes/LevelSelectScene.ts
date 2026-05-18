import Phaser from "phaser";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_MAX,
  DIFFICULTY_MIN,
  GAME_HEIGHT,
  GAME_WIDTH,
  LEVEL_NODE_HEIGHT,
  LEVEL_NODE_WIDTH,
  clampDifficulty,
  palette
} from "../config";
import {
  DODECAHEDRON_EDGES,
  DODECAHEDRON_UNIT_VERTICES,
  bossRank,
  isDodecahedronBossKind,
  isTetrahedronBossKind
} from "../bosses/cubeBoss";
import {
  enemyEncyclopediaEntries,
  towerEncyclopediaEntries,
  type EncyclopediaEntry,
  type EncyclopediaTab
} from "../encyclopedia";
import { getLevelConfig, levelNodes } from "../data/levels";
import { toRomanNumeral } from "../format";
import { t, toggleLanguage } from "../i18n";
import {
  createCubeIcon,
  createDodecahedronIcon,
  createEnemyShape,
  createTetrahedronIcon,
  createUnitBorder
} from "../render/unitShapes";
import { cardLetterCase, type CardLetterCase } from "../registry/cards";
import type { BossKind, LevelNode } from "../types";

interface BossNodePreview {
  kind: BossKind;
  frame: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  size: number;
}

interface ChapterButton {
  chapter: number;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface EncyclopediaTabButton {
  tab: EncyclopediaTab;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface EncyclopediaCardCaseButton {
  letterCase: CardLetterCase;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class LevelSelectScene extends Phaser.Scene {
  private selectedChapter = 0;
  private selectedLevelId: string | null = "0-1";
  private difficulty = DEFAULT_DIFFICULTY;
  private unlimitedFirepower = false;
  private mapContainer!: Phaser.GameObjects.Container;
  private mapBounds!: Phaser.Geom.Rectangle;
  private readonly chapters = [0, 1, 2];
  private readonly mapViewport = new Phaser.Geom.Rectangle(38, 156, GAME_WIDTH - 76, GAME_HEIGHT - 246);
  private readonly footerY = 715;
  private mapDragPointer: Phaser.Input.Pointer | null = null;
  private mapDragTimer: Phaser.Time.TimerEvent | null = null;
  private mapDragging = false;
  private mapPointerStartX = 0;
  private mapPointerStartY = 0;
  private mapStartX = 0;
  private mapStartY = 0;
  private suppressNodeClickUntil = 0;
  private bossNodePreviews: BossNodePreview[] = [];
  private lockGraphics!: Phaser.GameObjects.Graphics;
  private startButton!: Phaser.GameObjects.Rectangle;
  private startText!: Phaser.GameObjects.Text;
  private chapterTitleText!: Phaser.GameObjects.Text;
  private chapterButtons: ChapterButton[] = [];
  private difficultyText!: Phaser.GameObjects.Text;
  private difficultyKnob!: Phaser.GameObjects.Rectangle;
  private unlimitedFirepowerBox!: Phaser.GameObjects.Rectangle;
  private unlimitedFirepowerFill!: Phaser.GameObjects.Rectangle;
  private unlimitedFirepowerText!: Phaser.GameObjects.Text;
  private encyclopediaButton!: Phaser.GameObjects.Rectangle;
  private encyclopediaText!: Phaser.GameObjects.Text;
  private languageButton!: Phaser.GameObjects.Rectangle;
  private languageText!: Phaser.GameObjects.Text;
  private encyclopediaOverlay!: Phaser.GameObjects.Container;
  private encyclopediaList!: Phaser.GameObjects.Container;
  private encyclopediaViewport!: Phaser.Geom.Rectangle;
  private encyclopediaContentHeight = 0;
  private encyclopediaScrollY = 0;
  private encyclopediaDragPointer: Phaser.Input.Pointer | null = null;
  private encyclopediaDragStartY = 0;
  private encyclopediaDragStartScrollY = 0;
  private encyclopediaOpen = false;
  private encyclopediaTab: EncyclopediaTab = "enemies";
  private encyclopediaTabs: EncyclopediaTabButton[] = [];
  private encyclopediaCardCase: CardLetterCase = "uppercase";
  private encyclopediaCardCaseButtons: EncyclopediaCardCaseButton[] = [];

  constructor() {
    super("LevelSelectScene");
  }

  create() {
    this.bossNodePreviews = [];
    this.chapterButtons = [];
    this.encyclopediaTabs = [];
    this.encyclopediaCardCaseButtons = [];
    this.encyclopediaOpen = false;
    this.encyclopediaContentHeight = 0;
    this.encyclopediaScrollY = 0;
    this.encyclopediaDragPointer = null;
    this.cameras.main.setBackgroundColor(palette.black);
    this.drawBackdrop();
    this.createChapterSelector();
    this.createMapContainer();
    this.drawLevelPath();
    this.createMapDragControls();
    this.createEncyclopediaButton();
    this.createLanguageButton();
    this.createStartButton();
    this.createDifficultySlider();
    this.createEncyclopediaOverlay();
    this.updateSelection();

    this.input.keyboard?.on("keydown-ENTER", () => this.startSelectedLevel());
  }

  update(_time: number, delta: number) {
    const seconds = delta / 1000;
    for (const preview of this.bossNodePreviews) {
      preview.rotationX += preview.velocityX * seconds;
      preview.rotationY += preview.velocityY * seconds;
      preview.rotationZ += preview.velocityZ * seconds;
      this.drawBossNodePreview(preview);
    }
  }

  private drawBackdrop() {
    this.add
      .text(48, 40, t("app.title"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "28px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);

    this.chapterTitleText = this.add
      .text(50, 86, this.chapterLabel(this.selectedChapter), {
        color: "#8c8c8c",
        fontFamily: "monospace",
        fontSize: "17px"
      })
      .setOrigin(0, 0);

    const frame = this.add.graphics();
    frame.lineStyle(1, palette.dim, 1);
    frame.strokeRect(this.mapViewport.x, this.mapViewport.y, this.mapViewport.width, this.mapViewport.height);
  }

  private createChapterSelector() {
    const startX = 50;
    const y = 122;
    const width = 136;
    const gap = 14;
    this.chapters.forEach((chapter, index) => {
      const x = startX + index * (width + gap);
      const frame = this.add
        .rectangle(x, y, width, 34, palette.black, 1)
        .setOrigin(0, 0.5)
        .setStrokeStyle(2, palette.dim, 1)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x + width / 2, y - 1, this.chapterLabel(chapter), {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "15px",
          fontStyle: "700"
        })
        .setOrigin(0.5);

      frame.on("pointerdown", () => this.selectChapter(chapter));
      label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.selectChapter(chapter));
      this.chapterButtons.push({ chapter, frame, label });
    });

    this.updateChapterSelector();
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
    const nodes = this.chapterNodes();
    if (nodes.length === 0) {
      return new Phaser.Geom.Rectangle(
        this.mapViewport.x,
        this.mapViewport.y,
        this.mapViewport.width,
        this.mapViewport.height
      );
    }

    const padding = 72;
    const left = Math.min(...nodes.map((node) => node.x - LEVEL_NODE_WIDTH / 2)) - padding;
    const right = Math.max(...nodes.map((node) => node.x + LEVEL_NODE_WIDTH / 2)) + padding;
    const top = Math.min(...nodes.map((node) => node.y - LEVEL_NODE_HEIGHT / 2)) - padding;
    const bottom = Math.max(...nodes.map((node) => node.y + LEVEL_NODE_HEIGHT / 2)) + padding;
    return new Phaser.Geom.Rectangle(left, top, right - left, bottom - top);
  }

  private createMapDragControls() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.encyclopediaOpen || !this.mapViewport.contains(pointer.x, pointer.y)) {
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
      this.suppressNodeClickUntil = this.time.now + 120;
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

  private drawLevelPath() {
    const nodes = this.chapterNodes();
    const graphics = this.add.graphics();
    this.mapContainer.add(graphics);
    graphics.lineStyle(2, palette.dim, 1);
    for (let index = 0; index < nodes.length - 1; index += 1) {
      const current = nodes[index];
      const next = nodes[index + 1];
      graphics.lineBetween(current.x + LEVEL_NODE_WIDTH / 2, current.y, next.x - LEVEL_NODE_WIDTH / 2, next.y);
    }

    for (const node of nodes) {
      this.createLevelNode(node);
    }

    if (nodes.length === 0) {
      const emptyText = this.add
        .text(this.mapViewport.centerX, this.mapViewport.centerY, t("label.noLevels"), {
          color: "#454545",
          fontFamily: "monospace",
          fontSize: "28px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      this.mapContainer.add(emptyText);
    }

    this.lockGraphics = this.add.graphics();
    this.mapContainer.add(this.lockGraphics);
  }

  private selectChapter(chapter: number) {
    if (chapter === this.selectedChapter) {
      return;
    }

    this.selectedChapter = chapter;
    this.selectedLevelId = this.chapterNodes().find((node) => node.unlocked)?.id ?? this.chapterNodes()[0]?.id ?? null;
    this.rebuildMap();
    this.updateChapterSelector();
    this.updateSelection();
  }

  private rebuildMap() {
    this.mapDragTimer?.remove(false);
    this.mapDragTimer = null;
    this.mapDragPointer = null;
    this.mapDragging = false;
    this.input.setDefaultCursor("default");
    this.bossNodePreviews = [];
    this.mapContainer.destroy(true);
    this.createMapContainer();
    this.drawLevelPath();
  }

  private updateChapterSelector() {
    this.chapterTitleText?.setText(this.chapterLabel(this.selectedChapter));
    for (const button of this.chapterButtons) {
      const selected = button.chapter === this.selectedChapter;
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.8);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.86);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private chapterNodes() {
    return levelNodes.filter((node) => node.id.startsWith(`${this.selectedChapter}-`));
  }

  private chapterLabel(chapter: number) {
    return t(`chapter.${chapter}`);
  }

  private createLevelNode(node: LevelNode) {
    const alpha = node.unlocked ? 1 : 0.28;
    const frame = this.add
      .rectangle(node.x, node.y, LEVEL_NODE_WIDTH, LEVEL_NODE_HEIGHT, palette.black, 1)
      .setStrokeStyle(2, node.unlocked ? palette.mid : palette.dim, 1)
      .setInteractive({ useHandCursor: true })
      .setAlpha(alpha);
    const label = this.add
      .text(node.x, node.y - 3, node.id, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "26px",
        fontStyle: "700"
      })
      .setOrigin(0.5)
      .setAlpha(alpha);

    this.mapContainer.add([frame, label]);
    this.createBossNodePreview(node, alpha);

    frame.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.selectLevelNode(node, pointer);
    });
    label.setInteractive({ useHandCursor: true }).on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.selectLevelNode(node, pointer);
    });
  }

  private selectLevelNode(node: LevelNode, pointer: Phaser.Input.Pointer) {
    if (
      this.encyclopediaOpen ||
      this.mapDragging ||
      this.time.now < this.suppressNodeClickUntil ||
      !this.mapViewport.contains(pointer.x, pointer.y)
    ) {
      return;
    }

    this.selectedLevelId = node.id;
    this.updateSelection();
  }

  private createBossNodePreview(node: LevelNode, alpha: number) {
    const levelConfig = getLevelConfig(node.id);
    if (!levelConfig.bossKind) {
      return;
    }

    const rank = bossRank(levelConfig.bossKind);
    const x = node.x + LEVEL_NODE_WIDTH / 2 - 27;
    const y = node.y + LEVEL_NODE_HEIGHT / 2 - 18;
    const frame = this.add.graphics().setPosition(x, y).setAlpha(alpha);
    const label = this.add
      .text(x, y - 1, toRomanNumeral(rank), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "700"
      })
      .setOrigin(0.5)
      .setAlpha(alpha);

    this.mapContainer.add([frame, label]);
    const preview: BossNodePreview = {
      kind: levelConfig.bossKind,
      frame,
      label,
      rotationX: -0.35,
      rotationY: 0.45,
      rotationZ: -0.1,
      velocityX: 0.55,
      velocityY: -0.72,
      velocityZ: 0.36,
      size: 10
    };
    this.bossNodePreviews.push(preview);
    this.drawBossNodePreview(preview);
  }

  private drawBossNodePreview(preview: BossNodePreview) {
    if (isTetrahedronBossKind(preview.kind)) {
      this.drawTetrahedronNodePreview(preview);
      return;
    }

    if (isDodecahedronBossKind(preview.kind)) {
      this.drawDodecahedronNodePreview(preview);
      return;
    }

    const vertices = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1]
    ].map(([x, y, z]) => {
      return this.projectBossNodePoint(x * preview.size, y * preview.size, z * preview.size, preview);
    });
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7]
    ];

    preview.frame.clear();
    preview.frame.lineStyle(1.5, palette.white, 0.92);
    for (const [from, to] of edges) {
      preview.frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
    }
  }

  private drawTetrahedronNodePreview(preview: BossNodePreview) {
    const vertices = [
      [1, 1, 1],
      [-1, -1, 1],
      [-1, 1, -1],
      [1, -1, -1]
    ].map(([x, y, z]) => {
      return this.projectBossNodePoint(x * preview.size, y * preview.size, z * preview.size, preview);
    });
    const edges = [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3]
    ];

    preview.frame.clear();
    preview.frame.lineStyle(1.5, palette.white, 0.92);
    for (const [from, to] of edges) {
      preview.frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
    }
  }

  private drawDodecahedronNodePreview(preview: BossNodePreview) {
    const vertices = DODECAHEDRON_UNIT_VERTICES.map(([x, y, z]) => {
      return this.projectBossNodePoint(x * preview.size * 0.84, y * preview.size * 0.84, z * preview.size * 0.84, preview);
    });

    preview.frame.clear();
    preview.frame.lineStyle(1.4, palette.white, 0.9);
    for (const [from, to] of DODECAHEDRON_EDGES) {
      preview.frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
    }
  }

  private projectBossNodePoint(x: number, y: number, z: number, preview: BossNodePreview) {
    const cosX = Math.cos(preview.rotationX);
    const sinX = Math.sin(preview.rotationX);
    const cosY = Math.cos(preview.rotationY);
    const sinY = Math.sin(preview.rotationY);
    const cosZ = Math.cos(preview.rotationZ);
    const sinZ = Math.sin(preview.rotationZ);

    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;
    const x2 = x * cosY + z1 * sinY;
    const z2 = -x * sinY + z1 * cosY;
    const x3 = x2 * cosZ - y1 * sinZ;
    const y3 = x2 * sinZ + y1 * cosZ;
    const scale = 1.35 / (1 + z2 / 110);
    return { x: x3 * scale, y: y3 * scale };
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

    this.encyclopediaButton.on("pointerdown", () => this.openEncyclopedia("enemies"));
    this.encyclopediaText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.openEncyclopedia("enemies"));
  }

  private createStartButton() {
    const x = GAME_WIDTH - 164;
    const y = this.footerY;
    this.startButton = this.add
      .rectangle(x, y, 160, 46, palette.black, 1)
      .setStrokeStyle(2, palette.white, 1)
      .setInteractive({ useHandCursor: true });
    this.startText = this.add
      .text(x, y - 2, t("button.start"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "20px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    this.startButton.on("pointerdown", () => this.startSelectedLevel());
    this.startText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.startSelectedLevel());
  }

  private createLanguageButton() {
    this.languageButton = this.add
      .rectangle(GAME_WIDTH - 78, 52, 92, 34, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    this.languageText = this.add
      .text(GAME_WIDTH - 78, 50, t("button.language"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    this.languageButton.on("pointerdown", () => this.switchLanguage());
    this.languageText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.switchLanguage());
  }

  private switchLanguage() {
    toggleLanguage();
    this.scene.restart();
  }

  private createEncyclopediaOverlay() {
    this.encyclopediaTabs = [];
    const backdrop = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, palette.black, 0.78);
    backdrop.setInteractive();
    const panel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, 1060, 616, palette.black, 0.98)
      .setStrokeStyle(2, palette.white, 0.95);
    const title = this.add
      .text(144, 86, t("encyclopedia.title"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "26px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
    const closeButton = this.add
      .rectangle(1128, 102, 54, 34, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.9)
      .setInteractive({ useHandCursor: true });
    const closeText = this.add
      .text(1128, 100, "X", {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    const enemyTab = this.createEncyclopediaTabButton("enemies", 144, 136);
    const towerTab = this.createEncyclopediaTabButton("towers", 294, 136);
    const upperCaseButton = this.createEncyclopediaCardCaseButton("uppercase", 452, 136, "A");
    const lowerCaseButton = this.createEncyclopediaCardCaseButton("lowercase", 504, 136, "a");

    this.encyclopediaViewport = new Phaser.Geom.Rectangle(144, 180, 992, 418);
    this.encyclopediaList = this.add.container(this.encyclopediaViewport.x, this.encyclopediaViewport.y);
    const maskGraphics = this.add.graphics().setVisible(false);
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(
      this.encyclopediaViewport.x,
      this.encyclopediaViewport.y,
      this.encyclopediaViewport.width,
      this.encyclopediaViewport.height
    );
    this.encyclopediaList.setMask(maskGraphics.createGeometryMask());
    const scrollZone = this.add
      .zone(
        this.encyclopediaViewport.x,
        this.encyclopediaViewport.y,
        this.encyclopediaViewport.width,
        this.encyclopediaViewport.height
      )
      .setOrigin(0, 0)
      .setInteractive();

    closeButton.on("pointerdown", () => this.closeEncyclopedia());
    closeText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.closeEncyclopedia());
    scrollZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.encyclopediaOpen) {
        return;
      }

      this.encyclopediaDragPointer = pointer;
      this.encyclopediaDragStartY = pointer.y;
      this.encyclopediaDragStartScrollY = this.encyclopediaScrollY;
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.encyclopediaDragPointer !== pointer || !pointer.isDown) {
        return;
      }

      this.setEncyclopediaScroll(this.encyclopediaDragStartScrollY - (pointer.y - this.encyclopediaDragStartY));
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.stopEncyclopediaDrag(pointer));
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.stopEncyclopediaDrag(pointer));
    this.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        if (!this.encyclopediaOpen || !this.encyclopediaViewport.contains(pointer.x, pointer.y)) {
          return;
        }

        this.setEncyclopediaScroll(this.encyclopediaScrollY + deltaY);
      }
    );

    this.encyclopediaOverlay = this.add.container(0, 0, [
      backdrop,
      panel,
      title,
      closeButton,
      closeText,
      enemyTab.frame,
      enemyTab.label,
      towerTab.frame,
      towerTab.label,
      upperCaseButton.frame,
      upperCaseButton.label,
      lowerCaseButton.frame,
      lowerCaseButton.label,
      maskGraphics,
      this.encyclopediaList,
      scrollZone
    ]);
    this.encyclopediaOverlay.setDepth(260);
    this.encyclopediaOverlay.setVisible(false);
  }

  private createEncyclopediaTabButton(tab: EncyclopediaTab, x: number, y: number) {
    const frame = this.add
      .rectangle(x, y, 132, 36, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x + 66, y - 1, t(tab === "enemies" ? "encyclopedia.enemies" : "encyclopedia.towers"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setEncyclopediaTab(tab));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setEncyclopediaTab(tab));
    const button = { tab, frame, label };
    this.encyclopediaTabs.push(button);
    return button;
  }

  private createEncyclopediaCardCaseButton(letterCase: CardLetterCase, x: number, y: number, text: string) {
    const frame = this.add
      .rectangle(x, y, 42, 30, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x + 21, y - 1, text, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setEncyclopediaCardCase(letterCase));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setEncyclopediaCardCase(letterCase));
    const button = { letterCase, frame, label };
    this.encyclopediaCardCaseButtons.push(button);
    return button;
  }

  private openEncyclopedia(tab: EncyclopediaTab) {
    this.encyclopediaOpen = true;
    this.encyclopediaOverlay.setVisible(true);
    this.setEncyclopediaTab(tab);
  }

  private closeEncyclopedia() {
    this.encyclopediaOpen = false;
    this.encyclopediaDragPointer = null;
    this.encyclopediaOverlay.setVisible(false);
  }

  private setEncyclopediaTab(tab: EncyclopediaTab) {
    this.encyclopediaTab = tab;
    this.updateEncyclopediaTabs();
    this.updateEncyclopediaCardCaseButtons();
    this.rebuildEncyclopediaList();
  }

  private setEncyclopediaCardCase(letterCase: CardLetterCase) {
    if (letterCase === this.encyclopediaCardCase) {
      return;
    }

    this.encyclopediaCardCase = letterCase;
    this.updateEncyclopediaCardCaseButtons();
    if (this.encyclopediaTab === "towers") {
      this.rebuildEncyclopediaList();
    }
  }

  private updateEncyclopediaTabs() {
    for (const button of this.encyclopediaTabs) {
      const selected = button.tab === this.encyclopediaTab;
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.75);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.86);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private updateEncyclopediaCardCaseButtons() {
    const visible = this.encyclopediaTab === "towers";
    for (const button of this.encyclopediaCardCaseButtons) {
      const selected = button.letterCase === this.encyclopediaCardCase;
      button.frame.setVisible(visible);
      button.label.setVisible(visible);
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.7);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.78);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private rebuildEncyclopediaList() {
    this.encyclopediaList.removeAll(true);
    const entries = this.encyclopediaTab === "enemies"
      ? enemyEncyclopediaEntries()
      : towerEncyclopediaEntries().filter((entry) => {
          return entry.card && cardLetterCase(entry.card.id) === this.encyclopediaCardCase;
        });
    const entryHeight = 206;
    entries.forEach((entry, index) => {
      this.drawEncyclopediaEntry(entry, index * entryHeight);
    });
    this.encyclopediaContentHeight = entries.length * entryHeight + 14;
    this.setEncyclopediaScroll(0);
  }

  private drawEncyclopediaEntry(entry: EncyclopediaEntry, y: number) {
    const container = this.add.container(0, y);
    const frame = this.add
      .rectangle(this.encyclopediaViewport.width / 2, 96, this.encyclopediaViewport.width - 6, 186, palette.black, 1)
      .setStrokeStyle(1, palette.dim, 0.95);
    container.add(frame);

    if (entry.enemyKind) {
      container.add(createEnemyShape(this, entry.enemyKind).setPosition(48, 72).setScale(1.05));
    } else if (entry.icon === "cube") {
      container.add(createCubeIcon(this).setPosition(48, 72));
    } else if (entry.icon === "tetrahedron") {
      container.add(createTetrahedronIcon(this).setPosition(48, 72));
    } else if (entry.icon === "dodecahedron") {
      container.add(createDodecahedronIcon(this).setPosition(48, 72));
    } else if (entry.card) {
      const border = createUnitBorder(this, entry.card.category, 23, 2).setPosition(48, 70);
      const label = this.add
        .text(48, 67, entry.card.id, {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "28px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      container.add([border, label]);
    }

    const title = this.add
      .text(92, 18, entry.title, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
    const stats = this.add
      .text(92, 46, entry.lines.join("\n"), {
        color: "#cfcfcf",
        fontFamily: "monospace",
        fontSize: "13px",
        lineSpacing: 3,
        wordWrap: { width: 850 }
      })
      .setOrigin(0, 0);
    const description = this.add
      .text(92, 134, entry.description, {
        color: "#8c8c8c",
        fontFamily: "monospace",
        fontSize: "13px",
        wordWrap: { width: 850 }
      })
      .setOrigin(0, 0);

    container.add([title, stats, description]);
    this.encyclopediaList.add(container);
  }

  private stopEncyclopediaDrag(pointer: Phaser.Input.Pointer) {
    if (this.encyclopediaDragPointer === pointer) {
      this.encyclopediaDragPointer = null;
    }
  }

  private setEncyclopediaScroll(scrollY: number) {
    const maxScroll = Math.max(0, this.encyclopediaContentHeight - this.encyclopediaViewport.height);
    this.encyclopediaScrollY = Math.round(Phaser.Math.Clamp(scrollY, 0, maxScroll));
    this.encyclopediaList.y = this.encyclopediaViewport.y - this.encyclopediaScrollY;
  }

  private createDifficultySlider() {
    const labelX = 78;
    const trackX = 172;
    const trackY = this.footerY;
    const trackWidth = 360;
    this.createUnlimitedFirepowerToggle(labelX + 10, trackY - 34);

    this.add
      .text(labelX, trackY - 10, t("label.difficulty"), {
        color: "#8c8c8c",
        fontFamily: "monospace",
        fontSize: "15px"
      })
      .setOrigin(0, 0);

    this.difficultyText = this.add
      .text(trackX + trackWidth + 28, trackY - 2, "", {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "22px",
        fontStyle: "700"
      })
      .setOrigin(0, 0.5);

    this.add.rectangle(trackX + trackWidth / 2, trackY, trackWidth, 4, palette.dim, 1);
    const hitArea = this.add
      .zone(trackX + trackWidth / 2, trackY, trackWidth + 42, 52)
      .setInteractive({ useHandCursor: true });
    this.difficultyKnob = this.add
      .rectangle(trackX, trackY, 18, 30, palette.black, 1)
      .setStrokeStyle(2, palette.white, 1)
      .setInteractive({ useHandCursor: true });

    this.input.setDraggable(this.difficultyKnob);
    hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.setDifficultyFromX(pointer.x, trackX, trackWidth);
    });
    this.input.on("drag", (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number) => {
      if (gameObject === this.difficultyKnob) {
        this.setDifficultyFromX(dragX, trackX, trackWidth);
      }
    });

    for (let index = DIFFICULTY_MIN; index <= DIFFICULTY_MAX; index += 1) {
      const x = trackX + (index / DIFFICULTY_MAX) * trackWidth;
      this.add.rectangle(x, trackY, 2, 12, palette.mid, 1);
    }

    this.updateDifficultySlider(trackX, trackWidth);
  }

  private createUnlimitedFirepowerToggle(x: number, y: number) {
    this.unlimitedFirepowerBox = this.add
      .rectangle(x, y, 18, 18, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.86)
      .setInteractive({ useHandCursor: true });
    this.unlimitedFirepowerFill = this.add.rectangle(x, y, 10, 10, palette.white, 1);
    this.unlimitedFirepowerText = this.add
      .text(x + 16, y - 2, t("label.unlimitedFirepower"), {
        color: "#d8d8d8",
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "700"
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

    this.unlimitedFirepowerBox.on("pointerdown", () => this.toggleUnlimitedFirepower());
    this.unlimitedFirepowerText.on("pointerdown", () => this.toggleUnlimitedFirepower());
    this.updateUnlimitedFirepowerToggle();
  }

  private toggleUnlimitedFirepower() {
    this.unlimitedFirepower = !this.unlimitedFirepower;
    this.updateUnlimitedFirepowerToggle();
  }

  private updateUnlimitedFirepowerToggle() {
    this.unlimitedFirepowerBox.setStrokeStyle(
      2,
      this.unlimitedFirepower ? palette.white : palette.mid,
      this.unlimitedFirepower ? 1 : 0.72
    );
    this.unlimitedFirepowerFill.setVisible(this.unlimitedFirepower);
    this.unlimitedFirepowerText.setAlpha(this.unlimitedFirepower ? 1 : 0.62);
  }

  private setDifficultyFromX(x: number, trackX: number, trackWidth: number) {
    const ratio = Phaser.Math.Clamp((x - trackX) / trackWidth, 0, 1);
    this.difficulty = clampDifficulty(ratio * DIFFICULTY_MAX);
    this.updateDifficultySlider(trackX, trackWidth);
  }

  private updateDifficultySlider(trackX: number, trackWidth: number) {
    this.difficultyKnob.x = trackX + (this.difficulty / DIFFICULTY_MAX) * trackWidth;
    this.difficultyText.setText(`${this.difficulty} ${t(`difficulty.${this.difficulty}`)}`);
  }

  private updateSelection() {
    const nodes = this.chapterNodes();
    const selected = nodes.find((node) => node.id === this.selectedLevelId) ?? nodes[0];
    this.lockGraphics.clear();
    if (!selected) {
      this.startButton.setStrokeStyle(2, palette.dim, 0.45);
      this.startButton.setAlpha(0.36);
      this.startText.setAlpha(0.28);
      return;
    }

    this.lockGraphics.lineStyle(3, palette.white, 1);
    this.drawCornerLocks(selected.x, selected.y, LEVEL_NODE_WIDTH + 24, LEVEL_NODE_HEIGHT + 24, 18);

    const enabled = selected.unlocked;
    this.startButton.setStrokeStyle(2, enabled ? palette.white : palette.dim, enabled ? 1 : 0.45);
    this.startButton.setAlpha(enabled ? 1 : 0.36);
    this.startText.setAlpha(enabled ? 1 : 0.28);
  }

  private drawCornerLocks(centerX: number, centerY: number, width: number, height: number, length: number) {
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    const top = centerY - height / 2;
    const bottom = centerY + height / 2;

    this.lockGraphics.lineBetween(left, top, left + length, top);
    this.lockGraphics.lineBetween(left, top, left, top + length);
    this.lockGraphics.lineBetween(right, top, right - length, top);
    this.lockGraphics.lineBetween(right, top, right, top + length);
    this.lockGraphics.lineBetween(left, bottom, left + length, bottom);
    this.lockGraphics.lineBetween(left, bottom, left, bottom - length);
    this.lockGraphics.lineBetween(right, bottom, right - length, bottom);
    this.lockGraphics.lineBetween(right, bottom, right, bottom - length);
  }

  private startSelectedLevel() {
    if (this.encyclopediaOpen) {
      return;
    }

    const selected = this.chapterNodes().find((node) => node.id === this.selectedLevelId);
    if (selected?.unlocked) {
      this.scene.start("CardSelectScene", {
        levelId: selected.id,
        difficulty: this.difficulty,
        unlimitedFirepower: this.unlimitedFirepower
      });
    }
  }
}
