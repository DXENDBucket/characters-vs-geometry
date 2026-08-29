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
import type { CardId, CardState, Enemy, EnemyKind, Tower } from "../types";

export const BASIC_TUTORIAL_LOADOUT = ["X", "A", "B"] as const satisfies readonly CardId[];

export interface BasicTutorialEnemySpawn {
  kind: EnemyKind;
  lane: number;
  x?: number;
}

interface BasicTutorialRuntime {
  scene: Phaser.Scene;
  getCardState: (id: CardId) => CardState | undefined;
  getTowers: () => Tower[];
  getEnemies: () => Enemy[];
  spawnWave: (spawns: BasicTutorialEnemySpawn[]) => void;
  finish: () => void;
}

type TutorialStep =
  | "welcome"
  | "producer"
  | "attacker"
  | "incomingReady"
  | "firstWave"
  | "defender"
  | "blockingReady"
  | "blockingWave"
  | "upgrade"
  | "reinforce"
  | "finalReady"
  | "finalWave"
  | "complete";

interface TutorialCopy {
  lesson: number;
  titleKey: string;
  bodyKey: string;
  buttonKey?: string;
}

const TUTORIAL_COPY: Record<TutorialStep, TutorialCopy> = {
  welcome: {
    lesson: 1,
    titleKey: "tutorial.welcome.title",
    bodyKey: "tutorial.welcome.body",
    buttonKey: "tutorial.continue"
  },
  producer: {
    lesson: 2,
    titleKey: "tutorial.producer.title",
    bodyKey: "tutorial.producer.body"
  },
  attacker: {
    lesson: 3,
    titleKey: "tutorial.attacker.title",
    bodyKey: "tutorial.attacker.body"
  },
  incomingReady: {
    lesson: 4,
    titleKey: "tutorial.incoming.title",
    bodyKey: "tutorial.incoming.body",
    buttonKey: "tutorial.startWave"
  },
  firstWave: {
    lesson: 4,
    titleKey: "tutorial.firstWave.title",
    bodyKey: "tutorial.firstWave.body"
  },
  defender: {
    lesson: 5,
    titleKey: "tutorial.defender.title",
    bodyKey: "tutorial.defender.body"
  },
  blockingReady: {
    lesson: 5,
    titleKey: "tutorial.blocking.title",
    bodyKey: "tutorial.blocking.body",
    buttonKey: "tutorial.startWave"
  },
  blockingWave: {
    lesson: 5,
    titleKey: "tutorial.blocking.title",
    bodyKey: "tutorial.blockingActive.body"
  },
  upgrade: {
    lesson: 6,
    titleKey: "tutorial.upgrade.title",
    bodyKey: "tutorial.upgrade.body"
  },
  reinforce: {
    lesson: 7,
    titleKey: "tutorial.reinforce.title",
    bodyKey: "tutorial.reinforce.body"
  },
  finalReady: {
    lesson: 8,
    titleKey: "tutorial.final.title",
    bodyKey: "tutorial.final.body",
    buttonKey: "tutorial.finalWave"
  },
  finalWave: {
    lesson: 8,
    titleKey: "tutorial.finalActive.title",
    bodyKey: "tutorial.finalActive.body"
  },
  complete: {
    lesson: 8,
    titleKey: "tutorial.complete.title",
    bodyKey: "tutorial.complete.body",
    buttonKey: "tutorial.finish"
  }
};

const TOTAL_LESSONS = 8;
const CENTER_LANE = 3;
const PRODUCER_TARGET = { lane: 1, column: 1 };
const ATTACKER_TARGET = { lane: CENTER_LANE, column: 2 };
const DEFENDER_TARGET = { lane: CENTER_LANE, column: 5 };
const PANEL_X = 18;
const PANEL_Y = 350;
const PANEL_WIDTH = 200;
const PANEL_HEIGHT = 374;

