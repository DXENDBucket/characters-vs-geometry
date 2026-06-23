import Phaser from "phaser";
import {
  CUBE_BOSS_CONTACT_DAMAGE,
  CUBE_BOSS_STATS,
  ENEMY_SPEED,
  GAME_HEIGHT,
  GAME_WIDTH,
  palette
} from "../config";
import {
  enemyEncyclopediaEntries,
  mechanicEncyclopediaEntries,
  mechanicLinksForEntry,
  towerEncyclopediaEntries,
  type EncyclopediaEntry,
  type EncyclopediaMechanicId,
  type EncyclopediaTab
} from "../encyclopedia";
import { DAMAGE_SYMBOLS, getLanguage, t } from "../i18n";
import { cardLetterCase, type CardLetterCase } from "../registry/cards";
import { getEnemyDefinition } from "../registry/enemies";
import type { BossKind, DamageType } from "../types";
import {
  createCubeIcon,
  createDodecahedronIcon,
  createEnemyShape,
  createIcosahedronIcon,
  createOctahedronIcon,
  createSmallStellatedDodecahedronIcon,
  createTetrahedronIcon,
  createUnitBorder
} from "./unitShapes";

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

interface EncyclopediaStatModeButton {
  mode: EncyclopediaStatMode;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface EncyclopediaTile {
  id: string;
  frame: Phaser.GameObjects.Rectangle;
}

interface DetailTableRow {
  label: string;
  value: string;
}

type EncyclopediaStatMode = "coarse" | "exact";
type DragArea = "grid" | "detail";

const TILE_SIZE = 106;
const TILE_GAP = 14;
const GRID_COLUMNS = 5;
const DETAIL_TABLE_LABEL_WIDTH = 82;
const DETAIL_TABLE_ROW_HEIGHT = 22;
const EMPTY_TABLE_VALUE = "/";
const detailTextWrap = (width: number) => ({ width, useAdvancedWrap: true });
const GRADE_LABELS = [
  "E",
  "D-",
  "D",
  "D+",
  "C-",
  "C",
  "C+",
  "B-",
  "B",
  "B+",
  "A-",
  "A",
  "A+",
  "S-",
  "S",
  "S+",
  "SS-",
  "SS",
  "SS+",
  "SSS"
];

export class EncyclopediaPanel {
  private overlay!: Phaser.GameObjects.Container;
  private grid!: Phaser.GameObjects.Container;
  private detail!: Phaser.GameObjects.Container;
  private readonly gridViewport = new Phaser.Geom.Rectangle(144, 180, 604, 418);
  private readonly detailViewport = new Phaser.Geom.Rectangle(778, 180, 358, 418);
  private gridContentHeight = 0;
  private detailContentHeight = 0;
  private gridScrollY = 0;
  private detailScrollY = 0;
  private dragPointer: Phaser.Input.Pointer | null = null;
  private dragArea: DragArea | null = null;
  private dragStartY = 0;
  private dragStartScrollY = 0;
  private dragMoved = false;
  private suppressClickUntil = 0;
  private openState = false;
  private tab: EncyclopediaTab = "enemies";
  private tabs: EncyclopediaTabButton[] = [];
  private cardCase: CardLetterCase = "uppercase";
  private cardCaseButtons: EncyclopediaCardCaseButton[] = [];
  private statMode: EncyclopediaStatMode = "coarse";
  private statModeButtons: EncyclopediaStatModeButton[] = [];
  private tiles: EncyclopediaTile[] = [];
  private selectedEntryId = "";

  constructor(private readonly scene: Phaser.Scene) {
    this.createOverlay();
  }

  isOpen() {
    return this.openState;
  }

  open(tab: EncyclopediaTab) {
    this.openState = true;
    this.overlay.setVisible(true);
    this.setTab(tab);
  }

  close() {
    this.openState = false;
    this.dragPointer = null;
    this.dragArea = null;
    this.overlay.setVisible(false);
  }

