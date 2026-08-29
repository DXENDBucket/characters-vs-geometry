import Phaser from "phaser";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  CELL_WIDTH,
  palette
} from "../config";
import { t } from "../i18n";
import { createUnitBorder } from "../render/unitShapes";
import type { CardId, Tower, UnitCategory } from "../types";
import {
  GuidedTutorialView,
  type GuidedTutorialCopy,
  type TutorialRuntime
} from "./tutorial";

export const TOWER_TYPE_TUTORIAL_LOADOUT = ["F", "G"] as const satisfies readonly CardId[];

type TutorialStep =
  | "categories"
  | "functionClass"
  | "deployF"
  | "fReady"
  | "fActive"
  | "deployG"
  | "armingG"
  | "gReady"
  | "gActive"
  | "complete";

const TUTORIAL_COPY: Record<TutorialStep, GuidedTutorialCopy> = {
  categories: {
    lesson: 1,
    titleKey: "tutorial.types.categories.title",
    bodyKey: "tutorial.types.categories.body",
    buttonKey: "tutorial.continue"
  },
  functionClass: {
    lesson: 2,
    titleKey: "tutorial.types.function.title",
    bodyKey: "tutorial.types.function.body",
    buttonKey: "tutorial.continue"
  },
  deployF: {
    lesson: 3,
    titleKey: "tutorial.types.f.title",
    bodyKey: "tutorial.types.f.deploy"
  },
  fReady: {
    lesson: 3,
    titleKey: "tutorial.types.f.title",
    bodyKey: "tutorial.types.f.ready",
    buttonKey: "tutorial.types.releaseTarget"
  },
  fActive: {
    lesson: 3,
    titleKey: "tutorial.types.f.trigger.title",
    bodyKey: "tutorial.types.f.active"
  },
  deployG: {
    lesson: 4,
    titleKey: "tutorial.types.g.title",
    bodyKey: "tutorial.types.g.deploy"
  },
  armingG: {
    lesson: 4,
    titleKey: "tutorial.types.g.arming.title",
    bodyKey: "tutorial.types.g.arming"
  },
  gReady: {
    lesson: 5,
    titleKey: "tutorial.types.g.ready.title",
    bodyKey: "tutorial.types.g.ready",
    buttonKey: "tutorial.types.testTrap"
  },
  gActive: {
    lesson: 5,
    titleKey: "tutorial.types.g.trigger.title",
    bodyKey: "tutorial.types.g.active"
  },
  complete: {
    lesson: 6,
    titleKey: "tutorial.types.complete.title",
    bodyKey: "tutorial.types.complete.body",
    buttonKey: "tutorial.finish"
  }
};

const TOTAL_LESSONS = 6;
const CENTER_LANE = 3;
const F_TARGET = { lane: CENTER_LANE, column: 4 };
const G_TARGET = { lane: CENTER_LANE, column: 7 };

const CATEGORY_ITEMS: Array<{ category: UnitCategory; labelKey: string }> = [
  { category: "production", labelKey: "tutorial.types.category.production" },
  { category: "attack", labelKey: "tutorial.types.category.attack" },
  { category: "defense", labelKey: "tutorial.types.category.defense" },
  { category: "function", labelKey: "tutorial.types.category.function" },
  { category: "healing", labelKey: "tutorial.types.category.healing" }
];

export class TowerTypeTutorialController {
  private step: TutorialStep = "categories";
  private readonly view: GuidedTutorialView;
  private readonly categoryLegend: Phaser.GameObjects.Container;
  private fTower: Tower | null = null;
  private gTower: Tower | null = null;
  private destroyed = false;

  constructor(private readonly runtime: TutorialRuntime) {
    this.view = new GuidedTutorialView(runtime, TOTAL_LESSONS, "tutorial.types.progress", () => this.advance());
    this.categoryLegend = createCategoryLegend(runtime.scene);
    this.syncStep();
    this.drawHighlights();
  }

