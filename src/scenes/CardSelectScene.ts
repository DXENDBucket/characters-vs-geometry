import Phaser from "phaser";
import {
  CARD_SLOT_COUNT,
  CUBE_BOSS_STATS,
  DEFAULT_DIFFICULTY,
  GAME_HEIGHT,
  GAME_WIDTH,
  clampDifficulty,
  palette
} from "../config";
import { getLevelConfig } from "../data/levels";
import { toRomanNumeral } from "../format";
import { DAMAGE_SYMBOLS, t } from "../i18n";
import { createEnemyShape, createUnitBorder } from "../render/unitShapes";
import { allCardDefinitions, cardLetterCase, defaultCardLoadout, type CardLetterCase } from "../registry/cards";
import { getEnemyDefinition, getEnemyDisplayName } from "../registry/enemies";
import type { BossKind, CardId, EnemyKind } from "../types";

interface CardPoolCaseButton {
  letterCase: CardLetterCase;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class CardSelectScene extends Phaser.Scene {
  private levelId = "0-1";
  private difficulty = DEFAULT_DIFFICULTY;
  private unlimitedFirepower = false;
  private selectedCards: CardId[] = [...defaultCardLoadout];
  private enemyPreviewList!: Phaser.GameObjects.Container;
  private enemyPreviewViewport!: Phaser.Geom.Rectangle;
  private enemyPreviewContentHeight = 0;
  private enemyPreviewScrollY = 0;
  private enemyPreviewDragPointer: Phaser.Input.Pointer | null = null;
  private enemyPreviewDragStartY = 0;
  private enemyPreviewDragStartScrollY = 0;
  private cardPoolList!: Phaser.GameObjects.Container;
  private cardPoolViewport!: Phaser.Geom.Rectangle;
  private cardPoolContentHeight = 0;
  private cardPoolScrollY = 0;
  private cardPoolDragPointer: Phaser.Input.Pointer | null = null;
  private cardPoolDragStartY = 0;
  private cardPoolDragStartScrollY = 0;
  private cardPoolDragMoved = false;
  private suppressCardClickUntil = 0;
  private cardPoolCase: CardLetterCase = "uppercase";
  private cardPoolCaseButtons: CardPoolCaseButton[] = [];
  private slotFrames: Phaser.GameObjects.Rectangle[] = [];
  private slotLabels: Phaser.GameObjects.Text[] = [];
  private cardFrames: Map<CardId, Phaser.GameObjects.Rectangle> = new Map();
  private backButton!: Phaser.GameObjects.Rectangle;
  private backText!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Rectangle;
  private startText!: Phaser.GameObjects.Text;

  constructor() {
    super("CardSelectScene");
  }

  init(data: { levelId?: string; difficulty?: number; unlimitedFirepower?: boolean }) {
    this.levelId = data.levelId ?? "0-1";
    this.difficulty = clampDifficulty(data.difficulty);
    this.unlimitedFirepower = Boolean(data.unlimitedFirepower);
    this.selectedCards = [...defaultCardLoadout];
    this.slotFrames = [];
    this.slotLabels = [];
    this.cardFrames = new Map();
    this.enemyPreviewScrollY = 0;
    this.enemyPreviewDragPointer = null;
    this.cardPoolScrollY = 0;
    this.cardPoolDragPointer = null;
    this.cardPoolDragMoved = false;
    this.suppressCardClickUntil = 0;
    this.cardPoolCase = "uppercase";
    this.cardPoolCaseButtons = [];
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.black);
    this.drawBackdrop();
    this.drawEnemyPreview();
    this.createSlots();
    this.createCardPool();
    this.createStartButton();
    this.updateCardSelection();
  }

  private drawBackdrop() {
    this.add
      .text(
        48,
        40,
        `${t("operation.level", { level: this.levelId, difficulty: this.difficulty })}${this.unlimitedFirepower ? `  ${t("label.unlimitedFirepower")}` : ""}`,
        {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "28px",
        fontStyle: "700"
        }
      )
      .setOrigin(0, 0);

    this.add
      .text(50, 88, t("label.loadout"), {
        color: "#8c8c8c",
        fontFamily: "monospace",
        fontSize: "17px"
      })
      .setOrigin(0, 0);

    const frame = this.add.graphics();
    frame.lineStyle(1, palette.dim, 1);
    frame.strokeRect(38, 130, GAME_WIDTH - 76, GAME_HEIGHT - 220);
  }

