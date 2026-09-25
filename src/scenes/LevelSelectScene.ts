import Phaser from "phaser";
import { drawDelBoss } from "../render/delBoss";
import { bindButtonHover } from "../render/buttonHover";
import { bindSliderInput } from "../render/sliderInput";
import { createPageHeading, createHeaderNavigation } from "../render/pageHeader";
import { createSelectionMapViewport, drawSelectionMapFrame } from "../render/selectionMap";
import { createCompletionMarks } from "../render/completionMarks";
import { readSurvivalSave } from "../survivalSaves";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_MAX,
  DIFFICULTY_MIN,
  GAME_WIDTH,
  LEVEL_NODE_HEIGHT,
  LEVEL_NODE_WIDTH,
  clampDifficulty,
  palette,
  uiTextColors
} from "../config";
import { DODECAHEDRON_EDGES, DODECAHEDRON_UNIT_VERTICES, ICOSAHEDRON_EDGES, ICOSAHEDRON_UNIT_VERTICES, OCTAHEDRON_EDGES, OCTAHEDRON_UNIT_VERTICES, SMALL_STELLATED_DODECAHEDRON_SPIKES } from "../bosses/cubeBoss";
import { bossRank, isDodecahedronBossKind, isIcosahedronBossKind, isOctahedronBossKind, isSmallStellatedDodecahedronBossKind, isTetrahedronBossKind } from "../game/bossRules";
import { defaultChapterId, getChapterDefinition, levelNodesForChapter } from "../data/chapters";
import { groupForChapter } from "../data/chapterGroups";
import { getLevelConfig } from "../data/levels";
import { toRomanNumeral } from "../format";
import { isTutorialMechanic } from "../game/tutorial";
import { t } from "../i18n";
import { bestBossRankForLevel, bestWaveForLevel, bestFlawlessDifficulty, isChapterUnlocked, isLevelCompleted, isLevelUnlocked } from "../progress";
import { EncyclopediaPanel } from "../render/encyclopediaPanel";
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

export class LevelSelectScene extends Phaser.Scene {
  private selectedChapterId = defaultChapterId();
  private selectedLevelId: string | null = "1-1";
  private restoredMapOffset?: { x: number; y: number };
  private difficulty = DEFAULT_DIFFICULTY;
  private unlimitedFirepower = false;
  private mapContainer!: Phaser.GameObjects.Container;
  private mapBounds!: Phaser.Geom.Rectangle;
  private readonly mapViewport = createSelectionMapViewport();
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
  private endlessRecordLabels = new Map<string, Phaser.GameObjects.Text>();
  private lockGraphics!: Phaser.GameObjects.Graphics;
  private startButton!: Phaser.GameObjects.Rectangle;
  private startText!: Phaser.GameObjects.Text;
  private newRunButton!: Phaser.GameObjects.Rectangle;
  private newRunText!: Phaser.GameObjects.Text;
  private resumeError = false;
  private difficultyText!: Phaser.GameObjects.Text;
  private difficultyKnob!: Phaser.GameObjects.Rectangle;
  private unlimitedFirepowerBox!: Phaser.GameObjects.Rectangle;
  private unlimitedFirepowerFill!: Phaser.GameObjects.Rectangle;
  private unlimitedFirepowerText!: Phaser.GameObjects.Text;
  private encyclopediaPanel!: EncyclopediaPanel;

  constructor() {
    super("LevelSelectScene");
  }

  init(data: { chapterId?: string; difficulty?: number; unlimitedFirepower?: boolean; selectedLevelId?: string; resumeError?: boolean; mapOffset?: { x: number; y: number } }) {
    this.resumeError = Boolean(data.resumeError);
    const requestedChapterId = data.chapterId ?? defaultChapterId();
    this.selectedChapterId = isChapterUnlocked(requestedChapterId) ? requestedChapterId : defaultChapterId();
    this.restoredMapOffset = this.selectedChapterId === requestedChapterId &&
      Number.isFinite(data.mapOffset?.x) && Number.isFinite(data.mapOffset?.y) ? data.mapOffset : undefined;
    this.mapDragPointer = null;
    this.mapDragTimer = null;
    this.mapDragging = false;
    this.suppressNodeClickUntil = 0;
    this.difficulty = clampDifficulty(data.difficulty);
    this.unlimitedFirepower = Boolean(data.unlimitedFirepower);
    const nodes = this.chapterNodes();
    const selectedNode = nodes.find((node) => node.id === data.selectedLevelId && isLevelUnlocked(node.id));
    this.selectedLevelId = selectedNode?.id ?? nodes.find((node) => isLevelUnlocked(node.id))?.id ?? null;
  }