export class BasicTutorialController {
  private step: TutorialStep = "welcome";
  private readonly panel: Phaser.GameObjects.Container;
  private readonly progressText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly button: Phaser.GameObjects.Rectangle;
  private readonly buttonText: Phaser.GameObjects.Text;
  private readonly highlights: Phaser.GameObjects.Graphics;
  private destroyed = false;

  constructor(private readonly runtime: BasicTutorialRuntime) {
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

    this.panel = scene.add.container(0, 0, [plate, this.progressText, this.titleText, divider, this.bodyText, this.button, this.buttonText]);
    this.panel.setDepth(170);
    this.highlights = scene.add.graphics().setDepth(165);
    this.button.on("pointerdown", () => this.advance());
    this.buttonText.on("pointerdown", () => this.advance());
    this.syncCopy();
    this.drawHighlights();
  }

  update() {
    if (this.destroyed) {
      return;
    }

    switch (this.step) {
      case "producer":
        if (this.findTower("X")) {
          this.setStep("attacker");
        }
        break;
      case "attacker":
        if (this.centerAttacker()) {
          this.setStep("incomingReady");
        }
        break;
      case "firstWave":
        if (this.runtime.getEnemies().length === 0) {
          this.setStep("defender");
        }
        break;
      case "defender":
        if (this.centerDefender()) {
          this.setStep("blockingReady");
        }
        break;
      case "blockingWave":
        if (this.runtime.getEnemies().length === 0) {
          this.setStep("upgrade");
        }
        break;
      case "upgrade":
        if ((this.centerAttacker()?.level ?? 0) >= 2) {
          this.setStep("reinforce");
        }
        break;
      case "reinforce":
        if (this.attackerInLane(CENTER_LANE - 1) && this.attackerInLane(CENTER_LANE + 1)) {
          this.setStep("finalReady");
        }
        break;
      case "finalWave":
        if (this.runtime.getEnemies().length === 0) {
          this.setStep("complete");
        }
        break;
    }

    this.drawHighlights();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.highlights.destroy();
    this.panel.destroy(true);
  }

  private advance() {
    switch (this.step) {
      case "welcome":
        this.setStep("producer");
        return;
      case "incomingReady":
        this.runtime.spawnWave([{ kind: "circle", lane: CENTER_LANE }]);
        this.setStep("firstWave");
        return;
      case "blockingReady": {
        const defender = this.centerDefender();
        const x = defender
          ? Math.min(BOARD_X + BOARD_WIDTH + 42, defender.x + CELL_WIDTH * 2.5)
          : BOARD_X + BOARD_WIDTH + 42;
        this.runtime.spawnWave([{ kind: "circle", lane: CENTER_LANE, x }]);
        this.setStep("blockingWave");
        return;
      }
      case "finalReady":
        this.runtime.spawnWave([
          { kind: "circle", lane: CENTER_LANE - 1 },
          { kind: "circle", lane: CENTER_LANE },
          { kind: "circle", lane: CENTER_LANE + 1 }
        ]);
        this.setStep("finalWave");
        return;
      case "complete":
        this.runtime.finish();
        return;
    }
  }

  private setStep(step: TutorialStep) {
    if (this.step === step) {
      return;
    }
    this.step = step;
    this.syncCopy();
  }