  private createOverlay() {
    this.tabs = [];
    this.cardCaseButtons = [];
    this.statModeButtons = [];
    const backdrop = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, palette.black, 0.78);
    backdrop.setInteractive();
    const panel = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, 1060, 616, palette.black, 0.98)
      .setStrokeStyle(2, palette.white, 0.95);
    const title = this.scene.add
      .text(144, 86, t("encyclopedia.title"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "26px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
    const closeButton = this.scene.add
      .rectangle(1128, 102, 54, 34, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.9)
      .setInteractive({ useHandCursor: true });
    const closeText = this.scene.add
      .text(1128, 100, "X", {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    const enemyTab = this.createTabButton("enemies", 144, 136);
    const towerTab = this.createTabButton("towers", 284, 136);
    const mechanicTab = this.createTabButton("mechanics", 424, 136);
    const upperCaseButton = this.createCardCaseButton("uppercase", 594, 136, "A");
    const lowerCaseButton = this.createCardCaseButton("lowercase", 646, 136, "a");
    const coarseModeButton = this.createStatModeButton("coarse", 760, 136, t("encyclopedia.coarse"));
    const exactModeButton = this.createStatModeButton("exact", 846, 136, t("encyclopedia.exact"));

    const gridFrame = this.scene.add
      .rectangle(
        this.gridViewport.centerX,
        this.gridViewport.centerY,
        this.gridViewport.width + 8,
        this.gridViewport.height + 8,
        palette.black,
        1
      )
      .setStrokeStyle(1, palette.dim, 0.95);
    const detailFrame = this.scene.add
      .rectangle(
        this.detailViewport.centerX,
        this.detailViewport.centerY,
        this.detailViewport.width + 8,
        this.detailViewport.height + 8,
        palette.black,
        1
      )
      .setStrokeStyle(1, palette.dim, 0.95);

    this.grid = this.scene.add.container(this.gridViewport.x, this.gridViewport.y);
    const gridMask = this.scene.add.graphics().setVisible(false);
    gridMask.fillStyle(0xffffff, 1);
    gridMask.fillRect(this.gridViewport.x, this.gridViewport.y, this.gridViewport.width, this.gridViewport.height);
    this.grid.setMask(gridMask.createGeometryMask());

    this.detail = this.scene.add.container(this.detailViewport.x, this.detailViewport.y);
    const detailMask = this.scene.add.graphics().setVisible(false);
    detailMask.fillStyle(0xffffff, 1);
    detailMask.fillRect(this.detailViewport.x, this.detailViewport.y, this.detailViewport.width, this.detailViewport.height);
    this.detail.setMask(detailMask.createGeometryMask());

    closeButton.on("pointerdown", () => this.close());
    closeText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.close());
    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.startDrag(pointer));
    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.updateDrag(pointer));
    this.scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.stopDrag(pointer));
    this.scene.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.stopDrag(pointer));
    this.scene.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        if (!this.openState) {
          return;
        }

        if (this.gridViewport.contains(pointer.x, pointer.y)) {
          this.setGridScroll(this.gridScrollY + deltaY);
        } else if (this.detailViewport.contains(pointer.x, pointer.y)) {
          this.setDetailScroll(this.detailScrollY + deltaY);
        }
      }
    );

    this.overlay = this.scene.add.container(0, 0, [
      backdrop,
      panel,
      title,
      closeButton,
      closeText,
      enemyTab.frame,
      enemyTab.label,
      towerTab.frame,
      towerTab.label,
      mechanicTab.frame,
      mechanicTab.label,
      upperCaseButton.frame,
      upperCaseButton.label,
      lowerCaseButton.frame,
      lowerCaseButton.label,
      coarseModeButton.frame,
      coarseModeButton.label,
      exactModeButton.frame,
      exactModeButton.label,
      gridFrame,
      detailFrame,
      gridMask,
      detailMask,
      this.grid,
      this.detail
    ]);
    this.overlay.setDepth(260);
    this.overlay.setVisible(false);
  }

  private createTabButton(tab: EncyclopediaTab, x: number, y: number) {
    const frame = this.scene.add
      .rectangle(x, y, 132, 36, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(x + 66, y - 1, t(this.tabLabelKey(tab)), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setTab(tab));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setTab(tab));
    const button = { tab, frame, label };
    this.tabs.push(button);
    return button;
  }

  private createCardCaseButton(letterCase: CardLetterCase, x: number, y: number, text: string) {
    const frame = this.scene.add
      .rectangle(x, y, 42, 30, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(x + 21, y - 1, text, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setCardCase(letterCase));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setCardCase(letterCase));
    const button = { letterCase, frame, label };
    this.cardCaseButtons.push(button);
    return button;
  }

  private createStatModeButton(mode: EncyclopediaStatMode, x: number, y: number, text: string) {
    const frame = this.scene.add
      .rectangle(x, y, 78, 30, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(x + 39, y - 1, text, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setStatMode(mode));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setStatMode(mode));
    const button = { mode, frame, label };
    this.statModeButtons.push(button);
    return button;
  }

  private setTab(tab: EncyclopediaTab) {
    this.tab = tab;
    this.updateTabs();
    this.updateCardCaseButtons();
    this.updateStatModeButtons();
    this.rebuildGrid();
  }

  private setCardCase(letterCase: CardLetterCase) {
    if (letterCase === this.cardCase) {
      return;
    }

    this.cardCase = letterCase;
    this.updateCardCaseButtons();
    if (this.tab === "towers") {
      this.rebuildGrid();
    }
  }

  private setStatMode(mode: EncyclopediaStatMode) {
    if (mode === this.statMode) {
      return;
    }

    this.statMode = mode;
    this.updateStatModeButtons();
    const selected = this.currentEntries().find((entry) => this.entryId(entry) === this.selectedEntryId);
    if (selected) {
      this.drawDetail(selected);
    }
  }

  private updateTabs() {
    for (const button of this.tabs) {
      const selected = button.tab === this.tab;
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.75);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.86);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private updateCardCaseButtons() {
    const visible = this.tab === "towers";
    for (const button of this.cardCaseButtons) {
      const selected = button.letterCase === this.cardCase;
      button.frame.setVisible(visible);
      button.label.setVisible(visible);
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.7);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.78);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private updateStatModeButtons() {
    const visible = this.tab !== "mechanics";
    for (const button of this.statModeButtons) {
      const selected = button.mode === this.statMode;
      button.frame.setVisible(visible);
      button.label.setVisible(visible);
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.7);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.78);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private rebuildGrid(preferredEntryId = this.selectedEntryId) {
    this.grid.removeAll(true);
    this.tiles = [];
    const entries = this.currentEntries();
    const selectedEntry = entries.find((entry) => this.entryId(entry) === preferredEntryId) ?? entries[0];
    this.selectedEntryId = selectedEntry ? this.entryId(selectedEntry) : "";
    entries.forEach((entry, index) => this.drawTile(entry, index));
    const rows = Math.ceil(entries.length / GRID_COLUMNS);
    this.gridContentHeight = rows * TILE_SIZE + Math.max(0, rows - 1) * TILE_GAP + 4;
    this.setGridScroll(0);
    this.updateTileSelection();
    if (selectedEntry) {
      this.drawDetail(selectedEntry);
    } else {
      this.drawEmptyDetail();
    }
  }

  private drawTile(entry: EncyclopediaEntry, index: number) {
    const column = index % GRID_COLUMNS;
    const row = Math.floor(index / GRID_COLUMNS);
    const x = column * (TILE_SIZE + TILE_GAP);
    const y = row * (TILE_SIZE + TILE_GAP);
    const id = this.entryId(entry);
    const container = this.scene.add.container(x, y);
    const frame = this.scene.add
      .rectangle(TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, palette.black, 1)
      .setStrokeStyle(2, palette.dim, 0.88)
      .setInteractive({ useHandCursor: true });
    const title = this.scene.add
      .text(TILE_SIZE / 2, TILE_SIZE - 18, this.shortTitle(entry), {
        color: "#cfcfcf",
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "700",
        align: "center",
        wordWrap: detailTextWrap(TILE_SIZE - 10)
      })
      .setOrigin(0.5);

    container.add(frame);
    this.addEntryIcon(container, entry, TILE_SIZE / 2, 42, 0.92);
    container.add(title);

    const openEntry = (pointer: Phaser.Input.Pointer) => {
      if (this.dragMoved || this.timeIsSuppressingClick() || !this.gridViewport.contains(pointer.x, pointer.y)) {
        return;
      }

      this.selectEntry(entry);
    };
    frame.on("pointerup", openEntry);
    title.setInteractive({ useHandCursor: true }).on("pointerup", openEntry);

    this.grid.add(container);
    this.tiles.push({ id, frame });
  }

  private selectEntry(entry: EncyclopediaEntry) {
    this.selectedEntryId = this.entryId(entry);
    this.updateTileSelection();
    this.drawDetail(entry);
  }

  private updateTileSelection() {
    for (const tile of this.tiles) {
      const selected = tile.id === this.selectedEntryId;
      tile.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.82);
      tile.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.95);
    }
  }

  private drawEmptyDetail() {
    this.detail.removeAll(true);
    const text = this.scene.add
      .text(this.detailViewport.width / 2, this.detailViewport.height / 2, t("encyclopedia.selectEntry"), {
        color: "#777777",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    this.detail.add(text);
    this.detailContentHeight = this.detailViewport.height;
    this.setDetailScroll(0);
  }

  private drawDetail(entry: EncyclopediaEntry) {
    this.detail.removeAll(true);
    let y = 18;
    this.addEntryIcon(this.detail, entry, 46, y + 34, 1.08);
    const title = this.scene.add
      .text(92, y, entry.title, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "19px",
        fontStyle: "700",
        wordWrap: detailTextWrap(this.detailViewport.width - 112)
      })
      .setOrigin(0, 0);
    this.detail.add(title);
    y += Math.max(74, title.height + 18);

    const statsTitle = this.scene.add
      .text(18, y, t("encyclopedia.details"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
    this.detail.add(statsTitle);
    y += 24;

    y += this.drawDetailTable(entry, y) + 18;

    const notes = this.detailNotes(entry);
    if (notes.length > 0) {
      const noteText = this.scene.add
        .text(18, y, notes.join("\n"), {
          color: "#d8d8d8",
          fontFamily: "monospace",
          fontSize: "12px",
          lineSpacing: 4,
          wordWrap: detailTextWrap(this.detailViewport.width - 36)
        })
        .setOrigin(0, 0);
      this.detail.add(noteText);
      y += noteText.height + 18;
    }

    const description = this.scene.add
      .text(18, y, entry.description, {
        color: "#a8a8a8",
        fontFamily: "monospace",
        fontSize: "12px",
        lineSpacing: 4,
        wordWrap: detailTextWrap(this.detailViewport.width - 36)
      })
      .setOrigin(0, 0);
    this.detail.add(description);
    y += description.height + 18;
    y = this.drawMechanicLinks(entry, y);

    this.detailContentHeight = y + 18;
    this.setDetailScroll(0);
  }

  private drawDetailTable(entry: EncyclopediaEntry, y: number) {
    const rows = this.detailTableRows(entry);
    const x = 18;
    const width = this.detailViewport.width - 36;
    const height = rows.length * DETAIL_TABLE_ROW_HEIGHT;
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(1, palette.dim, 0.86);
    graphics.strokeRect(x, y, width, height);
    graphics.lineBetween(x + DETAIL_TABLE_LABEL_WIDTH, y, x + DETAIL_TABLE_LABEL_WIDTH, y + height);
    for (let index = 1; index < rows.length; index += 1) {
      const rowY = y + index * DETAIL_TABLE_ROW_HEIGHT;
      graphics.lineBetween(x, rowY, x + width, rowY);
    }
    this.detail.add(graphics);

    rows.forEach((row, index) => {
      const rowY = y + index * DETAIL_TABLE_ROW_HEIGHT + DETAIL_TABLE_ROW_HEIGHT / 2 - 1;
      const label = this.scene.add
        .text(x + 8, rowY, row.label, {
          color: "#8c8c8c",
          fontFamily: "monospace",
          fontSize: "11px",
          fontStyle: "700"
        })
        .setOrigin(0, 0.5);
      const value = this.scene.add
        .text(x + DETAIL_TABLE_LABEL_WIDTH + 8, rowY, row.value, {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "11px",
          wordWrap: detailTextWrap(width - DETAIL_TABLE_LABEL_WIDTH - 16)
        })
        .setOrigin(0, 0.5);
      this.detail.add([label, value]);
    });

    return height;
  }

  private drawMechanicLinks(entry: EncyclopediaEntry, y: number) {
    const links = mechanicLinksForEntry(entry);
    if (links.length === 0) {
      return y;
    }

    const heading = this.scene.add
      .text(18, y, t("encyclopedia.relatedMechanics"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "13px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
    this.detail.add(heading);
    y += 24;

    let x = 18;
    let rowY = y;
    for (const mechanicId of links) {
      const label = this.mechanicTitle(mechanicId);
      const link = this.scene.add
        .text(x, rowY, label, {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "13px",
          fontStyle: "700"
        })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      const underline = this.scene.add.graphics();
      underline.lineStyle(1, palette.white, 0.92);
      underline.lineBetween(x, rowY + link.height + 1, x + link.width, rowY + link.height + 1);
      link.on("pointerdown", () => this.openMechanic(mechanicId));
      this.detail.add([link, underline]);
      x += link.width + 18;
      if (x > this.detailViewport.width - 88) {
        x = 18;
        rowY += 24;
      }
    }
    return rowY + 30;
  }

  private openMechanic(mechanicId: EncyclopediaMechanicId) {
    this.tab = "mechanics";
    this.updateTabs();
    this.updateCardCaseButtons();
    this.updateStatModeButtons();
    this.rebuildGrid(`mechanic:${mechanicId}`);
  }

  private addEntryIcon(
    parent: Phaser.GameObjects.Container,
    entry: EncyclopediaEntry,
    x: number,
    y: number,
    scale: number
  ) {
    if (entry.enemyKind) {
      parent.add(createEnemyShape(this.scene, entry.enemyKind).setPosition(x, y).setScale(scale));
      return;
    }

    if (entry.icon) {
      const icon = this.createBossIcon(entry.icon).setPosition(x, y).setScale(scale);
      parent.add(icon);
      return;
    }

    if (entry.card) {
      const border = createUnitBorder(this.scene, entry.card.category, 25 * scale, entry.card.category === "defense" ? 3 : 2)
        .setPosition(x, y);
      const label = this.scene.add
        .text(x, y - 2, entry.card.id, {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: `${Math.round(30 * scale)}px`,
          fontStyle: "700"
        })
        .setOrigin(0.5);
      parent.add([border, label]);
      return;
    }

    const iconText = this.scene.add
      .text(x, y - 2, entry.mechanicIcon ?? "?", {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: `${Math.round(25 * scale)}px`,
        fontStyle: "700"
      })
      .setOrigin(0.5);
    parent.add(iconText);
  }

  private createBossIcon(icon: NonNullable<EncyclopediaEntry["icon"]>) {
    if (icon === "cube") {
      return createCubeIcon(this.scene);
    }
    if (icon === "tetrahedron") {
      return createTetrahedronIcon(this.scene);
    }
    if (icon === "dodecahedron") {
      return createDodecahedronIcon(this.scene);
    }
    if (icon === "smallStellatedDodecahedron") {
      return createSmallStellatedDodecahedronIcon(this.scene);
    }
    if (icon === "octahedron") {
      return createOctahedronIcon(this.scene);
    }
    return createIcosahedronIcon(this.scene);
  }

  private detailTableRows(entry: EncyclopediaEntry): DetailTableRow[] {
    const row = (label: string, value: string): DetailTableRow => ({ label, value });
    if (entry.card) {
      const card = entry.card;
      return [
        row(t("label.hp"), this.statValue(card.maxHp, "hp")),
        row(t("label.armor"), this.statValue(card.armor ?? 0, "armor")),
        row(t("label.mr"), this.statValue(card.magicResistance ?? 0, "mr")),
        row(t("label.atk"), this.damageValue(card.damage, card.damageType)),
        row(isZhLabel("攻速", "AS"), this.statValue(card.attackSpeed, "attackSpeed")),
        row(t("label.speed"), EMPTY_TABLE_VALUE),
        row(isZhLabel("范围", "RANGE"), this.statValue(card.rangeCells, "range")),
        row(t("label.cost"), this.statValue(card.cost, "cost")),
        row(t("label.cd"), this.cooldownValue(card.cooldown)),
        row(t("label.weight"), EMPTY_TABLE_VALUE)
      ];
    }

    if (entry.enemyKind) {
      const enemy = getEnemyDefinition(entry.enemyKind);
      const speed = ENEMY_SPEED * (enemy.speedMultiplier ?? 1);
      return [
        row(t("label.hp"), this.statValue(enemy.hp, "hp")),
        row(t("label.armor"), this.statValue(enemy.armor, "armor")),
        row(t("label.mr"), this.statValue(enemy.magicResistance, "mr")),
        row(t("label.atk"), this.damageValue(enemy.damage, enemy.damageType)),
        row(isZhLabel("攻速", "AS"), EMPTY_TABLE_VALUE),
        row(t("label.speed"), this.statValue(speed, "moveSpeed")),
        row(isZhLabel("范围", "RANGE"), EMPTY_TABLE_VALUE),
        row(t("label.cost"), EMPTY_TABLE_VALUE),
        row(t("label.cd"), EMPTY_TABLE_VALUE),
        row(t("label.weight"), this.statValue(enemy.weight, "weight"))
      ];
    }

    const bossStats = entry.icon ? bossStatsForIcon(entry.icon) : null;
    if (bossStats) {
      return [
        row(t("label.hp"), this.statValue(bossStats.hp, "bossHp")),
        row(t("label.armor"), this.statValue(bossStats.armor, "armor")),
        row(t("label.mr"), this.statValue(bossStats.magicResistance, "mr")),
        row(t("label.atk"), this.damageValue(CUBE_BOSS_CONTACT_DAMAGE, "physical")),
        row(isZhLabel("攻速", "AS"), EMPTY_TABLE_VALUE),
        row(t("label.speed"), this.statValue(bossStats.speed, "moveSpeed")),
        row(isZhLabel("范围", "RANGE"), EMPTY_TABLE_VALUE),
        row(t("label.cost"), EMPTY_TABLE_VALUE),
        row(t("label.cd"), EMPTY_TABLE_VALUE),
        row(t("label.weight"), EMPTY_TABLE_VALUE)
      ];
    }

    return [
      row(t("label.hp"), EMPTY_TABLE_VALUE),
      row(t("label.armor"), EMPTY_TABLE_VALUE),
      row(t("label.mr"), EMPTY_TABLE_VALUE),
      row(t("label.atk"), EMPTY_TABLE_VALUE),
      row(isZhLabel("攻速", "AS"), EMPTY_TABLE_VALUE),
      row(t("label.speed"), EMPTY_TABLE_VALUE),
      row(isZhLabel("范围", "RANGE"), EMPTY_TABLE_VALUE),
      row(t("label.cost"), EMPTY_TABLE_VALUE),
      row(t("label.cd"), EMPTY_TABLE_VALUE),
      row(t("label.weight"), EMPTY_TABLE_VALUE)
    ];
  }

  private detailNotes(entry: EncyclopediaEntry) {
    if (entry.mechanicId) {
      return entry.lines;
    }

    return entry.lines.slice(1);
  }

  private statValue(value: number | undefined, gradeType: string) {
    if (value === undefined || Number.isNaN(value)) {
      return EMPTY_TABLE_VALUE;
    }

    return this.statMode === "exact" ? formatNumber(value) : grade(value, gradeType);
  }

  private damageValue(value: number | undefined, damageType?: DamageType) {
    if (value === undefined || Number.isNaN(value)) {
      return EMPTY_TABLE_VALUE;
    }

    return `${this.statMode === "exact" ? formatNumber(value) : grade(value, "attack")}${damageSymbol(damageType)}`;
  }

  private cooldownValue(cooldownMs: number | undefined) {
    if (cooldownMs === undefined || Number.isNaN(cooldownMs)) {
      return EMPTY_TABLE_VALUE;
    }

    const seconds = cooldownMs / 1000;
    return this.statMode === "exact" ? `${formatNumber(seconds)}s` : grade(seconds, "cooldown");
  }

  private currentEntries() {
    if (this.tab === "enemies") {
      return enemyEncyclopediaEntries();
    }

    if (this.tab === "mechanics") {
      return mechanicEncyclopediaEntries();
    }

    return towerEncyclopediaEntries().filter((entry) => entry.card && cardLetterCase(entry.card.id) === this.cardCase);
  }

  private entryId(entry: EncyclopediaEntry) {
    if (entry.id) {
      return entry.id;
    }
    if (entry.mechanicId) {
      return `mechanic:${entry.mechanicId}`;
    }
    if (entry.card) {
      return `tower:${entry.card.id}`;
    }
    if (entry.enemyKind) {
      return `enemy:${entry.enemyKind}`;
    }
    return `entry:${entry.icon ?? "text"}:${entry.title}`;
  }

  private shortTitle(entry: EncyclopediaEntry) {
    if (entry.card) {
      return entry.card.id;
    }
    if (entry.mechanicIcon) {
      return entry.title;
    }
    return entry.title.replace(/\s*Series$/i, "").replace(/\s*Leader$/i, "");
  }

  private mechanicTitle(mechanicId: EncyclopediaMechanicId) {
    return mechanicEncyclopediaEntries().find((entry) => entry.mechanicId === mechanicId)?.title ?? mechanicId;
  }

  private tabLabelKey(tab: EncyclopediaTab) {
    if (tab === "enemies") {
      return "encyclopedia.enemies";
    }
    if (tab === "towers") {
      return "encyclopedia.towers";
    }
    return "encyclopedia.mechanics";
  }

  private startDrag(pointer: Phaser.Input.Pointer) {
    if (!this.openState) {
      return;
    }

    const area = this.gridViewport.contains(pointer.x, pointer.y)
      ? "grid"
      : this.detailViewport.contains(pointer.x, pointer.y)
        ? "detail"
        : null;
    if (!area) {
      return;
    }

    this.dragPointer = pointer;
    this.dragArea = area;
    this.dragStartY = pointer.y;
    this.dragStartScrollY = area === "grid" ? this.gridScrollY : this.detailScrollY;
    this.dragMoved = false;
  }

  private updateDrag(pointer: Phaser.Input.Pointer) {
    if (this.dragPointer !== pointer || !pointer.isDown || !this.dragArea) {
      return;
    }

    const delta = pointer.y - this.dragStartY;
    if (Math.abs(delta) > 5) {
      this.dragMoved = true;
    }

    if (this.dragArea === "grid") {
      this.setGridScroll(this.dragStartScrollY - delta);
    } else {
      this.setDetailScroll(this.dragStartScrollY - delta);
    }
  }

  private stopDrag(pointer: Phaser.Input.Pointer) {
    if (this.dragPointer !== pointer) {
      return;
    }

    if (this.dragMoved) {
      this.suppressClickUntil = this.scene.time.now + 120;
    }
    this.dragPointer = null;
    this.dragArea = null;
  }

  private timeIsSuppressingClick() {
    return this.scene.time.now < this.suppressClickUntil;
  }

  private setGridScroll(scrollY: number) {
    const maxScroll = Math.max(0, this.gridContentHeight - this.gridViewport.height);
    this.gridScrollY = Math.round(Phaser.Math.Clamp(scrollY, 0, maxScroll));
    this.grid.y = this.gridViewport.y - this.gridScrollY;
  }

  private setDetailScroll(scrollY: number) {
    const maxScroll = Math.max(0, this.detailContentHeight - this.detailViewport.height);
    this.detailScrollY = Math.round(Phaser.Math.Clamp(scrollY, 0, maxScroll));
    this.detail.y = this.detailViewport.y - this.detailScrollY;
  }
}

function grade(value: number, type: string) {
  const thresholds = gradeThresholds(type);
  let index = 0;
  while (index < thresholds.length && value >= thresholds[index]) {
    index += 1;
  }
  return GRADE_LABELS[Math.min(index, GRADE_LABELS.length - 1)];
}

function gradeThresholds(type: string) {
  switch (type) {
    case "bossHp":
      return [10000, 20000, 40000, 70000, 100000, 140000, 180000, 220000, 280000, 340000, 420000, 520000, 650000, 800000, 1000000, 1300000, 1700000, 2200000, 3000000];
    case "hp":
      return [100, 250, 500, 900, 1400, 2200, 3500, 5500, 8000, 12000, 18000, 26000, 38000, 55000, 80000, 115000, 160000, 220000, 300000];
    case "armor":
      return [1, 20, 50, 100, 200, 300, 500, 700, 900, 1200, 1600, 2200, 3000, 4000, 5200, 6800, 8600, 11000, 14000];
    case "mr":
      return [1, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 220, 260, 320];
    case "attack":
      return [1, 50, 100, 200, 350, 500, 750, 1000, 1400, 1800, 2400, 3200, 4500, 6500, 9000, 13000, 18000, 25000, 35000];
    case "attackSpeed":
      return [1, 5, 10, 20, 30, 45, 60, 75, 90, 110, 130, 150, 180, 220, 260, 320, 400, 520, 700];
    case "moveSpeed":
      return [0.5, 1, 3, 6, 10, 15, 20, 25, 30, 35, 45, 60, 80, 110, 150, 200, 260, 340, 450];
    case "cost":
      return [1, 50, 100, 150, 200, 300, 425, 550, 700, 900, 1100, 1400, 1750, 2200, 3000, 4500, 6500, 9000, 13000];
    case "cooldown":
      return [1, 5, 10, 15, 20, 30, 40, 50, 60, 75, 90, 120, 150, 180, 240, 320, 420, 560, 720];
    case "range":
      return [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 26, 34, 44, 56, 70, 88, 110, 140];
    case "weight":
      return [1, 10, 30, 50, 70, 90, 120, 150, 200, 250, 320, 400, 500, 650, 850, 1100, 1500, 2200, 3200];
    default:
      return [1, 2, 5, 10, 20, 35, 50, 75, 100, 150, 220, 320, 460, 650, 900, 1300, 1800, 2500, 3500];
  }
}

function damageSymbol(type?: DamageType) {
  return type ? DAMAGE_SYMBOLS[type] : "";
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function bossStatsForIcon(icon: NonNullable<EncyclopediaEntry["icon"]>) {
  const iconToKind: Record<NonNullable<EncyclopediaEntry["icon"]>, BossKind> = {
    cube: "cube",
    tetrahedron: "tetrahedron",
    dodecahedron: "dodecahedron",
    smallStellatedDodecahedron: "smallStellatedDodecahedron",
    octahedron: "octahedron",
    icosahedron: "icosahedron"
  };
  return CUBE_BOSS_STATS[iconToKind[icon]];
}

function isZhLabel(zh: string, en: string) {
  return getLanguage() === "zh-CN" ? zh : en;
}