  update() {
    if (this.destroyed) {
      return;
    }

    switch (this.step) {
      case "deployF": {
        const tower = this.findTowerAt("F", F_TARGET.lane, F_TARGET.column);
        if (tower) {
          this.fTower = tower;
          this.setStep("fReady");
        }
        break;
      }
      case "fReady":
        if (!this.fTower?.inPlay) {
          this.fTower = null;
          this.setStep("deployF");
        }
        break;
      case "fActive":
        if (!this.fTower?.inPlay && this.runtime.getEnemies().length === 0) {
          this.setStep("deployG");
        }
        break;
      case "deployG": {
        const tower = this.findTowerAt("G", G_TARGET.lane, G_TARGET.column);
        if (tower) {
          this.gTower = tower;
          this.setStep("armingG");
        }
        break;
      }
      case "armingG":
        if (!this.gTower?.inPlay) {
          this.gTower = null;
          this.setStep("deployG");
        } else if (this.runtime.getBattleTime() >= this.gTower.armedAt) {
          this.setStep("gReady");
        }
        break;
      case "gReady":
        if (!this.gTower?.inPlay) {
          this.gTower = null;
          this.setStep("deployG");
        }
        break;
      case "gActive":
        if (!this.gTower?.inPlay && this.runtime.getEnemies().length === 0) {
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
    this.view.destroy();
    this.categoryLegend.destroy(true);
  }

  private advance() {
    switch (this.step) {
      case "categories":
        this.setStep("functionClass");
        return;
      case "functionClass":
        this.setStep("deployF");
        return;
      case "fReady":
        if (!this.fTower?.inPlay) {
          this.setStep("deployF");
          return;
        }
        this.runtime.spawnWave([
          { kind: "circle", lane: F_TARGET.lane, x: this.fTower.x + CELL_WIDTH * 1.5 }
        ]);
        this.setStep("fActive");
        return;
      case "gReady":
        if (!this.gTower?.inPlay) {
          this.setStep("deployG");
          return;
        }
        this.runtime.spawnWave([
          { kind: "circle", lane: G_TARGET.lane, x: this.gTower.x + CELL_WIDTH * 1.15 }
        ]);
        this.setStep("gActive");
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
    this.syncStep();
  }

  private syncStep() {
    this.view.setCopy(TUTORIAL_COPY[this.step]);
    this.categoryLegend.setVisible(this.step === "categories" || this.step === "functionClass");
  }

  private drawHighlights() {
    const alpha = this.view.beginHighlights();

    switch (this.step) {
      case "categories":
        return;
      case "functionClass":
        this.view.drawCardHighlight("F", alpha);
        this.view.drawCardHighlight("G", alpha);
        return;
      case "deployF":
        this.view.drawCardHighlight("F", alpha);
        this.view.drawCellHighlight(F_TARGET.lane, F_TARGET.column, alpha);
        return;
      case "fReady":
        this.view.drawCellHighlight(F_TARGET.lane, F_TARGET.column, alpha);
        return;
      case "fActive":
        this.view.drawCellHighlight(F_TARGET.lane, F_TARGET.column, alpha);
        this.view.drawEnemyHighlights(alpha);
        return;
      case "deployG":
        this.view.drawCardHighlight("G", alpha);
        this.view.drawCellHighlight(G_TARGET.lane, G_TARGET.column, alpha);
        return;
      case "armingG":
      case "gReady":
        this.view.drawCellHighlight(G_TARGET.lane, G_TARGET.column, alpha);
        return;
      case "gActive":
        this.view.drawCellHighlight(G_TARGET.lane, G_TARGET.column, alpha);
        this.view.drawEnemyHighlights(alpha);
        return;
    }
  }

  private findTowerAt(type: CardId, lane: number, column: number) {
    return this.runtime.getTowers().find((tower) => {
      return tower.inPlay && tower.type === type && tower.lane === lane && tower.column === column;
    });
  }
}

function createCategoryLegend(scene: Phaser.Scene) {
  const width = 850;
  const height = 132;
  const centerX = BOARD_X + BOARD_WIDTH / 2;
  const centerY = BOARD_Y + BOARD_HEIGHT / 2;
  const plate = scene.add.rectangle(0, 0, width, height, palette.black, 0.96).setStrokeStyle(2, palette.mid, 0.92);
  const title = scene.add
    .text(0, -48, t("tutorial.types.legendTitle"), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "15px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const children: Phaser.GameObjects.GameObject[] = [plate, title];
  const gap = 160;
  const startX = -gap * 2;

  CATEGORY_ITEMS.forEach((item, index) => {
    const x = startX + index * gap;
    const border = createUnitBorder(scene, item.category, 18, 2).setPosition(x, -7);
    const label = scene.add
      .text(x, 31, t(item.labelKey), {
        align: "center",
        color: "#d8d8d8",
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "700"
      })
      .setOrigin(0.5, 0);
    children.push(border, label);
  });

  return scene.add.container(centerX, centerY, children).setDepth(168);
}
