import type Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, palette } from "../config";
import { t } from "../i18n";
import type { CardId, CardView } from "../types";
import type { EnemyState } from "../game/enemyState";
import type { TutorialToolId } from "../game/tutorial";
import type { GuidedTutorialCopy, TutorialPresentation } from "../game/tutorialPresentation";
import { createCategoryLegend, drawDamageTutorial } from "./tutorialExtras";

const PANEL_X = 18;
const PANEL_Y = 350;
const PANEL_WIDTH = 200;
const PANEL_HEIGHT = 374;

export interface TutorialViewRuntime {
  scene: Phaser.Scene;
  getCardView(id: CardId): CardView | undefined;
  getEnemies(): EnemyState[];
  getToolBounds(id: TutorialToolId): Phaser.Geom.Rectangle;
}

export class GuidedTutorialView {
  private readonly panel: Phaser.GameObjects.Container;
  private readonly progressText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly button: Phaser.GameObjects.Rectangle;
  private readonly buttonText: Phaser.GameObjects.Text;
  private readonly highlights: Phaser.GameObjects.Graphics;

  private copyKey = "";
  private diagramKey = "";
  private categoryLegend?: Phaser.GameObjects.Container;
  private diagram?: Phaser.GameObjects.Container;
  private readonly placementHints = new Map<string, Phaser.GameObjects.Text>();

  constructor(private readonly runtime: TutorialViewRuntime, onAdvance: () => void) {
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
    this.button.on("pointerdown", onAdvance);
    this.buttonText.on("pointerdown", onAdvance);
  }

  sync(presentation: TutorialPresentation) {
    const key = JSON.stringify(presentation.copy);
    if (key !== this.copyKey) {
      this.copyKey = key;
      this.setCopy(presentation.copy, presentation.totalLessons, presentation.progressKey);
    }
    if (presentation.showCategories && !this.categoryLegend) this.categoryLegend = createCategoryLegend(this.runtime.scene);
    this.categoryLegend?.setVisible(presentation.showCategories);
    if (presentation.damage) {
      this.diagram ??= this.runtime.scene.add.container(0, 0).setDepth(160);
      const key = JSON.stringify(presentation.damage);
      if (key !== this.diagramKey) {
        this.diagramKey = key;
        drawDamageTutorial(this.runtime.scene, this.diagram, presentation.damage.index, presentation.damage.fired);
      }
    }
    const alpha = this.beginHighlights();
    for (const label of this.placementHints.values()) label.setVisible(false);
    for (const hint of presentation.highlights) {
      switch (hint.type) {
        case "card": this.drawCardHighlight(hint.id, alpha); break;
        case "cell": this.drawCellHighlight(hint.lane, hint.column, alpha); break;
        case "tool": this.drawToolHighlight(hint.id, alpha); break;
        case "enemies": this.drawEnemyHighlights(alpha); break;
        case "direction": this.drawLaneDirectionGuide(hint.lane, alpha); break;
        case "placement": {
          const key = `${hint.id}:${hint.lane}:${hint.column}`;
          let label = this.placementHints.get(key);
          if (!label) {
            label = this.runtime.scene.add.text(BOARD_X + (hint.column + .5) * CELL_WIDTH,
              BOARD_Y + (hint.lane + .5) * CELL_HEIGHT - 3, hint.id, {
                color: "#ffd75a", fontFamily: "monospace", fontSize: "34px", fontStyle: "700",
                stroke: "#050505", strokeThickness: 5
              }).setOrigin(.5).setDepth(166);
            this.placementHints.set(key, label);
          }
          label.setVisible(true).setAlpha(.55 + alpha * .35);
          break;
        }
      }
    }
  }

  private setCopy(copy: GuidedTutorialCopy, totalLessons: number, progressKey: string) {
    this.progressText.setText(t(progressKey, { current: copy.lesson, total: totalLessons }));
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
    this.categoryLegend?.destroy(true);
    this.diagram?.destroy(true);
    for (const label of this.placementHints.values()) label.destroy();
    this.placementHints.clear();
    this.highlights.destroy();
    this.panel.destroy(true);
  }
}