  private drawEnemyPreview() {
    const panelX = GAME_WIDTH - 360;
    const panelY = 166;
    const listY = panelY + 34;
    const viewportWidth = 326;
    const viewportHeight = GAME_HEIGHT - listY - 118;
    this.add
      .text(panelX, panelY, t("label.enemy"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);

    const levelConfig = getLevelConfig(this.levelId);
    const rowSpacing = 90;
    this.enemyPreviewViewport = new Phaser.Geom.Rectangle(panelX, listY, viewportWidth, viewportHeight);
    this.enemyPreviewList = this.add.container(panelX, listY);

    const maskGraphics = this.add.graphics().setVisible(false);
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(panelX, listY, viewportWidth, viewportHeight);
    this.enemyPreviewList.setMask(maskGraphics.createGeometryMask());

    let contentY = 32;
    if (levelConfig.bossKind) {
      const bossText = this.add
        .text(0, contentY, `${this.bossDisplayName(levelConfig.bossKind)}  ${t("label.hp")} ${CUBE_BOSS_STATS[levelConfig.bossKind].hp}`, {
          color: "#8c8c8c",
          fontFamily: "monospace",
          fontSize: "14px"
        })
        .setOrigin(0, 0);
      this.enemyPreviewList.add(bossText);
      contentY += 50;
    }

    levelConfig.enemyKinds.forEach((kind, index) => {
      this.drawEnemyPreviewRow(kind, this.enemyPreviewList, contentY + index * rowSpacing);
    });
    this.enemyPreviewContentHeight = contentY + levelConfig.enemyKinds.length * rowSpacing + 20;
    this.createEnemyPreviewScrollControls();
    this.setEnemyPreviewScroll(0);
  }

  private createEnemyPreviewScrollControls() {
    const viewport = this.enemyPreviewViewport;
    const zone = this.add.zone(viewport.x, viewport.y, viewport.width, viewport.height).setOrigin(0, 0).setInteractive();

    zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.enemyPreviewDragPointer = pointer;
      this.enemyPreviewDragStartY = pointer.y;
      this.enemyPreviewDragStartScrollY = this.enemyPreviewScrollY;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.enemyPreviewDragPointer !== pointer || !pointer.isDown) {
        return;
      }

      this.setEnemyPreviewScroll(this.enemyPreviewDragStartScrollY - (pointer.y - this.enemyPreviewDragStartY));
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.stopEnemyPreviewDrag(pointer));
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.stopEnemyPreviewDrag(pointer));
    this.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        if (!this.enemyPreviewViewport.contains(pointer.x, pointer.y)) {
          return;
        }

        this.setEnemyPreviewScroll(this.enemyPreviewScrollY + deltaY);
      }
    );
  }

  private stopEnemyPreviewDrag(pointer: Phaser.Input.Pointer) {
    if (this.enemyPreviewDragPointer === pointer) {
      this.enemyPreviewDragPointer = null;
    }
  }

  private setEnemyPreviewScroll(scrollY: number) {
    const maxScroll = Math.max(0, this.enemyPreviewContentHeight - this.enemyPreviewViewport.height);
    this.enemyPreviewScrollY = Math.round(Phaser.Math.Clamp(scrollY, 0, maxScroll));
    this.enemyPreviewList.y = this.enemyPreviewViewport.y - this.enemyPreviewScrollY;
  }

  private drawEnemyPreviewRow(kind: EnemyKind, parent: Phaser.GameObjects.Container, y: number) {
    const definition = getEnemyDefinition(kind);
    const shape = createEnemyShape(this, kind).setPosition(20, y);
    shape.setAlpha(0.92);
    const name = this.add
      .text(58, y - 25, getEnemyDisplayName(kind), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
    const stats = this.add
      .text(
        58,
        y + 2,
        `${t("label.hp")} ${definition.hp}  ${t("label.atk")} ${definition.damage}${DAMAGE_SYMBOLS[definition.damageType]}  ${t("label.weight")} ${definition.weight}`,
        {
          color: "#8c8c8c",
          fontFamily: "monospace",
          fontSize: "14px"
        }
      )
      .setOrigin(0, 0);
    parent.add([shape, name, stats]);
  }

  private bossDisplayName(kind: BossKind) {
    if (kind === "tetrahedron") {
      return `${t("enemy.bossTetrahedron")} ${toRomanNumeral(1)}`;
    }

    return `${t("enemy.bossCube")} ${toRomanNumeral(kind === "cube2" ? 2 : 1)}`;
  }

  private createSlots() {
    const startX = 90;
    const slotGap = 94;
    const slotWidth = 88;
    const y = 180;
    for (let index = 0; index < CARD_SLOT_COUNT; index += 1) {
      const x = startX + index * slotGap;
      const frame = this.add.rectangle(x, y, slotWidth, 70, palette.black, 1).setStrokeStyle(2, palette.dim, 1);
      const label = this.add
        .text(x, y - 3, "", {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "28px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      this.slotFrames.push(frame);
      this.slotLabels.push(label);
    }
  }

  private createCardPool() {
    const viewportX = 54;
    const viewportY = 290;
    const viewportWidth = 812;
    const viewportHeight = GAME_HEIGHT - viewportY - 112;
    const columns = 4;
    const columnGap = 190;
    const rowGap = 112;

    this.cardPoolViewport = new Phaser.Geom.Rectangle(viewportX, viewportY, viewportWidth, viewportHeight);
    this.cardPoolList = this.add.container(viewportX, viewportY);
    this.createCardPoolCaseButtons(viewportX, viewportY - 26);

    const maskGraphics = this.add.graphics().setVisible(false);
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(viewportX, viewportY, viewportWidth, viewportHeight);
    this.cardPoolList.setMask(maskGraphics.createGeometryMask());

    this.populateCardPool(columns, columnGap, rowGap);
    this.createCardPoolScrollControls();
    this.setCardPoolScroll(0);
  }

  private populateCardPool(columns: number, columnGap: number, rowGap: number) {
    this.cardPoolList.removeAll(true);
    this.cardFrames.clear();
    const definitions = allCardDefinitions.filter((definition) => cardLetterCase(definition.id) === this.cardPoolCase);
    definitions.forEach((definition, index) => {
      const x = 89 + (index % columns) * columnGap;
      const y = 48 + Math.floor(index / columns) * rowGap;
      const frame = this.add
        .rectangle(x, y, 178, 92, palette.black, 1)
        .setStrokeStyle(2, palette.dim, 1)
        .setInteractive({ useHandCursor: true });
      const border = createUnitBorder(this, definition.category, 22, 2).setPosition(x - 55, y - 6);
      const label = this.add
        .text(x - 55, y - 9, definition.id, {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "29px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      const costText = this.add
        .text(x - 10, y - 30, `${definition.cost}`, {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "17px"
        })
        .setOrigin(0, 0);
      const statsText = this.add
        .text(x - 10, y - 5, definition.stats, {
          color: "#8c8c8c",
          fontFamily: "monospace",
          fontSize: "13px"
        })
        .setOrigin(0, 0);

      this.cardPoolList.add([frame, border, label, costText, statsText]);

      frame.on("pointerup", (pointer: Phaser.Input.Pointer) => this.handleCardPointerUp(definition.id, pointer));
      border.setInteractive(new Phaser.Geom.Rectangle(-28, -28, 56, 56), Phaser.Geom.Rectangle.Contains).on(
        "pointerup",
        (pointer: Phaser.Input.Pointer) => this.handleCardPointerUp(definition.id, pointer)
      );
      label.setInteractive({ useHandCursor: true }).on("pointerup", (pointer: Phaser.Input.Pointer) =>
        this.handleCardPointerUp(definition.id, pointer)
      );
      this.cardFrames.set(definition.id, frame);
    });

    const rowCount = Math.ceil(definitions.length / columns);
    this.cardPoolContentHeight = 48 + Math.max(0, rowCount - 1) * rowGap + 58;
    this.updateCardPoolCaseButtons();
    if (this.startButton) {
      this.updateCardSelection();
    }
    this.setCardPoolScroll(0);
  }

  private createCardPoolCaseButtons(x: number, y: number) {
    this.cardPoolCaseButtons = [
      this.createCardPoolCaseButton("uppercase", x, y, "A"),
      this.createCardPoolCaseButton("lowercase", x + 54, y, "a")
    ];
    this.updateCardPoolCaseButtons();
  }

  private createCardPoolCaseButton(letterCase: CardLetterCase, x: number, y: number, text: string) {
    const frame = this.add
      .rectangle(x, y, 42, 28, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x + 21, y - 1, text, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "17px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setCardPoolCase(letterCase));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setCardPoolCase(letterCase));
    return { letterCase, frame, label };
  }

  private setCardPoolCase(letterCase: CardLetterCase) {
    if (letterCase === this.cardPoolCase) {
      return;
    }

    this.cardPoolCase = letterCase;
    this.cardPoolDragPointer = null;
    this.cardPoolDragMoved = false;
    this.populateCardPool(4, 190, 112);
  }

  private updateCardPoolCaseButtons() {
    for (const button of this.cardPoolCaseButtons) {
      const selected = button.letterCase === this.cardPoolCase;
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.7);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.78);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private createCardPoolScrollControls() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.cardPoolViewport.contains(pointer.x, pointer.y)) {
        return;
      }

      this.cardPoolDragPointer = pointer;
      this.cardPoolDragStartY = pointer.y;
      this.cardPoolDragStartScrollY = this.cardPoolScrollY;
      this.cardPoolDragMoved = false;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.cardPoolDragPointer !== pointer || !pointer.isDown) {
        return;
      }

      const deltaY = pointer.y - this.cardPoolDragStartY;
      if (Math.abs(deltaY) > 4) {
        this.cardPoolDragMoved = true;
      }
      this.setCardPoolScroll(this.cardPoolDragStartScrollY - deltaY);
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.stopCardPoolDrag(pointer));
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.stopCardPoolDrag(pointer));
    this.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        if (!this.cardPoolViewport.contains(pointer.x, pointer.y)) {
          return;
        }

        this.setCardPoolScroll(this.cardPoolScrollY + deltaY);
      }
    );
  }

  private stopCardPoolDrag(pointer: Phaser.Input.Pointer) {
    if (this.cardPoolDragPointer !== pointer) {
      return;
    }

    if (this.cardPoolDragMoved) {
      this.suppressCardClickUntil = this.time.now + 120;
    }
    this.cardPoolDragPointer = null;
  }

  private setCardPoolScroll(scrollY: number) {
    const maxScroll = Math.max(0, this.cardPoolContentHeight - this.cardPoolViewport.height);
    this.cardPoolScrollY = Math.round(Phaser.Math.Clamp(scrollY, 0, maxScroll));
    this.cardPoolList.y = this.cardPoolViewport.y - this.cardPoolScrollY;
  }

  private handleCardPointerUp(id: CardId, pointer: Phaser.Input.Pointer) {
    if (
      this.cardPoolDragMoved ||
      this.time.now < this.suppressCardClickUntil ||
      !this.cardPoolViewport.contains(pointer.x, pointer.y)
    ) {
      return;
    }

    this.toggleCard(id);
  }

  private createStartButton() {
    const y = GAME_HEIGHT - 54;
    this.backButton = this.add
      .rectangle(GAME_WIDTH - 344, y, 132, 46, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    this.backText = this.add
      .text(GAME_WIDTH - 344, y - 2, t("button.back"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    this.startButton = this.add
      .rectangle(GAME_WIDTH - 164, y, 160, 46, palette.black, 1)
      .setStrokeStyle(2, palette.white, 1)
      .setInteractive({ useHandCursor: true });
    this.startText = this.add
      .text(GAME_WIDTH - 164, y - 2, t("button.start"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "20px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    this.backButton.on("pointerdown", () => this.scene.start("LevelSelectScene"));
    this.backText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.scene.start("LevelSelectScene"));
    this.startButton.on("pointerdown", () => this.startLevel());
    this.startText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.startLevel());
  }

  private toggleCard(id: CardId) {
    if (this.selectedCards.includes(id)) {
      this.selectedCards = this.selectedCards.filter((cardId) => cardId !== id);
    } else if (this.selectedCards.length < CARD_SLOT_COUNT) {
      this.selectedCards.push(id);
    }
    this.updateCardSelection();
  }

  private updateCardSelection() {
    this.slotFrames.forEach((slot, index) => {
      const cardId = this.selectedCards[index];
      slot.setStrokeStyle(2, cardId ? palette.white : palette.dim, cardId ? 1 : 0.55);
      this.slotLabels[index].setText(cardId ?? "");
      this.slotLabels[index].setAlpha(cardId ? 1 : 0);
    });

    for (const [id, frame] of this.cardFrames) {
      const selected = this.selectedCards.includes(id);
      frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.6);
      frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.72);
      frame.setAlpha(selected ? 1 : 0.56);
    }

    const enabled = this.selectedCards.length > 0;
    this.startButton.setAlpha(enabled ? 1 : 0.34);
    this.startText.setAlpha(enabled ? 1 : 0.28);
  }

  private startLevel() {
    if (this.selectedCards.length === 0) {
      return;
    }
    this.scene.start("GameScene", {
      levelId: this.levelId,
      selectedCards: this.selectedCards,
      difficulty: this.difficulty,
      unlimitedFirepower: this.unlimitedFirepower
    });
  }
}
