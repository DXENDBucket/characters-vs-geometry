import Phaser from "phaser";
import { playUiClick } from "../audio/player";
import { bindButtonHover } from "../render/buttonHover";
import { createPageHeading } from "../render/pageHeader";
import { enemyArchetypes } from "../data/enemyArchetypes";
import {
  CARD_SLOT_COUNT,
  CUBE_BOSS_STATS,
  DEFAULT_DIFFICULTY,
  GAME_HEIGHT,
  GAME_WIDTH,
  clampDifficulty,
  palette,
  uiTextColors
} from "../config";
import { bossRank, isDodecahedronBossKind, isIcosahedronBossKind, isOctahedronBossKind, isSmallStellatedDodecahedronBossKind, isTetrahedronBossKind } from "../game/bossRules";
import { cardSlotUnlockChapter } from "../data/cardSlotUnlocks";
import { chapterIdForLevelId } from "../data/chapters";
import { getLevelConfig, levelPreviewEnemyKinds } from "../data/levels";
import { toRomanNumeral } from "../format";
import { DAMAGE_SYMBOLS, getLanguage, t } from "../i18n";
import { isImitatorCard, uniqueLoadout } from "../game/cardIdentity";
import { isLoadoutCardId } from "../game/cardEligibility";
import { clipInputToViewport } from "../render/viewportInput";
import { isCardUnlocked, unlockedCardSlotCount } from "../progress";
import { createEnemyShape, createUnitBorder } from "../render/unitShapes";
import { drawTowerShellBorder } from "../render/parenthesisTower";
import { isTowerShellType } from "../game/towerOccupancy";
import { EncyclopediaPanel } from "../render/encyclopediaPanel";
import { allCardDefinitions, canImitateCard, cardLetterCase, getCardDefinition, type CardLetterCase } from "../registry/cards";
import { enemyFamily, enemyRank, getEnemyDefinition, getEnemyDisplayName, type EnemyFamily } from "../registry/enemies";
import type { BossKind, CardId, EnemyKind } from "../types";

const LOADOUT_STORAGE_KEY = "characters-vs-geometry:last-card-loadout";

interface CardPoolCaseButton {
  letterCase: CardLetterCase;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface EnemyPreviewGroup {
  family: EnemyFamily;
  primaryKind: EnemyKind;
  kinds: EnemyKind[];
}

interface EnemyPreviewLink {
  top: number;
  bottom: number;
  enemyKind?: EnemyKind;
  bossKind?: BossKind;
}

interface CardSelectSceneData {
  mapOffset?: { x: number; y: number };
  levelId?: string;
  chapterId?: string;
  difficulty?: number;
  unlimitedFirepower?: boolean;
  reselect?: {
    selectedCards: CardId[];
    onConfirm: (cards: CardId[]) => void;
    onCancel: () => void;
  };
}

export class CardSelectScene extends Phaser.Scene {
  private levelSelectMapOffset?: { x: number; y: number };
  private reselect?: CardSelectSceneData["reselect"];
  private selectionFinished = false;
  private levelId = "1-1";
  private chapterId = "1";
  private difficulty = DEFAULT_DIFFICULTY;
  private unlimitedFirepower = false;
  private selectedCards: CardId[] = [];
  private choosingImitation = false;
  private imitationHint!: Phaser.GameObjects.Text;
  private imitationCancel!: Phaser.GameObjects.Text;
  private cardSlotCount = 0;
  private enemyPreviewList!: Phaser.GameObjects.Container;
  private enemyPreviewViewport!: Phaser.Geom.Rectangle;
  private enemyPreviewContentHeight = 0;
  private enemyPreviewScrollY = 0;
  private enemyPreviewDragPointer: Phaser.Input.Pointer | null = null;
  private enemyPreviewDragStartY = 0;
  private enemyPreviewDragStartScrollY = 0;
  private enemyPreviewDragStartX = 0;
  private enemyPreviewDragMoved = false;
  private enemyPreviewPressedLink?: EnemyPreviewLink;
  private enemyPreviewLinks: EnemyPreviewLink[] = [];
  private previewHint!: Phaser.GameObjects.Text;
  private encyclopedia!: EncyclopediaPanel;
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
  private clearButton!: Phaser.GameObjects.Rectangle;
  private clearText!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Rectangle;
  private startText!: Phaser.GameObjects.Text;