  create() {
    this.bossNodePreviews = [];
    this.endlessRecordLabels.clear();
    this.cameras.main.setBackgroundColor(palette.black);
    this.drawBackdrop();
    this.createMapContainer();
    this.setMapOffset(this.restoredMapOffset?.x ?? 0, this.restoredMapOffset?.y ?? 0);
    this.drawLevelPath();
    this.createMapDragControls();
    this.encyclopediaPanel = new EncyclopediaPanel(this);
    createHeaderNavigation(this, [
      { label: t("button.back"), run: () => this.scene.start("ChapterSelectScene", { groupId: groupForChapter(this.selectedChapterId).id }) },
      { label: t("button.encyclopedia"), run: () => this.encyclopediaPanel.open("enemies") },
      { label: t("button.settings"), run: () => this.openSettings() }
    ]);
    this.createStartButton();
    this.createDifficultySlider();
    this.updateSelection();
    if (this.resumeError) this.add.text(GAME_WIDTH / 2, this.footerY - 90, t("save.invalid"), {
      fontFamily: "monospace", fontSize: "17px", color: "#ff8888"
    }).setOrigin(0.5);

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
    createPageHeading(this, t("app.title"), this.chapterLabel());

    drawSelectionMapFrame(this, this.mapViewport);
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

  private chapterNodes() {
    return levelNodesForChapter(this.selectedChapterId);
  }

  private chapterLabel() {
    return t(getChapterDefinition(this.selectedChapterId).labelKey);
  }

  private createLevelNode(node: LevelNode) {
    const level = getLevelConfig(node.id);
    const unlocked = isLevelUnlocked(node.id);
    const completed = isLevelCompleted(node.id);
    const flawlessDifficulty = bestFlawlessDifficulty(node.id);
    const alpha = unlocked ? 1 : 0.28;
    const frame = this.add
      .rectangle(node.x, node.y, LEVEL_NODE_WIDTH, LEVEL_NODE_HEIGHT, palette.black, 1)
      .setStrokeStyle(2, flawlessDifficulty !== undefined ? palette.gold : completed ? palette.completed : unlocked ? palette.mid : palette.dim, 1)
      .setInteractive({ useHandCursor: unlocked })
      .setAlpha(alpha);
    const label = this.add
      .text(node.x, node.y - (level.bossKind && node.id.length > 6 ? 14 : 3), node.id, {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: node.id.length > 6 ? "22px" : "26px",
        fontStyle: "700"
      })
      .setOrigin(0.5)
      .setAlpha(alpha);

    this.mapContainer.add([frame, label]);
    if (level.survival) {
      const recordLabel = this.add.text(node.x, node.y + LEVEL_NODE_HEIGHT / 2 + 28,
        unlocked ? "" : t("label.unlockAfter", { level: level.unlockAfter ?? "" }), {
          color: uiTextColors.secondary, fontFamily: "monospace", fontSize: "17px"
        }).setOrigin(0.5);
      this.mapContainer.add(recordLabel);
      if (unlocked) this.endlessRecordLabels.set(node.id, recordLabel);
    }
    this.mapContainer.add(createCompletionMarks(this, node.x + LEVEL_NODE_WIDTH / 2 - 12,
      node.y - LEVEL_NODE_HEIGHT / 2 + 10, completed, flawlessDifficulty));
    this.createBossNodePreview(node, alpha);

    frame.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.selectLevelNode(node, pointer);
    });
    label.setInteractive({ useHandCursor: unlocked }).on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.selectLevelNode(node, pointer);
    });
    bindButtonHover(frame, [label], () => unlocked && !this.mapDragging &&
      !this.encyclopediaPanel.isOpen() && this.mapViewport.contains(this.input.activePointer.x, this.input.activePointer.y), { lineWidth: 3 });
  }

  private selectLevelNode(node: LevelNode, pointer: Phaser.Input.Pointer) {
    if (
      !isLevelUnlocked(node.id) ||
      this.mapDragging ||
      this.time.now < this.suppressNodeClickUntil ||
      this.encyclopediaPanel.isOpen() ||
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
        color: uiTextColors.primary,
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
    if (preview.kind === "del") {
      preview.label.setVisible(false);
      drawDelBoss(preview.frame, 22, this.time.now);
      return;
    }
    if (isTetrahedronBossKind(preview.kind)) {
      this.drawTetrahedronNodePreview(preview);
      return;
    }

    if (isDodecahedronBossKind(preview.kind)) {
      this.drawDodecahedronNodePreview(preview);
      return;
    }

    if (isSmallStellatedDodecahedronBossKind(preview.kind)) {
      this.drawSmallStellatedDodecahedronNodePreview(preview);
      return;
    }

    if (isOctahedronBossKind(preview.kind)) {
      this.drawOctahedronNodePreview(preview);
      return;
    }

    if (isIcosahedronBossKind(preview.kind)) {
      this.drawIcosahedronNodePreview(preview);
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

  private drawSmallStellatedDodecahedronNodePreview(preview: BossNodePreview) {
    const baseVertices = DODECAHEDRON_UNIT_VERTICES.map(([x, y, z]) => {
      return this.projectBossNodePoint(x * preview.size * 0.62, y * preview.size * 0.62, z * preview.size * 0.62, preview);
    });
    const spikeTips = SMALL_STELLATED_DODECAHEDRON_SPIKES.map(({ tip }) => {
      return this.projectBossNodePoint(
        tip[0] * preview.size * 0.62,
        tip[1] * preview.size * 0.62,
        tip[2] * preview.size * 0.62,
        preview
      );
    });

    preview.frame.clear();
    preview.frame.lineStyle(1.1, palette.white, 0.32);
    for (const [from, to] of DODECAHEDRON_EDGES) {
      preview.frame.lineBetween(baseVertices[from].x, baseVertices[from].y, baseVertices[to].x, baseVertices[to].y);
    }

    preview.frame.lineStyle(1.35, palette.white, 0.92);
    SMALL_STELLATED_DODECAHEDRON_SPIKES.forEach(({ face }, index) => {
      const tip = spikeTips[index];
      for (const vertexIndex of face) {
        const vertex = baseVertices[vertexIndex];
        preview.frame.lineBetween(tip.x, tip.y, vertex.x, vertex.y);
      }
    });
  }

  private drawOctahedronNodePreview(preview: BossNodePreview) {
    const vertices = OCTAHEDRON_UNIT_VERTICES.map(([x, y, z]) => {
      return this.projectBossNodePoint(x * preview.size * 1.18, y * preview.size * 1.18, z * preview.size * 1.18, preview);
    });

    preview.frame.clear();
    preview.frame.lineStyle(1.5, palette.white, 0.92);
    for (const [from, to] of OCTAHEDRON_EDGES) {
      preview.frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
    }
  }

  private drawIcosahedronNodePreview(preview: BossNodePreview) {
    const vertices = ICOSAHEDRON_UNIT_VERTICES.map(([x, y, z]) => {
      return this.projectBossNodePoint(x * preview.size * 1.085, y * preview.size * 1.085, z * preview.size * 1.085, preview);
    });

    preview.frame.clear();
    preview.frame.lineStyle(1.45, palette.white, 0.9);
    for (const [from, to] of ICOSAHEDRON_EDGES) {
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

  private createStartButton() {
    const x = GAME_WIDTH - 164;
    const y = this.footerY;
    this.startButton = this.add
      .rectangle(x, y, 160, 46, palette.black, 1)
      .setStrokeStyle(2, palette.white, 1)
      .setInteractive({ useHandCursor: true });
    this.startText = this.add
      .text(x, y - 2, t("button.start"), {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "20px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    this.startButton.on("pointerdown", () => this.startSelectedLevel());
    this.startText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.startSelectedLevel());
    bindButtonHover(this.startButton, [this.startText], () => !!this.selectedLevelId && isLevelUnlocked(this.selectedLevelId));
    this.newRunButton = this.add.rectangle(x - 180, y, 160, 46, palette.black)
      .setStrokeStyle(1, palette.mid).setInteractive({ useHandCursor: true }).setVisible(false);
    this.newRunText = this.add.text(x - 180, y - 2, t("button.restart"), {
      color: uiTextColors.secondary, fontFamily: "monospace", fontSize: "17px"
    }).setOrigin(0.5).setVisible(false);
    this.newRunButton.on("pointerdown", () => {
      if (window.confirm(t("save.replace"))) this.startSelectedLevel(true);
    });
    bindButtonHover(this.newRunButton, [this.newRunText]);
  }

  private openSettings() {
    this.scene.start("SettingsScene", {
      returnScene: "LevelSelectScene",
      returnData: {
        chapterId: this.selectedChapterId,
        selectedLevelId: this.selectedLevelId ?? undefined,
        mapOffset: { x: this.mapContainer.x, y: this.mapContainer.y },
        difficulty: this.difficulty,
        unlimitedFirepower: this.unlimitedFirepower
      }
    });
  }

  private createDifficultySlider() {
    const labelX = 78;
    const trackX = 172;
    const trackY = this.footerY;
    const trackWidth = 360;
    this.createUnlimitedFirepowerToggle(labelX + 10, trackY - 34);

    this.add
      .text(labelX, trackY - 10, t("label.difficulty"), {
        color: uiTextColors.secondary,
        fontFamily: "monospace",
        fontSize: "15px"
      })
      .setOrigin(0, 0);

    this.difficultyText = this.add
      .text(trackX + trackWidth + 28, trackY - 2, "", {
        color: uiTextColors.primary,
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

    bindButtonHover(this.difficultyKnob, [hitArea]);
    bindSliderInput(this, [hitArea, this.difficultyKnob], {
      coordinate: pointer => pointer.x,
      geometry: () => ({ start: trackX, end: trackX + trackWidth, thumb: this.difficultyKnob.x, thumbSize: this.difficultyKnob.width }),
      change: ratio => this.setDifficultyFromX(trackX + ratio * trackWidth, trackX, trackWidth),
      enabled: () => !this.encyclopediaPanel.isOpen()
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
        color: uiTextColors.body,
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "700"
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

    this.unlimitedFirepowerBox.on("pointerdown", () => this.toggleUnlimitedFirepower());
    this.unlimitedFirepowerText.on("pointerdown", () => this.toggleUnlimitedFirepower());
    bindButtonHover(this.unlimitedFirepowerBox, [this.unlimitedFirepowerText]);
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
    for (const [levelId, label] of this.endlessRecordLabels) {
      label.setText(getLevelConfig(levelId).bossEndless
        ? t("label.bestBossRank", { count: bestBossRankForLevel(levelId, this.difficulty) })
        : t("label.bestWave", { count: bestWaveForLevel(levelId, this.difficulty) }));
    }
  }

  private updateSelection() {
    const nodes = this.chapterNodes();
    const selected = nodes.find((node) => node.id === this.selectedLevelId) ?? nodes[0];
    const saved = selected && isLevelUnlocked(selected.id) ? readSurvivalSave(selected.id) : undefined;
    this.startText.setText(t(saved ? "button.resume" : "button.start"));
    this.newRunButton.setVisible(Boolean(saved));
    this.newRunText.setVisible(Boolean(saved));
    this.lockGraphics.clear();
    if (!selected) {
      this.startButton.setStrokeStyle(2, palette.dim, 0.45);
      this.startButton.setAlpha(0.36);
      this.startText.setAlpha(0.28);
      return;
    }

    this.lockGraphics.lineStyle(3, palette.white, 1);
    this.drawCornerLocks(selected.x, selected.y, LEVEL_NODE_WIDTH + 24, LEVEL_NODE_HEIGHT + 24, 18);

    const enabled = isLevelUnlocked(selected.id);
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

  private startSelectedLevel(newRun = false) {
    if (this.encyclopediaPanel.isOpen()) {
      return;
    }

    const selected = this.chapterNodes().find((node) => node.id === this.selectedLevelId);
    if (selected && isLevelUnlocked(selected.id)) {
      if (!newRun && readSurvivalSave(selected.id)) {
        this.scene.start("GameScene", { levelId: selected.id, chapterId: this.selectedChapterId, resume: true });
        return;
      }
      const sceneKey = isTutorialMechanic(getLevelConfig(selected.id).specialMechanic) ? "GameScene" : "CardSelectScene";
      this.scene.start(sceneKey, {
        levelId: selected.id,
        chapterId: this.selectedChapterId,
        mapOffset: { x: this.mapContainer.x, y: this.mapContainer.y },
        difficulty: this.difficulty,
        unlimitedFirepower: sceneKey === "GameScene" ? false : this.unlimitedFirepower
      });
    }
  }
}
