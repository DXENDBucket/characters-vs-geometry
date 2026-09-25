import Phaser from "phaser";
import { createDelIcon } from "./delBoss";
import { playUiClick } from "../audio/player";
import { drawTowerShellBorder } from "./parenthesisTower";
import { isTowerShellType } from "../game/towerOccupancy";
import { bindButtonHover } from "./buttonHover";
import { bindSliderInput } from "./sliderInput";
import { bindHoldButton } from "./holdButton";
import { clipInputToViewport } from "./viewportInput";
import { drawRangeDiagram } from "./rangeDiagram";
import {
  CUBE_BOSS_CONTACT_DAMAGE,
  ENEMY_SPEED,
  GAME_HEIGHT,
  GAME_WIDTH,
  palette,
  uiTextColors
} from "../config";
import {
  enemyEncyclopediaEntries,
  mechanicEncyclopediaEntries,
  mechanicLinksForEntry,
  towerEncyclopediaEntries,
  towerUpgradeText,
  type EncyclopediaEntry,
  type EncyclopediaMechanicId,
  type EncyclopediaTab
} from "../encyclopedia";
import { towerDetailSections, towerDetailRange, towerPreviewStats, type DetailField, type DetailSection } from "../encyclopediaDetails";
import { enemyDetailSections, enemyPreviewAttackSpeed } from "../enemyEncyclopediaDetails";
import { bossDetailSections, bossPreviewLimit, bossPreviewStats } from "../bossEncyclopediaDetails";
import { enemyEncyclopediaSections } from "../enemyEncyclopediaCatalog";
import { enemyKindAtRank } from "../game/enemyIdentity";
import { DAMAGE_SYMBOLS, getLanguage, t } from "../i18n";
import { bossEncyclopediaIcon, enemyEncyclopediaGroup, visibleEnemyEncyclopediaGroups, visibleEncyclopediaEntries } from "../encyclopediaVisibility";
import { cardLetterCase, type CardLetterCase } from "../registry/cardDefinitions";
import { enemyFamily, enemyRank, getEnemyDefinition } from "../registry/enemies";
import type { BossKind, CardId, DamageType, EnemyKind } from "../types";
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
  y: number;
}

interface DetailTableRow {
  label: string;
  value: string;
}

type EncyclopediaStatMode = "coarse" | "exact";
type DragArea = "grid" | "detail";