  constructor() {
    super("CardSelectScene");
  }

  init(data: CardSelectSceneData) {
    this.levelSelectMapOffset = data.mapOffset;
    this.reselect = data.reselect;
    this.selectionFinished = false;
    this.choosingImitation = false;
    this.levelId = data.levelId ?? "1-1";
    this.chapterId = data.chapterId ?? chapterIdForLevelId(this.levelId);
    this.difficulty = clampDifficulty(data.difficulty);
    this.unlimitedFirepower = Boolean(data.unlimitedFirepower);
    this.cardSlotCount = unlockedCardSlotCount();
    this.selectedCards = this.reselect ? [...this.reselect.selectedCards] : readStoredLoadout(this.cardSlotCount);
    this.slotFrames = [];
    this.slotLabels = [];
    this.cardFrames = new Map();
    this.enemyPreviewScrollY = 0;
    this.enemyPreviewDragPointer = null;
    this.enemyPreviewLinks = [];
    this.enemyPreviewDragMoved = false;
    this.enemyPreviewPressedLink = undefined;
    this.cardPoolScrollY = 0;
    this.cardPoolDragPointer = null;
    this.cardPoolDragMoved = false;
    this.suppressCardClickUntil = 0;
    this.cardPoolCase = "uppercase";
    this.cardPoolCaseButtons = [];
  }

