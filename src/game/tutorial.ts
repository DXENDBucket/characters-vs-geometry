import Phaser from "phaser";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  CELL_HEIGHT,
  CELL_WIDTH,
  palette
} from "../config";
import { t } from "../i18n";
import type { CardId, CardView, Enemy, EnemyKind, LevelConfig, Tower } from "../types";

const PANEL_X = 18;
const PANEL_Y = 350;
const PANEL_WIDTH = 200;
const PANEL_HEIGHT = 374;

export interface TutorialEnemySpawn {
  kind: EnemyKind;
  lane: number;
  x?: number;
}

export type TutorialToolId =
  | "erase"
  | "autoUpgrade"
  | "autoUpgradeEnabled"
  | "autoUpgradeReserve"
  | "shifter";

export interface TutorialToolState {
  eraserMode: boolean;
  autoUpgradeMode: boolean;
  autoUpgradeEnabled: boolean;
  shifterMode: boolean;
  shifterReadyRatio: number;
  shifterSelection: Tower[];
}

export interface TutorialRuntime {
  registerAdvance?: (action: () => void) => () => void;
  scene: Phaser.Scene;
  getCardView: (id: CardId) => CardView | undefined;
  getTowers: () => Tower[];
  getEnemies: () => Enemy[];
  getBattleTime: () => number;
  getToolBounds: (id: TutorialToolId) => Phaser.Geom.Rectangle;
  getToolState: () => TutorialToolState;
  spawnWave: (spawns: TutorialEnemySpawn[]) => void;
  finish: () => void;
}

export interface TutorialController {
  usesWaveSchedule?: boolean;
  usesToolInteraction?: boolean;
  update: () => void;
  destroy: () => void;
}

export function isTutorialMechanic(mechanic: LevelConfig["specialMechanic"]) {
  return mechanic === "tutorialBasics" ||
    mechanic === "tutorialPractice" ||
    mechanic === "tutorialTowerTypes" ||
    mechanic === "tutorialAutoUpgrade" ||
    mechanic === "tutorialShifter" ||
    mechanic === "tutorialDamage";
}

export interface GuidedTutorialCopy {
  lesson: number;
  titleKey: string;
  bodyKey: string;
  buttonKey?: string;
}

export class GuidedTutorialView {
  private readonly panel: Phaser.GameObjects.Container;
  private readonly progressText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly button: Phaser.GameObjects.Rectangle;
  private readonly buttonText: Phaser.GameObjects.Text;
  private readonly highlights: Phaser.GameObjects.Graphics;