const TILE_SIZE = 120;
const TILE_GAP = 12;
const GRID_COLUMNS = 2;
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
  private readonly gridViewport = new Phaser.Geom.Rectangle(40, 170, 256, 548);
  private readonly detailViewport = new Phaser.Geom.Rectangle(330, 150, 904, 568);
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
  private enemyGroupId = "main";
  private enemyGroupControls!: Phaser.GameObjects.Container;
  private statMode: EncyclopediaStatMode = "exact";
  private statModeButtons: EncyclopediaStatModeButton[] = [];
  private tiles: EncyclopediaTile[] = [];
  private selectedEntryId = "";
  private previewLevel = 1;
  private levelControls!: Phaser.GameObjects.Container;
  private levelLabel!: Phaser.GameObjects.Text;
  private previewCaption!: Phaser.GameObjects.Text;
  private readonly cancelLevelHolds: Array<() => void> = [];
  private selectedLabel!: Phaser.GameObjects.Text;
  private scrollbars!: Phaser.GameObjects.Graphics;
  private readonly scrollMemory = new Map<string, number>();
  private readonly selectionMemory = new Map<string, string>();

  constructor(private readonly scene: Phaser.Scene, private readonly onClose?: () => void) {
    this.createOverlay();
  }

  isOpen() {
    return this.openState;
  }

  open(tab: EncyclopediaTab) {
    this.dragMoved = false;
    this.suppressClickUntil = 0;
    this.openState = true;
    this.overlay.setVisible(true);
    this.setTab(tab);
  }

  openEnemy(kind: EnemyKind) {
    const entry = this.openMatchingEnemy((entry) => !!entry.enemyKind && enemyFamily(entry.enemyKind) === enemyFamily(kind));
    if (entry) {
      this.previewLevel = Math.min(999, enemyRank(kind));
      this.drawDetail(entry);
    }
  }

  openTower(id: CardId) {
    this.cardCase = cardLetterCase(id);
    this.previewLevel = 1;
    this.open("towers");
    const entries = this.currentEntries();
    const index = entries.findIndex(entry => entry.card?.id === id);
    if (index < 0) return;
    this.selectEntry(entries[index]);
    this.scrollToEntry(entries[index]);
  }

  openBoss(kind: BossKind) {
    const entry = this.openMatchingEnemy((entry) => entry.icon === bossEncyclopediaIcon(kind));
    if (entry) {
      this.previewLevel = kind.endsWith("2") ? 2 : 1;
      this.drawDetail(entry);
    }
  }

  private openMatchingEnemy(matches: (entry: EncyclopediaEntry) => boolean) {
    const target = visibleEncyclopediaEntries(enemyEncyclopediaEntries()).find(matches);
    if (target) this.enemyGroupId = enemyEncyclopediaGroup(target);
    this.open("enemies");
    const entries = this.currentEntries();
    const index = entries.findIndex(matches);
    if (index < 0) return;
    this.selectEntry(entries[index]);
    this.scrollToEntry(entries[index]);
    return entries[index];
  }

  close() {
    this.cancelLevelHolds.forEach(cancel => cancel());
    this.openState = false;
    this.dragPointer = null;
    this.dragArea = null;
    this.overlay.setVisible(false);
    this.onClose?.();
  }

  private createOverlay() {
    this.tabs = [];
    this.cardCaseButtons = [];
    this.statModeButtons = [];
    const backdrop = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, palette.black, 0.78);
    backdrop.setInteractive();
    const panel = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 24, GAME_HEIGHT - 24, palette.black, 0.99)
      .setStrokeStyle(2, palette.white, 0.95);
    const title = this.scene.add
      .text(40, 38, t("encyclopedia.title"), {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "26px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
    const closeButton = this.scene.add
      .rectangle(1210, 52, 40, 40, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.9)
      .setInteractive({ useHandCursor: true });
    const closeText = this.scene.add
      .text(1210, 51, "×", {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    const enemyTab = this.createTabButton("enemies", 330, 52);
    const towerTab = this.createTabButton("towers", 474, 52);
    const mechanicTab = this.createTabButton("mechanics", 618, 52);
    const upperCaseButton = this.createCardCaseButton("uppercase", 40, 126, "A");
    const lowerCaseButton = this.createCardCaseButton("lowercase", 96, 126, "a");
    const asciiButton = this.createCardCaseButton("ascii", 152, 126, "@");
    this.enemyGroupControls = this.scene.add.container(0, 0);
    const coarseModeButton = this.createStatModeButton("coarse", 330, 114, t("encyclopedia.coarse"));
    const exactModeButton = this.createStatModeButton("exact", 420, 114, t("encyclopedia.exact"));
    this.levelControls = this.scene.add.container(0, 0);
    this.levelLabel = this.scene.add.text(1104, 114, "Lv. 1", { fontFamily: "monospace", fontSize: "18px", color: uiTextColors.primary }).setOrigin(.5);
    this.levelControls.add(this.levelLabel);
    for (const [x, delta, symbol] of [[1022, -1, "−"], [1186, 1, "+"]] as const) {
      const frame = this.scene.add.rectangle(x, 114, 36, 32, palette.black).setStrokeStyle(1, palette.mid).setInteractive({ useHandCursor: true });
      const label = this.scene.add.text(x, 113, symbol, { fontFamily: "monospace", fontSize: "22px", color: uiTextColors.primary }).setOrigin(.5);
      this.cancelLevelHolds.push(bindHoldButton(this.scene, frame, () => this.changePreviewLevel(delta),
        () => this.openState && this.levelControls.visible));
      bindButtonHover(frame, [label]);
      this.levelControls.add([frame, label]);
    }
    this.previewCaption = this.scene.add.text(1000, 114, isZhLabel("预览等级", "Preview level"), { fontFamily: "monospace", fontSize: "14px", color: uiTextColors.secondary }).setOrigin(1, .5);
    this.levelControls.add(this.previewCaption);
    this.selectedLabel = this.scene.add.text(530, 114, "", { fontFamily: "monospace", fontSize: "17px", color: uiTextColors.primary,
      wordWrap: detailTextWrap(310) }).setOrigin(0, .5);
    this.scrollbars = this.scene.add.graphics();

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
    bindButtonHover(closeButton, [closeText]);
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

        const position = this.pointerPosition(pointer);
        if (this.gridViewport.contains(position.x, position.y)) {
          this.setGridScroll(this.gridScrollY + deltaY);
        } else if (this.detailViewport.contains(position.x, position.y)) {
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
      asciiButton.frame,
      asciiButton.label,
      this.enemyGroupControls,
      coarseModeButton.frame,
      coarseModeButton.label,
      exactModeButton.frame,
      exactModeButton.label,
      gridFrame,
      detailFrame,
      gridMask,
      detailMask,
      this.grid,
      this.detail,
      this.levelControls,
      this.selectedLabel,
      this.scrollbars
    ]);
    this.overlay.setDepth(260);
    this.overlay.setVisible(false);
    for (const area of ["grid", "detail"] as const) {
      const rect = area === "grid" ? this.gridViewport : this.detailViewport;
      const hit = this.scene.add.zone(rect.right + 8, rect.centerY, 14, rect.height)
        .setInteractive({ useHandCursor: true });
      this.overlay.add(hit);
      bindSliderInput(this.scene, [hit], {
        coordinate: pointer => this.pointerPosition(pointer).y,
        enabled: () => this.openState && this.scrollbarGeometry(area).maxScroll > 0,
        geometry: () => this.scrollbarGeometry(area),
        change: ratio => {
          this.dragMoved = true;
          this.suppressClickUntil = this.scene.time.now + 120;
          const scroll = ratio * this.scrollbarGeometry(area).maxScroll;
          if (area === "grid") this.setGridScroll(scroll);
          else this.setDetailScroll(scroll);
        }
      });
    }
  }

  private createTabButton(tab: EncyclopediaTab, x: number, y: number) {
    const frame = this.scene.add
      .rectangle(x, y, 132, 36, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(x + 66, y - 1, t(this.tabLabelKey(tab)), {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setTab(tab));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setTab(tab));
    bindButtonHover(frame, [label]);
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
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setCardCase(letterCase));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setCardCase(letterCase));
    bindButtonHover(frame, [label]);
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
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setStatMode(mode));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setStatMode(mode));
    bindButtonHover(frame, [label]);
    const button = { mode, frame, label };
    this.statModeButtons.push(button);
    return button;
  }

  private setTab(tab: EncyclopediaTab) {
    this.cancelLevelHolds.forEach(cancel => cancel());
    this.tab = tab;
    this.updateTabs();
    this.updateCardCaseButtons();
    this.updateEnemyGroupButtons();
    this.updateStatModeButtons();
    this.rebuildGrid();
  }

  private setCardCase(letterCase: CardLetterCase) {
    this.cancelLevelHolds.forEach(cancel => cancel());
    if (letterCase === this.cardCase) {
      return;
    }

    this.cardCase = letterCase;
    this.updateCardCaseButtons();
    if (this.tab === "towers") {
      this.rebuildGrid();
    }
  }

  private updateEnemyGroupButtons() {
    this.enemyGroupControls.removeAll(true);
    this.enemyGroupControls.setVisible(this.tab === "enemies");
    if (this.tab !== "enemies") return;
    const groups = visibleEnemyEncyclopediaGroups(visibleEncyclopediaEntries(enemyEncyclopediaEntries()));
    if (!groups.some(group => group.id === this.enemyGroupId)) this.enemyGroupId = groups[0]?.id ?? "main";
    const width = (this.gridViewport.width - Math.max(0, groups.length - 1) * 12) / Math.max(1, groups.length);
    groups.forEach((group, index) => {
      const x = this.gridViewport.x + index * (width + 12) + width / 2;
      const selected = group.id === this.enemyGroupId;
      const frame = this.scene.add.rectangle(x, 126, width, 30, selected ? palette.panel : palette.black)
        .setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.7)
        .setInteractive({ useHandCursor: true });
      const label = this.scene.add.text(x, 125, t(group.labelKey), {
        color: uiTextColors.primary, fontFamily: "monospace", fontSize: "14px", fontStyle: "700"
      }).setOrigin(0.5).setAlpha(selected ? 1 : 0.78);
      if (label.width > width - 12) label.setFontSize(12);
      frame.on("pointerdown", () => {
        if (this.enemyGroupId === group.id) return;
        this.enemyGroupId = group.id;
        this.updateEnemyGroupButtons();
        this.rebuildGrid();
      });
      this.enemyGroupControls.add([frame, label]);
      bindButtonHover(frame, [label]);
    });
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
      button.label.setAlpha(selected ? 1 : 0.78);
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
      button.label.setAlpha(selected ? 1 : 0.78);
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
      button.label.setAlpha(selected ? 1 : 0.78);
    }
  }

  private rebuildGrid(preferredEntryId = this.selectionMemory.get(this.listKey()) ?? this.selectedEntryId) {
    this.grid.removeAll(true);
    this.tiles = [];
    const entries = this.currentEntries();
    const selectedEntry = entries.find((entry) => this.entryId(entry) === preferredEntryId) ?? entries[0];
    const nextId = selectedEntry ? this.entryId(selectedEntry) : "";
    if (nextId !== this.selectedEntryId) this.previewLevel = 1;
    this.selectedEntryId = nextId;
    this.selectionMemory.set(this.listKey(), nextId);
    let offsetY = 0;
    const sections = this.tab === "enemies"
      ? enemyEncyclopediaSections(entries)
      : [{ labelKey: "", entries }];
    for (const section of sections) {
      if (section.labelKey) {
        if (offsetY > 0) offsetY += 12;
        const heading = this.scene.add.text(2, offsetY + 2, t(section.labelKey), {
          color: uiTextColors.primary, fontFamily: "monospace", fontSize: "14px", fontStyle: "700"
        }).setName("enemy-section-heading");
        this.grid.add(heading);
        offsetY += 30;
      }
      section.entries.forEach((entry, index) => this.drawTile(entry, index, offsetY));
      const rows = Math.ceil(section.entries.length / GRID_COLUMNS);
      offsetY += rows * TILE_SIZE + Math.max(0, rows - 1) * TILE_GAP;
    }
    this.gridContentHeight = offsetY + 4;
    this.setGridScroll(this.scrollMemory.get(this.listKey()) ?? 0);
    this.updateTileSelection();
    if (selectedEntry) {
      this.drawDetail(selectedEntry);
    } else {
      this.drawEmptyDetail();
    }
  }

  private scrollToEntry(entry: EncyclopediaEntry) {
    const tile = this.tiles.find(tile => tile.id === this.entryId(entry));
    if (tile) this.setGridScroll(tile.y);
  }

  private drawTile(entry: EncyclopediaEntry, index: number, offsetY: number) {
    const column = index % GRID_COLUMNS;
    const row = Math.floor(index / GRID_COLUMNS);
    const x = column * (TILE_SIZE + TILE_GAP);
    const y = offsetY + row * (TILE_SIZE + TILE_GAP);
    const id = this.entryId(entry);
    const container = this.scene.add.container(x, y);
    const frame = this.scene.add
      .rectangle(TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, palette.black, 1)
      .setStrokeStyle(2, palette.dim, 0.88)
      .setInteractive({ useHandCursor: true });
    const title = this.scene.add
      .text(TILE_SIZE / 2, TILE_SIZE - 28, this.shortTitle(entry), {
        color: uiTextColors.body,
        fontFamily: "monospace",
        fontSize: "13px",
        fontStyle: "700",
        align: "center",
        wordWrap: detailTextWrap(TILE_SIZE - 10)
      })
      .setOrigin(0.5);

    container.add(frame);
    this.addEntryIcon(container, entry, TILE_SIZE / 2, 42, 0.92);
    container.add(title);

    const openEntry = (pointer: Phaser.Input.Pointer) => {
      const position = this.pointerPosition(pointer);
      if (this.dragMoved || this.timeIsSuppressingClick() || !this.gridViewport.contains(position.x, position.y)) {
        return;
      }

      this.selectEntry(entry);
    };
    frame.on("pointerup", openEntry);
    title.setInteractive({ useHandCursor: true }).on("pointerup", openEntry);
    clipInputToViewport(frame, this.gridViewport);
    clipInputToViewport(title, this.gridViewport);
    bindButtonHover(frame, [title], () => {
      const position = this.pointerPosition(this.scene.input.activePointer);
      return !this.dragMoved && this.gridViewport.contains(position.x, position.y);
    });

    this.grid.add(container);
    this.tiles.push({ id, frame, y });
  }

  private selectEntry(entry: EncyclopediaEntry) {
    this.cancelLevelHolds.forEach(cancel => cancel());
    if (this.selectedEntryId !== this.entryId(entry)) this.previewLevel = 1;
    this.selectedEntryId = this.entryId(entry);
    this.selectionMemory.set(this.listKey(), this.selectedEntryId);
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
    this.levelControls.setVisible(false);
    this.selectedLabel.setText("");
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
    this.selectedLabel.setText(entry.title);
    this.levelControls.setVisible(!!entry.card || !!entry.enemyKind || !!entry.icon);
    this.previewCaption.setText(entry.icon === "icosahedron" ? isZhLabel("预览阶段", "Preview phase") : isZhLabel("预览等级", "Preview level"));
    this.levelLabel.setText(`${entry.icon === "icosahedron" ? "P" : "Lv."} ${this.previewLevel}`);
    if (entry.enemyKind) entry = { ...entry, enemyKind: enemyKindAtRank(enemyFamily(entry.enemyKind), this.previewLevel) };
    let y = 18;
    this.addEntryIcon(this.detail, entry, 46, y + 34, 1.08);
    const title = this.scene.add
      .text(92, y, entry.title, {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "26px",
        fontStyle: "700",
        wordWrap: detailTextWrap(490)
      })
      .setOrigin(0, 0);
    this.detail.add(title);
    let headerHeight = Math.max(124, title.height + 54);
    if (entry.card) {
      this.detailText(94, y + title.height + 10, isZhLabel("等级面板 · 未计光环及临时增益", "Level stats · before auras and temporary buffs"), 14, uiTextColors.secondary, 490);
      headerHeight = Math.max(headerHeight, this.drawRange(entry, 602, y));
    } else if (entry.enemyKind || entry.icon) {
      this.detailText(94, y + title.height + 10, isZhLabel("基础面板 · 未计状态、光环及难度修正", "Base stats · before effects, auras and difficulty modifiers"), 14, uiTextColors.secondary, 490);
    }
    y += headerHeight;
    if (!entry.mechanicId) y += this.drawDetailTable(entry, y) + 24;
    if (entry.card) {
      for (const section of towerDetailSections(entry.card, this.previewLevel, entry.description)) y = this.drawSection(section, y);
      y = this.drawSection({ title: t("label.upgrade"), tag: isZhLabel("成长规则", "Progression"), tone: "passive", fields: [], description: towerUpgradeText(entry.card.id) }, y);
    } else if (entry.enemyKind) {
      for (const section of enemyDetailSections(entry.enemyKind, entry.description)) y = this.drawSection(section, y);
    } else if (entry.icon) {
      for (const section of bossDetailSections(entry.icon, this.previewLevel)) y = this.drawSection(section, y);
    } else {
      const notes = this.detailNotes(entry);
      if (notes.length) y = this.drawSection({ title: isZhLabel("等级与机制", "Ranks & mechanics"), tag: "", tone: "passive", fields: [], description: notes.join("\n\n") }, y);
      y = this.drawSection({ title: isZhLabel("详细说明", "Description"), tag: "", tone: "passive", fields: [], description: entry.description }, y);
    }
    y = this.drawMechanicLinks(entry, y);

    this.detailContentHeight = y + 18;
    this.setDetailScroll(0);
  }

  private drawDetailTable(entry: EncyclopediaEntry, y: number) {
    const rows = this.detailTableRows(entry);
    const x = 18;
    const width = this.detailViewport.width - 36;
    const columns = 5, cellWidth = width / columns, cellHeight = 64;
    const height = Math.ceil(rows.length / columns) * cellHeight;
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(1, palette.dim, 0.7);
    for (let index = 0; index <= 2; index++) graphics.lineBetween(x, y + index * cellHeight, x + width, y + index * cellHeight);
    for (let index = 1; index < columns; index++) graphics.lineBetween(x + index * cellWidth, y, x + index * cellWidth, y + height);
    this.detail.add(graphics);
    rows.forEach((row, index) => {
      const left = x + index % columns * cellWidth + 12, top = y + Math.floor(index / columns) * cellHeight;
      this.detailText(left, top + 8, row.label, 13, uiTextColors.secondary, cellWidth - 24);
      this.detailText(left, top + 29, row.value, 19, uiTextColors.primary, cellWidth - 24);
    });
    return height;
  }

  private detailText(x: number, y: number, text: string, size = 16, color: string = uiTextColors.body, width = this.detailViewport.width - x - 18) {
    const label = this.scene.add.text(x, y, text, { fontFamily: "monospace", fontSize: `${size}px`, color,
      lineSpacing: 6, wordWrap: detailTextWrap(width) }).setOrigin(0);
    this.detail.add(label);
    return label;
  }

  private drawSection(section: DetailSection, y: number) {
    const colors = { attack: "#9cdfff", skill: "#ffe49a", aura: "#99e8ac", passive: uiTextColors.primary };
    const color = colors[section.tone];
    const heading = this.detailText(18, y, section.title, 19, color, 440);
    const tag = this.detailText(486, y + 3, section.tag, 14, color, this.detailViewport.width - 504);
    y += Math.max(heading.height, tag.height) + 14;
    const divider = this.scene.add.graphics().lineStyle(1, palette.dim, .8);
    divider.lineBetween(18, y, this.detailViewport.width - 18, y); this.detail.add(divider);
    y += 12;
    const diagramColor = section.tone === "aura" ? 0x99e8ac : section.tone === "skill" ? 0xffe49a : 0x9cdfff;
    const ranges = section.ranges ?? [];
    const rangeWidth = (this.detailViewport.width - 54) / 2;
    for (let index = 0; index < ranges.length; index += 2) {
      let rowHeight = 0;
      for (let col = 0; col < 2 && ranges[index + col]; col++) {
        const range = ranges[index + col], x = 18 + col * (rangeWidth + 18);
        const spatial = range.shape.kind !== "nonSpatial";
        if (spatial) drawRangeDiagram(this.scene, this.detail, range, x, y, 152, 112, diagramColor);
        const textX = x + (spatial ? 164 : 0), textWidth = rangeWidth - (spatial ? 164 : 0);
        const caption = this.detailText(textX, y + 10, range.caption, 13, uiTextColors.secondary, textWidth);
        const label = this.detailText(textX, y + 34, range.labelText, 14, color, textWidth);
        const origin = spatial ? this.detailText(textX, y + 40 + label.height,
          range.origin === "impact" ? isZhLabel("中心：命中点", "Center: impact") : isZhLabel("基准：自身", "Origin: self"), 12, uiTextColors.secondary, textWidth) : undefined;
        rowHeight = Math.max(rowHeight, 112, caption.height + 20, 48 + label.height + (origin?.height ?? 0));
      }
      y += rowHeight + 12;
    }
    y = this.drawFields(section.fields, y);
    if (section.description) {
      const text = this.detailText(18, y, section.description);
      y += text.height + 14;
    }
    return y + 20;
  }

  private drawFields(fields: DetailField[], y: number) {
    const width = (this.detailViewport.width - 54) / 2;
    for (let i = 0; i < fields.length; i += 2) {
      let height = 0;
      for (let col = 0; col < 2 && fields[i + col]; col++) {
        const field = fields[i + col], x = 18 + col * (width + 18);
        const label = this.detailText(x, y, field.label, 13, uiTextColors.secondary, width);
        const value = this.detailText(x, y + label.height + 4, field.value, 16, uiTextColors.primary, width);
        height = Math.max(height, label.height + 4 + value.height);
      }
      y += height + 16;
    }
    return y;
  }

  private drawRange(entry: EncyclopediaEntry, x: number, y: number) {
    const range = entry.card && towerDetailRange(entry.card);
    if (!range) return 0;
    drawRangeDiagram(this.scene, this.detail, range, x, y, 280, 84);
    const label = this.detailText(x, y + 88, range.labelText, 13, "#9cdfff", 280);
    return 104 + label.height;
  }

  private changePreviewLevel(delta: number) {
    const entry = this.currentEntries().find(entry => this.entryId(entry) === this.selectedEntryId);
    if (!entry || entry.mechanicId) return;
    const max = entry.icon ? bossPreviewLimit(entry.icon) : entry.enemyKind && enemyFamily(entry.enemyKind) === "solarBomb" ? 1 : 999;
    const level = Phaser.Math.Clamp(this.previewLevel + delta, 1, max);
    if (level === this.previewLevel) return;
    this.previewLevel = level;
    const scroll = this.detailScrollY;
    this.drawDetail(entry); this.setDetailScroll(scroll);
  }

  private listKey() { return `${this.tab}:${this.tab === "towers" ? this.cardCase : this.enemyGroupId}`; }

  private updateScrollbars() {
    if (!this.scrollbars) return;
    this.scrollbars.clear();
    for (const area of ["grid", "detail"] as const) {
      const rect = area === "grid" ? this.gridViewport : this.detailViewport;
      const { maxScroll, thumb, thumbSize } = this.scrollbarGeometry(area);
      if (maxScroll <= 0) continue;
      this.scrollbars.fillStyle(palette.dim, .5).fillRect(rect.right + 6, rect.y, 3, rect.height);
      this.scrollbars.fillStyle(0x9cdfff, .9).fillRect(rect.right + 5, thumb - thumbSize / 2, 5, thumbSize);
    }
  }

  private scrollbarGeometry(area: DragArea) {
    const rect = area === "grid" ? this.gridViewport : this.detailViewport;
    const content = area === "grid" ? this.gridContentHeight : this.detailContentHeight;
    const scroll = area === "grid" ? this.gridScrollY : this.detailScrollY;
    const maxScroll = Math.max(0, content - rect.height);
    const thumbSize = Math.min(rect.height, Math.max(26, rect.height * rect.height / Math.max(1, content)));
    const start = rect.y + thumbSize / 2, end = rect.bottom - thumbSize / 2;
    return { start, end, thumbSize, maxScroll, thumb: start + (end - start) * (maxScroll > 0 ? scroll / maxScroll : 0) };
  }

  private drawMechanicLinks(entry: EncyclopediaEntry, y: number) {
    const links = mechanicLinksForEntry(entry);
    if (links.length === 0) {
      return y;
    }

    const heading = this.scene.add
      .text(18, y, t("encyclopedia.relatedMechanics"), {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "16px",
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
          color: uiTextColors.primary,
          fontFamily: "monospace",
          fontSize: "16px",
          fontStyle: "700"
        })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      if (x + link.width > this.detailViewport.width - 18 && x > 18) { x = 18; rowY += 32; link.setPosition(x, rowY); }
      const underline = this.scene.add.graphics();
      underline.lineStyle(1, palette.white, 0.92);
      underline.lineBetween(x, rowY + link.height + 1, x + link.width, rowY + link.height + 1);
      link.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        const position = this.pointerPosition(pointer);
        if (!this.dragMoved && !this.timeIsSuppressingClick() && this.detailViewport.contains(position.x, position.y)) {
          playUiClick();
          this.openMechanic(mechanicId);
        }
      });
      link.on("pointerover", () => link.setColor("#48ff88"));
      link.on("pointerout", () => link.setColor(uiTextColors.primary));
      clipInputToViewport(link, this.detailViewport);
      this.detail.add([link, underline]);
      x += link.width + 18;
      if (x > this.detailViewport.width - 88) {
        x = 18;
        rowY += 32;
      }
    }
    return rowY + 30;
  }

  private openMechanic(mechanicId: EncyclopediaMechanicId) {
    this.tab = "mechanics";
    this.updateTabs();
    this.updateCardCaseButtons();
    this.updateEnemyGroupButtons();
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
        .text(x, y - 2 + (entry.card.id === "*" ? 7 * scale : 0), entry.card.id, {
          color: uiTextColors.primary,
          fontFamily: "monospace",
          fontSize: `${Math.round(30 * scale)}px`,
          fontStyle: "700"
        })
        .setOrigin(0.5);
      if (isTowerShellType(entry.card.id)) { drawTowerShellBorder(border, palette.white, 3, 0, entry.card.id); border.setScale(25 * scale / 34); label.setVisible(false); }
      parent.add([border, label]);
      return;
    }

    const iconText = this.scene.add
      .text(x, y - 2, entry.mechanicIcon ?? "?", {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: `${Math.round(25 * scale)}px`,
        fontStyle: "700"
      })
      .setOrigin(0.5);
    parent.add(iconText);
  }

  private createBossIcon(icon: NonNullable<EncyclopediaEntry["icon"]>) {
    if (icon === "del") return createDelIcon(this.scene);
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
      const stats = towerPreviewStats(card, this.previewLevel);
      return [
        row(t("label.hp"), card.category === "special" ? EMPTY_TABLE_VALUE : this.statValue(stats.maxHp, "hp")),
        row(t("label.armor"), card.category === "special" ? EMPTY_TABLE_VALUE : this.statValue(card.armor ?? 0, "armor")),
        row(t("label.mr"), card.category === "special" ? EMPTY_TABLE_VALUE : this.statValue(card.magicResistance ?? 0, "mr")),
        row(t("label.atk"), card.category === "special" ? EMPTY_TABLE_VALUE : this.damageValue(stats.attackPower, card.damageType)),
        row(isZhLabel("攻速", "AS"), this.statValue(card.attackSpeed, "attackSpeed")),
        row(t("label.speed"), EMPTY_TABLE_VALUE),
        row(isZhLabel("范围", "RANGE"), this.statValue(card.rangeCells, "range")),
        row(t("label.cost"), card.id === "?" ? isZhLabel("同目标", "As target") : this.statValue(card.cost, "cost")),
        row(t("label.cd"), card.id === "?" ? isZhLabel("目标 ×2", "Target x2") : this.cooldownValue(card.cooldown)),
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
        row(t("label.atk"), this.damageValue(enemy.attackPower, enemy.damageType)),
        row(isZhLabel("攻速", "AS"), this.statValue(enemyPreviewAttackSpeed(entry.enemyKind), "attackSpeed")),
        row(t("label.speed"), this.statValue(speed, "moveSpeed")),
        row(isZhLabel("范围", "RANGE"), EMPTY_TABLE_VALUE),
        row(t("label.cost"), EMPTY_TABLE_VALUE),
        row(t("label.cd"), EMPTY_TABLE_VALUE),
        row(t("label.weight"), this.statValue(enemy.weight, "weight"))
      ];
    }

    const bossStats = entry.icon ? bossPreviewStats(entry.icon, this.previewLevel) : null;
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
      return visibleEncyclopediaEntries(enemyEncyclopediaEntries())
        .filter(entry => enemyEncyclopediaGroup(entry) === this.enemyGroupId);
    }

    if (this.tab === "mechanics") {
      return mechanicEncyclopediaEntries();
    }

    return visibleEncyclopediaEntries(towerEncyclopediaEntries())
      .filter((entry) => entry.card && cardLetterCase(entry.card.id) === this.cardCase);
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
    return entry.title.replace(/(?:领袖)?系列$/, "").replace(/\s*Series$/i, "").replace(/\s*Leader$/i, "");
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

    const position = this.pointerPosition(pointer);
    const area = this.gridViewport.contains(position.x, position.y)
      ? "grid"
      : this.detailViewport.contains(position.x, position.y)
        ? "detail"
        : null;
    if (!area) {
      return;
    }

    this.dragPointer = pointer;
    this.dragArea = area;
    this.dragStartY = position.y;
    this.dragStartScrollY = area === "grid" ? this.gridScrollY : this.detailScrollY;
    this.dragMoved = false;
  }

  private updateDrag(pointer: Phaser.Input.Pointer) {
    if (this.dragPointer !== pointer || !pointer.isDown || !this.dragArea) {
      return;
    }

    const delta = this.pointerPosition(pointer).y - this.dragStartY;
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

  private pointerPosition(pointer: Phaser.Input.Pointer) {
    return this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private setGridScroll(scrollY: number) {
    const maxScroll = Math.max(0, this.gridContentHeight - this.gridViewport.height);
    this.gridScrollY = Math.round(Phaser.Math.Clamp(scrollY, 0, maxScroll));
    this.grid.y = this.gridViewport.y - this.gridScrollY;
    this.scrollMemory.set(this.listKey(), this.gridScrollY);
    this.updateScrollbars();
  }

  private setDetailScroll(scrollY: number) {
    const maxScroll = Math.max(0, this.detailContentHeight - this.detailViewport.height);
    this.detailScrollY = Math.round(Phaser.Math.Clamp(scrollY, 0, maxScroll));
    this.detail.y = this.detailViewport.y - this.detailScrollY;
    this.updateScrollbars();
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

function isZhLabel(zh: string, en: string) {
  return getLanguage() === "zh-CN" ? zh : en;
}