  create() {
    if (this.reselect) {
      this.scene.bringToTop();
      this.cameras.main.setBackgroundColor("rgba(0,0,0,0)").setZoom(0.88);
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 20, GAME_HEIGHT - 20, palette.black, 0.97)
        .setStrokeStyle(2, palette.mid, 1).setInteractive();
    } else {
      this.cameras.main.setBackgroundColor(palette.black).setZoom(1);
    }
    this.drawBackdrop();
    this.drawEnemyPreview();
    this.createSlots();
    this.createCardPool();
    this.createStartButton();
    this.updateCardSelection();
    this.encyclopedia = new EncyclopediaPanel(this);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat) return;
      event.preventDefault();
      if (this.encyclopedia.isOpen()) this.encyclopedia.close();
      else if (this.choosingImitation) this.setImitationPicker(false);
      else if (this.reselect) this.backToLevelSelect();
    };
    this.input.keyboard?.on("keydown", onKey);
    this.events.once("shutdown", () => this.input.keyboard?.off("keydown", onKey));
  }

  private drawBackdrop() {
    createPageHeading(this, `${t("operation.level", { level: this.levelId, difficulty: this.difficulty })}${this.unlimitedFirepower ? `  ${t("label.unlimitedFirepower")}` : ""}`, `${t("label.loadout")} ${this.cardSlotCount}/${CARD_SLOT_COUNT}`);

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
        color: uiTextColors.primary,
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
          color: uiTextColors.secondary,
          fontFamily: "monospace",
          fontSize: "14px"
        })
        .setOrigin(0, 0);
      this.enemyPreviewList.add(bossText);
      this.enemyPreviewLinks.push({ top: contentY - 8, bottom: contentY + 20, bossKind: levelConfig.bossKind });
      contentY += 50;
    }

    const environmentDescriptions = (levelConfig.extraWaveSpawns ?? []).map(spawn => t(
      spawn.lane === undefined ? "label.extraWaveSpawnRandom" : "label.extraWaveSpawn", {
      enemy: getEnemyDisplayName(spawn.kind), lane: (spawn.lane ?? 0) + 1
    }));
    if (levelConfig.specialMechanic === "rightColumnSeal") environmentDescriptions.push(t("label.rightColumnSeal"));
    if (levelConfig.periodicTowerNullification) environmentDescriptions.push(t("label.periodicTowerNullification", {
      interval: levelConfig.periodicTowerNullification.intervalMs / 1000,
      duration: levelConfig.periodicTowerNullification.durationMs / 1000
    }));
    for (const text of environmentDescriptions) {
      const description = this.add.text(0, contentY - 16, text, {
        color: "#9fdcff", fontFamily: "monospace", fontSize: "14px"
      }).setName("level-environment-description");
      if (description.width > viewportWidth - 12) description.setFontSize(Math.floor(14 * (viewportWidth - 12) / description.width));
      this.enemyPreviewList.add(description);
      contentY += description.height + 32;
    }
    const enemyGroups = this.enemyPreviewGroups(levelPreviewEnemyKinds(levelConfig));
    enemyGroups.forEach((group, index) => {
      const y = contentY + index * rowSpacing;
      this.drawEnemyPreviewRow(group, this.enemyPreviewList, y);
      this.enemyPreviewLinks.push({ top: y - 28, bottom: y + 46, enemyKind: group.primaryKind });
    });
    this.enemyPreviewContentHeight = contentY + enemyGroups.length * rowSpacing + 20;
    this.previewHint = this.add.text(0, 0, t("encyclopedia.previewHint"), {
      fontFamily: "monospace", fontSize: "15px", color: "#48ff88",
      backgroundColor: "#191919", padding: { x: 10, y: 7 }
    }).setDepth(250).setVisible(false);
    this.createEnemyPreviewScrollControls();
    this.setEnemyPreviewScroll(0);
  }

  private enemyPreviewGroups(kinds: EnemyKind[]) {
    const groups: EnemyPreviewGroup[] = [];
    const byFamily = new Map<EnemyFamily, EnemyPreviewGroup>();

    for (const kind of kinds) {
      const family = enemyFamily(kind);
      const existing = byFamily.get(family);
      if (existing) {
        if (!existing.kinds.includes(kind)) {
          existing.kinds.push(kind);
        }
        if (enemyRank(kind) < enemyRank(existing.primaryKind)) {
          existing.primaryKind = kind;
        }
      } else {
        const group = { family, primaryKind: kind, kinds: [kind] };
        byFamily.set(family, group);
        groups.push(group);
      }
    }

    return groups.map((group) => ({
      ...group,
      kinds: [...group.kinds].sort((a, b) => enemyRank(a) - enemyRank(b))
    }));
  }

  private createEnemyPreviewScrollControls() {
    const viewport = this.enemyPreviewViewport;
    const zone = this.add.zone(viewport.x, viewport.y, viewport.width, viewport.height).setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.encyclopedia.isOpen()) return;
      this.enemyPreviewDragPointer = pointer;
      this.enemyPreviewDragStartY = this.pointerPosition(pointer).y;
      this.enemyPreviewDragStartX = this.pointerPosition(pointer).x;
      this.enemyPreviewDragStartScrollY = this.enemyPreviewScrollY;
      this.enemyPreviewDragMoved = false;
      this.enemyPreviewPressedLink = this.previewLinkAt(pointer);
      this.previewHint.setVisible(false);
    });

    zone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const link = this.previewLinkAt(pointer);
      if (this.encyclopedia.isOpen() || this.enemyPreviewDragPointer !== pointer ||
          this.enemyPreviewDragMoved || !link || link !== this.enemyPreviewPressedLink) return;
      this.previewHint.setVisible(false);
      this.cardPoolDragPointer = null;
      if (link.enemyKind) this.encyclopedia.openEnemy(link.enemyKind);
      else if (link.bossKind) this.encyclopedia.openBoss(link.bossKind);
      playUiClick();
    });
    zone.on("pointerout", () => this.previewHint.setVisible(false));

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const position = this.pointerPosition(pointer);
      const hovering = !this.encyclopedia.isOpen() && !pointer.isDown && !!this.previewLinkAt(pointer);
      this.previewHint.setVisible(hovering);
      if (hovering) {
        this.previewHint.setPosition(
          Math.min(position.x + 12, GAME_WIDTH - this.previewHint.width - 12),
          Math.min(position.y + 22, GAME_HEIGHT - this.previewHint.height - 12)
        );
      }
      if (this.enemyPreviewDragPointer !== pointer || !pointer.isDown) {
        return;
      }

      if (Math.abs(position.y - this.enemyPreviewDragStartY) > 5 ||
          Math.abs(position.x - this.enemyPreviewDragStartX) > 5) this.enemyPreviewDragMoved = true;
      this.setEnemyPreviewScroll(this.enemyPreviewDragStartScrollY - (position.y - this.enemyPreviewDragStartY));
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.stopEnemyPreviewDrag(pointer));
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.stopEnemyPreviewDrag(pointer));
    this.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        const position = this.pointerPosition(pointer);
        if (this.encyclopedia.isOpen() || !this.enemyPreviewViewport.contains(position.x, position.y)) {
          return;
        }

        this.setEnemyPreviewScroll(this.enemyPreviewScrollY + deltaY);
      }
    );
  }

  private stopEnemyPreviewDrag(pointer: Phaser.Input.Pointer) {
    if (this.enemyPreviewDragPointer === pointer) {
      this.enemyPreviewDragPointer = null;
      this.enemyPreviewPressedLink = undefined;
    }
  }

  private previewLinkAt(pointer: Phaser.Input.Pointer) {
    const position = this.pointerPosition(pointer);
    if (!this.enemyPreviewViewport.contains(position.x, position.y)) return undefined;
    const y = position.y - this.enemyPreviewList.y;
    return this.enemyPreviewLinks.find((link) => y >= link.top && y < link.bottom);
  }

  private setEnemyPreviewScroll(scrollY: number) {
    this.previewHint.setVisible(false);
    const maxScroll = Math.max(0, this.enemyPreviewContentHeight - this.enemyPreviewViewport.height);
    this.enemyPreviewScrollY = Math.round(Phaser.Math.Clamp(scrollY, 0, maxScroll));
    this.enemyPreviewList.y = this.enemyPreviewViewport.y - this.enemyPreviewScrollY;
  }

  private drawEnemyPreviewRow(group: EnemyPreviewGroup, parent: Phaser.GameObjects.Container, y: number) {
    const definition = getEnemyDefinition(group.primaryKind);
    const shapeX = 34;
    const textX = 76;
    const shape = createEnemyShape(this, group.primaryKind).setPosition(shapeX, y);
    shape.setAlpha(0.92);
    const name = this.add
      .text(textX, y - 25, this.enemyPreviewGroupTitle(group), {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "700",
        wordWrap: { width: this.enemyPreviewViewport.width - textX - 4, useAdvancedWrap: true }
      })
      .setOrigin(0, 0);
    const stats = this.add
      .text(
        textX,
        y + (name.height > 24 ? 20 : 2),
        `${t("label.hp")} ${definition.hp}  ${t("label.atk")} ${definition.attackPower}${DAMAGE_SYMBOLS[definition.damageType]}  ${t("label.weight")} ${definition.weight}`,
        {
          color: uiTextColors.secondary,
          fontFamily: "monospace",
          fontSize: "14px"
        }
      )
      .setOrigin(0, 0);
    parent.add([shape, name, stats]);
  }

  private enemyPreviewGroupTitle(group: EnemyPreviewGroup) {
    if (getLevelConfig(this.levelId).unlimitedRankFamilies?.includes(group.family)) {
      const name = getEnemyDisplayName(group.primaryKind);
      const base = name.replace(/ \d+$/, "");
      const cap = enemyArchetypes[group.family].spawnRankCap;
      return `${base} ${cap ? Array.from({ length: cap }, (_, i) => i + 1).join("/") : "1/2/3/..."}`;
    }
    if (group.kinds.length === 1) {
      return getEnemyDisplayName(group.primaryKind);
    }

    const displayName = getEnemyDisplayName(group.primaryKind);
    const primaryRank = `${enemyRank(group.primaryKind)}`;
    const rankSuffix = ` ${primaryRank}`;
    if (!displayName.endsWith(rankSuffix)) {
      return group.kinds.map((kind) => getEnemyDisplayName(kind)).join("/");
    }

    const baseName = displayName.slice(0, -primaryRank.length).trimEnd();
    const ranks = group.kinds.map((kind) => enemyRank(kind)).join("/");
    return `${baseName} ${ranks}`;
  }

  private bossDisplayName(kind: BossKind) {
    if (kind === "del") return "DEL";
    if (isTetrahedronBossKind(kind)) {
      return `${t("enemy.bossTetrahedron")} ${toRomanNumeral(bossRank(kind))}`;
    }

    if (isDodecahedronBossKind(kind)) {
      return `${t("enemy.bossDodecahedron")} ${toRomanNumeral(bossRank(kind))}`;
    }

    if (isSmallStellatedDodecahedronBossKind(kind)) {
      return `${t("enemy.bossSmallStellatedDodecahedron")} ${toRomanNumeral(bossRank(kind))}`;
    }

    if (isOctahedronBossKind(kind)) {
      return `${t("enemy.bossOctahedron")} ${toRomanNumeral(bossRank(kind))}`;
    }

    if (isIcosahedronBossKind(kind)) {
      return `${t("enemy.bossIcosahedron")} ${toRomanNumeral(bossRank(kind))}`;
    }

    return `${t("enemy.bossCube")} ${toRomanNumeral(bossRank(kind))}`;
  }

  private createSlots() {
    const startX = 90;
    const slotGap = 82;
    const slotWidth = 76;
    const y = 180;
    for (let index = 0; index < CARD_SLOT_COUNT; index += 1) {
      const x = startX + index * slotGap;
      const locked = index >= this.cardSlotCount;
      const frame = this.add
        .rectangle(x, y, slotWidth, 70, palette.black, 1)
        .setStrokeStyle(2, palette.dim, locked ? 0.32 : 1);
      const label = this.add
        .text(x, y - (locked ? 9 : 3), locked ? "×" : "", {
          color: uiTextColors.primary,
          fontFamily: "monospace",
          fontSize: locked ? "23px" : "28px",
          fontStyle: "700"
        })
        .setOrigin(0.5)
        .setAlpha(locked ? 0.28 : 1);
      const unlockChapter = cardSlotUnlockChapter(index);
      if (locked && unlockChapter) {
        this.add
          .text(x, y + 22, t("card.slotUnlockAfter", { chapter: unlockChapter }), {
            color: uiTextColors.secondary,
            fontFamily: "monospace",
            fontSize: "10px",
            fontStyle: "700"
          })
          .setOrigin(0.5)
          .setAlpha(0.55);
      }
      this.slotFrames.push(frame);
      this.slotLabels.push(label);
      if (!locked) {
        frame.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
          if (this.encyclopedia.isOpen() || this.choosingImitation) return;
          const id = this.selectedCards[index];
          if (id) this.toggleCard(id);
        });
        bindButtonHover(frame, [label]);
      }
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
    this.imitationHint = this.add.text(viewportX + 176, viewportY - 26,
      getLanguage() === "zh-CN" ? "? · 选择常规塔" : "? · Choose a regular tower",
      { fontFamily: "monospace", fontSize: "17px", color: uiTextColors.primary }).setOrigin(0, .5).setVisible(false);
    this.imitationCancel = this.add.text(viewportX + viewportWidth - 28, viewportY - 26, "×",
      { fontFamily: "monospace", fontSize: "26px", color: uiTextColors.primary })
      .setOrigin(.5).setVisible(false).setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.setImitationPicker(false));

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
    const definitions = allCardDefinitions.filter((definition) =>
      isCardUnlocked(definition.id) && cardLetterCase(definition.id) === this.cardPoolCase &&
      (!this.choosingImitation || canImitateCard(definition))
    );
    definitions.forEach((definition, index) => {
      const x = 89 + (index % columns) * columnGap;
      const y = 48 + Math.floor(index / columns) * rowGap;
      const frame = this.add
        .rectangle(x, y, 178, 92, palette.black, 1)
        .setStrokeStyle(2, palette.dim, 1)
        .setInteractive({ useHandCursor: true });
      const border = createUnitBorder(this, definition.category, 22, 2).setPosition(x - 55, y - 6);
      const label = this.add
        .text(x - 55, y - (definition.id === "*" ? 2 : 9), definition.id, {
          color: uiTextColors.primary,
          fontFamily: "monospace",
          fontSize: "29px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      const costText = this.add
        .text(x - 10, y - 30, definition.id === "?" ? "/" : `${definition.cost}`, {
          color: uiTextColors.primary,
          fontFamily: "monospace",
          fontSize: "17px"
        })
        .setOrigin(0, 0);
      if (isTowerShellType(definition.id)) { drawTowerShellBorder(border, palette.white, 3, 0, definition.id); border.setScale(22 / 34); label.setVisible(false); }
      const statsText = this.add
        .text(x - 10, y - 5, definition.stats, {
          color: uiTextColors.secondary,
          fontFamily: "monospace",
          fontSize: "13px"
        })
        .setOrigin(0, 0);

      const cardObjects: Phaser.GameObjects.GameObject[] = [frame, border, label, costText, statsText];
      this.cardPoolList.add(cardObjects);

      frame.on("pointerup", (pointer: Phaser.Input.Pointer) => this.handleCardPointerUp(definition.id, pointer));
      clipInputToViewport(frame, this.cardPoolViewport);
      this.cardFrames.set(definition.id, frame);
      bindButtonHover(frame, [border, label], () => {
        const position = this.pointerPosition(this.input.activePointer);
        return !this.encyclopedia.isOpen() && this.cardPoolViewport.contains(position.x, position.y);
      });
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
      this.createCardPoolCaseButton("lowercase", x + 54, y, "a"),
      this.createCardPoolCaseButton("ascii", x + 108, y, "@")
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
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "17px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setCardPoolCase(letterCase));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setCardPoolCase(letterCase));
    bindButtonHover(frame, [label]);
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
      button.label.setAlpha(selected ? 1 : 0.78);
    }
  }

  private createCardPoolScrollControls() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const position = this.pointerPosition(pointer);
      if (this.encyclopedia.isOpen() || !this.cardPoolViewport.contains(position.x, position.y)) {
        return;
      }

      this.cardPoolDragPointer = pointer;
      this.cardPoolDragStartY = position.y;
      this.cardPoolDragStartScrollY = this.cardPoolScrollY;
      this.cardPoolDragMoved = false;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.cardPoolDragPointer !== pointer || !pointer.isDown) {
        return;
      }

      const deltaY = this.pointerPosition(pointer).y - this.cardPoolDragStartY;
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
        const position = this.pointerPosition(pointer);
        if (this.encyclopedia.isOpen() || !this.cardPoolViewport.contains(position.x, position.y)) {
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
    const position = this.pointerPosition(pointer);
    if (
      this.encyclopedia.isOpen() ||
      !isCardUnlocked(id) ||
      this.cardPoolDragMoved ||
      this.time.now < this.suppressCardClickUntil ||
      !this.cardPoolViewport.contains(position.x, position.y)
    ) {
      return;
    }

    this.toggleCard(id);
  }

  private pointerPosition(pointer: Phaser.Input.Pointer) {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private createStartButton() {
    const y = GAME_HEIGHT - 54;
    this.clearButton = this.add
      .rectangle(GAME_WIDTH - 514, y, 132, 46, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    this.clearText = this.add
      .text(GAME_WIDTH - 514, y - 2, t("button.clearLoadout"), {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    this.backButton = this.add
      .rectangle(GAME_WIDTH - 344, y, 132, 46, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    this.backText = this.add
      .text(GAME_WIDTH - 344, y - 2, t(this.reselect ? "button.cancel" : "button.back"), {
        color: uiTextColors.primary,
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
      .text(GAME_WIDTH - 164, y - 2, t(this.reselect ? "button.confirm" : "button.start"), {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: "20px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    this.clearButton.on("pointerdown", () => this.clearLoadout());
    this.clearText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.clearLoadout());
    this.backButton.on("pointerdown", () => this.backToLevelSelect());
    this.backText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.backToLevelSelect());
    this.startButton.on("pointerdown", () => this.startLevel());
    this.startText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.startLevel());
    bindButtonHover(this.backButton, [this.backText]);
    bindButtonHover(this.startButton, [this.startText], () => this.selectedCards.length > 0 && !this.choosingImitation);
    bindButtonHover(this.clearButton, [this.clearText], () => this.selectedCards.length > 0);
  }

  private toggleCard(id: CardId) {
    if (!isCardUnlocked(id)) {
      return;
    }

    if (this.choosingImitation) {
      if (!canImitateCard(getCardDefinition(id))) return;
      const index = this.selectedCards.findIndex(isImitatorCard);
      const variant: CardId = `?${id}`;
      if (index >= 0) this.selectedCards[index] = variant;
      else if (this.selectedCards.length < this.cardSlotCount) this.selectedCards.push(variant);
      else return;
      this.setImitationPicker(false);
    } else if (id === "?") {
      const index = this.selectedCards.findIndex(isImitatorCard);
      if (index >= 0) this.selectedCards.splice(index, 1);
      else {
        if (this.selectedCards.length < this.cardSlotCount) this.setImitationPicker(true);
        return;
      }
    } else {

      if (this.selectedCards.includes(id)) {
        this.selectedCards = this.selectedCards.filter((cardId) => cardId !== id);
      } else if (this.selectedCards.length < this.cardSlotCount) {
        this.selectedCards.push(id);
      }
    }
    if (!this.reselect) writeStoredLoadout(this.selectedCards);
    this.updateCardSelection();
  }

  private setImitationPicker(open: boolean) {
    this.choosingImitation = open;
    this.imitationHint.setVisible(open);
    this.imitationCancel.setVisible(open);
    this.cardPoolCase = open ? "uppercase" : "ascii";
    this.cardPoolDragPointer = null;
    this.cardPoolDragMoved = false;
    this.populateCardPool(4, 190, 112);
  }

  private clearLoadout() {
    if (this.choosingImitation) this.setImitationPicker(false);
    if (this.selectedCards.length === 0) {
      return;
    }

    this.selectedCards = [];
    if (!this.reselect) writeStoredLoadout(this.selectedCards);
    this.updateCardSelection();
  }

  private updateCardSelection() {
    this.slotFrames.forEach((slot, index) => {
      if (index >= this.cardSlotCount) {
        slot.setStrokeStyle(2, palette.dim, 0.32);
        this.slotLabels[index].setText("×");
        this.slotLabels[index].setAlpha(0.28);
        return;
      }
      const cardId = this.selectedCards[index];
      slot.setStrokeStyle(2, cardId ? palette.white : palette.dim, cardId ? 1 : 0.55);
      this.slotLabels[index].setText(cardId ?? "");
      this.slotLabels[index].setAlpha(cardId ? 1 : 0);
    });

    for (const [id, frame] of this.cardFrames) {
      const selected = this.choosingImitation ? this.selectedCards.includes(`?${id}`)
        : id === "?" ? this.selectedCards.some(isImitatorCard) : this.selectedCards.includes(id);
      const unlocked = isCardUnlocked(id);
      frame.setStrokeStyle(
        selected ? 3 : 2,
        selected ? palette.white : palette.dim,
        selected ? 1 : unlocked ? 0.6 : 0.32
      );
      frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.72);
      frame.setAlpha(unlocked ? (selected ? 1 : 0.56) : 0.24);
    }

    const enabled = this.selectedCards.length > 0;
    this.clearButton.setAlpha(enabled ? 1 : 0.34);
    this.clearText.setAlpha(enabled ? 1 : 0.28);
    this.startButton.setAlpha(enabled && !this.choosingImitation ? 1 : 0.34);
    this.startText.setAlpha(enabled && !this.choosingImitation ? 1 : 0.28);
  }

  private startLevel() {
    if (this.selectionFinished || this.choosingImitation || this.selectedCards.length === 0) {
      return;
    }
    this.selectionFinished = true;
    writeStoredLoadout(this.selectedCards);
    if (this.reselect) {
      const onConfirm = this.reselect.onConfirm;
      this.reselect = undefined;
      this.scene.stop();
      onConfirm([...this.selectedCards]);
      return;
    }
    this.scene.start("GameScene", {
      levelId: this.levelId,
      chapterId: this.chapterId,
      selectedCards: this.selectedCards,
      difficulty: this.difficulty,
      unlimitedFirepower: this.unlimitedFirepower
    });
  }

  private backToLevelSelect() {
    if (this.choosingImitation) { this.setImitationPicker(false); return; }
    if (this.selectionFinished) return;
    this.selectionFinished = true;
    if (this.reselect) {
      const onCancel = this.reselect.onCancel;
      this.reselect = undefined;
      this.scene.stop();
      onCancel();
      return;
    }
    this.scene.start("LevelSelectScene", {
      chapterId: this.chapterId,
      selectedLevelId: this.levelId,
      mapOffset: this.levelSelectMapOffset,
      difficulty: this.difficulty,
      unlimitedFirepower: this.unlimitedFirepower
    });
  }
}

function readStoredLoadout(cardSlotCount: number) {
  try {
    const raw = window.localStorage.getItem(LOADOUT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return uniqueLoadout(parsed.filter((id): id is CardId => isLoadoutCardId(id) && isCardUnlocked(id)), cardSlotCount);
  } catch {
    return [];
  }
}

function writeStoredLoadout(cards: CardId[]) {
  try {
    window.localStorage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(cards));
  } catch {
    // Storage failures must not prevent returning to a paused battle.
  }
}