  private syncCopy() {
    const copy = TUTORIAL_COPY[this.step];
    this.progressText.setText(t("tutorial.progress", { current: copy.lesson, total: TOTAL_LESSONS }));
    this.titleText.setFontSize(19).setText(t(copy.titleKey));
    if (this.titleText.width > PANEL_WIDTH - 24) {
      this.titleText.setFontSize(16);
    }
    this.bodyText.setText(t(copy.bodyKey));
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

  private drawHighlights() {
    const alpha = 0.6 + (Math.sin(this.runtime.scene.time.now / 150) + 1) * 0.17;
    this.highlights.clear();
    this.highlights.lineStyle(3, palette.gold, alpha);

    switch (this.step) {
      case "welcome":
      case "incomingReady":
        this.drawLaneDirectionGuide(alpha);
        return;
      case "producer":
        this.drawCardHighlight("X", alpha);
        this.drawCellHighlight(PRODUCER_TARGET.lane, PRODUCER_TARGET.column, alpha);
        return;
      case "attacker":
        this.drawCardHighlight("A", alpha);
        this.drawCellHighlight(ATTACKER_TARGET.lane, ATTACKER_TARGET.column, alpha);
        return;
      case "defender":
        this.drawCardHighlight("B", alpha);
        this.drawCellHighlight(DEFENDER_TARGET.lane, DEFENDER_TARGET.column, alpha);
        return;
      case "upgrade": {
        this.drawCardHighlight("A", alpha);
        const attacker = this.centerAttacker();
        if (attacker) {
          this.drawCellHighlight(attacker.lane, attacker.column, alpha);
        }
        return;
      }
      case "reinforce": {
        this.drawCardHighlight("A", alpha);
        const column = this.centerAttacker()?.column ?? ATTACKER_TARGET.column;
        if (!this.attackerInLane(CENTER_LANE - 1)) {
          this.drawCellHighlight(CENTER_LANE - 1, column, alpha);
        }
        if (!this.attackerInLane(CENTER_LANE + 1)) {
          this.drawCellHighlight(CENTER_LANE + 1, column, alpha);
        }
        return;
      }
      case "firstWave":
      case "blockingWave":
      case "finalWave":
        for (const enemy of this.runtime.getEnemies()) {
          this.highlights.strokeCircle(enemy.x, enemy.y, 32);
        }
        return;
    }
  }

  private drawCardHighlight(id: CardId, alpha: number) {
    const card = this.runtime.getCardState(id);
    if (!card) {
      return;
    }
    const bounds = card.frame.getBounds();
    this.highlights.lineStyle(3, palette.gold, alpha);
    this.highlights.strokeRect(bounds.x - 5, bounds.y - 4, bounds.width + 10, bounds.height + 8);
  }

  private drawCellHighlight(lane: number, column: number, alpha: number) {
    const x = BOARD_X + column * CELL_WIDTH;
    const y = BOARD_Y + lane * CELL_HEIGHT;
    this.highlights.fillStyle(palette.gold, 0.07 + alpha * 0.04);
    this.highlights.fillRect(x + 4, y + 4, CELL_WIDTH - 8, CELL_HEIGHT - 8);
    this.highlights.lineStyle(3, palette.gold, alpha);
    this.highlights.strokeRect(x + 4, y + 4, CELL_WIDTH - 8, CELL_HEIGHT - 8);
  }

  private drawLaneDirectionGuide(alpha: number) {
    const centerY = BOARD_Y + (CENTER_LANE + 0.5) * CELL_HEIGHT;
    const startX = BOARD_X + BOARD_WIDTH - 18;
    const endX = BOARD_X + 24;
    this.highlights.lineStyle(3, palette.gold, alpha);
    this.highlights.lineBetween(startX, centerY, endX, centerY);
    this.highlights.fillStyle(palette.gold, alpha);
    this.highlights.fillTriangle(endX, centerY, endX + 18, centerY - 10, endX + 18, centerY + 10);
    this.highlights.lineStyle(4, palette.white, alpha);
    this.highlights.lineBetween(BOARD_X - 20, BOARD_Y, BOARD_X - 20, BOARD_Y + BOARD_HEIGHT);
  }

  private centerAttacker() {
    return this.runtime.getTowers().find((tower) => tower.inPlay && tower.type === "A" && tower.lane === CENTER_LANE);
  }

  private centerDefender() {
    return this.runtime.getTowers().find((tower) => tower.inPlay && tower.type === "B" && tower.lane === CENTER_LANE);
  }

  private attackerInLane(lane: number) {
    return this.runtime.getTowers().some((tower) => tower.inPlay && tower.type === "A" && tower.lane === lane);
  }

  private findTower(type: CardId) {
    return this.runtime.getTowers().find((tower) => tower.inPlay && tower.type === type);
  }
}