  constructor(
    private readonly runtime: TutorialRuntime,
    private readonly totalLessons: number,
    private readonly progressKey: string,
    onAdvance: () => void
  ) {
    const scene = runtime.scene;
    const plate = scene.add
      .rectangle(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, palette.black, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(2, palette.mid, 0.92);
    this.progressText = scene.add.text(PANEL_X + 12, PANEL_Y + 14, "", {
      color: "#8c8c8c",
      fontFamily: "monospace",
      fontSize: "12px",
      fontStyle: "700"
    });
    this.titleText = scene.add.text(PANEL_X + 12, PANEL_Y + 43, "", {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "19px",
      fontStyle: "700"
    });
    const divider = scene.add.rectangle(PANEL_X + 12, PANEL_Y + 76, PANEL_WIDTH - 24, 1, palette.dim, 1).setOrigin(0, 0.5);
    this.bodyText = scene.add.text(PANEL_X + 12, PANEL_Y + 94, "", {
      color: "#d8d8d8",
      fontFamily: "monospace",
      fontSize: "14px",
      lineSpacing: 6,
      wordWrap: { width: PANEL_WIDTH - 24, useAdvancedWrap: true }
    });
    this.button = scene.add
      .rectangle(PANEL_X + PANEL_WIDTH / 2, PANEL_Y + PANEL_HEIGHT - 31, PANEL_WIDTH - 24, 38, palette.panel, 1)
      .setStrokeStyle(2, palette.white, 0.92)
      .setInteractive({ useHandCursor: true });
    this.buttonText = scene.add
      .text(PANEL_X + PANEL_WIDTH / 2, PANEL_Y + PANEL_HEIGHT - 33, "", {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "700"
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.panel = scene.add.container(0, 0, [
      plate,
      this.progressText,
      this.titleText,
      divider,
      this.bodyText,
      this.button,
      this.buttonText
    ]);
    this.panel.setDepth(170);
    this.highlights = scene.add.graphics().setDepth(165);
    const advance = runtime.registerAdvance?.(onAdvance) ?? onAdvance;
    this.button.on("pointerdown", advance);
    this.buttonText.on("pointerdown", advance);
  }

  setCopy(copy: GuidedTutorialCopy) {
    this.progressText.setText(t(this.progressKey, { current: copy.lesson, total: this.totalLessons }));
    this.titleText.setFontSize(19).setText(t(copy.titleKey));
    if (this.titleText.width > PANEL_WIDTH - 24) {
      this.titleText.setFontSize(16);
    }

    this.bodyText.setFontSize(14).setText(t(copy.bodyKey));
    if (this.bodyText.height > PANEL_HEIGHT - 150) {
      this.bodyText.setFontSize(12);
    }

    const buttonVisible = Boolean(copy.buttonKey);
    this.button.setVisible(buttonVisible);
    this.buttonText.setVisible(buttonVisible).setText(copy.buttonKey ? t(copy.buttonKey) : "");
    if (buttonVisible) {
      this.button.setInteractive({ useHandCursor: true });
      this.buttonText.setInteractive({ useHandCursor: true });
    } else {
      this.button.disableInteractive();
      this.buttonText.disableInteractive();
    }
  }

  beginHighlights() {
    const alpha = 0.6 + (Math.sin(this.runtime.scene.time.now / 150) + 1) * 0.17;
    this.highlights.clear();
    this.highlights.lineStyle(3, palette.gold, alpha);
    return alpha;
  }

  drawCardHighlight(id: CardId, alpha: number) {
    const card = this.runtime.getCardView(id);
    if (!card) {
      return;
    }
    const bounds = card.frame.getBounds();
    this.highlights.lineStyle(3, palette.gold, alpha);
    this.highlights.strokeRect(bounds.x - 5, bounds.y - 4, bounds.width + 10, bounds.height + 8);
  }

  drawCellHighlight(lane: number, column: number, alpha: number) {
    const x = BOARD_X + column * CELL_WIDTH;
    const y = BOARD_Y + lane * CELL_HEIGHT;
    this.highlights.fillStyle(palette.gold, 0.07 + alpha * 0.04);
    this.highlights.fillRect(x + 4, y + 4, CELL_WIDTH - 8, CELL_HEIGHT - 8);
    this.highlights.lineStyle(3, palette.gold, alpha);
    this.highlights.strokeRect(x + 4, y + 4, CELL_WIDTH - 8, CELL_HEIGHT - 8);
  }

  drawToolHighlight(id: TutorialToolId, alpha: number) {
    const bounds = this.runtime.getToolBounds(id);
    this.highlights.lineStyle(3, palette.gold, alpha);
    this.highlights.strokeRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10);
  }

  drawEnemyHighlights(alpha: number) {
    this.highlights.lineStyle(3, palette.gold, alpha);
    for (const enemy of this.runtime.getEnemies()) {
      this.highlights.strokeCircle(enemy.x, enemy.y, 32);
    }
  }

  drawLaneDirectionGuide(lane: number, alpha: number) {
    const centerY = BOARD_Y + (lane + 0.5) * CELL_HEIGHT;
    const startX = BOARD_X + BOARD_WIDTH - 18;
    const endX = BOARD_X + 24;
    this.highlights.lineStyle(3, palette.gold, alpha);
    this.highlights.lineBetween(startX, centerY, endX, centerY);
    this.highlights.fillStyle(palette.gold, alpha);
    this.highlights.fillTriangle(endX, centerY, endX + 18, centerY - 10, endX + 18, centerY + 10);
    this.highlights.lineStyle(4, palette.white, alpha);
    this.highlights.lineBetween(BOARD_X - 20, BOARD_Y, BOARD_X - 20, BOARD_Y + BOARD_HEIGHT);
  }

  destroy() {
    this.highlights.destroy();
    this.panel.destroy(true);
  }
}
