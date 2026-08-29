import Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH } from "../config";
import type { CardId, Tower } from "../types";
import {
  GuidedTutorialView,
  type GuidedTutorialCopy,
  type TutorialRuntime
} from "./tutorial";

export const SHIFTER_TUTORIAL_LOADOUT = ["A", "B"] as const satisfies readonly CardId[];

type TutorialStep =
  | "intro"
  | "deploy"
  | "singleTool"
  | "singleSelect"
  | "singleMove"
  | "cooldown"
  | "multiTool"
  | "multiFirst"
  | "multiSecond"
  | "multiMove"
  | "complete";

const TUTORIAL_COPY: Record<TutorialStep, GuidedTutorialCopy> = {
  intro: {
    lesson: 1,
    titleKey: "tutorial.shifter.intro.title",
    bodyKey: "tutorial.shifter.intro.body",
    buttonKey: "tutorial.continue"
  },
  deploy: {
    lesson: 2,
    titleKey: "tutorial.shifter.deploy.title",
    bodyKey: "tutorial.shifter.deploy.body"
  },
  singleTool: {
    lesson: 3,
    titleKey: "tutorial.shifter.single.title",
    bodyKey: "tutorial.shifter.single.tool"
  },
  singleSelect: {
    lesson: 3,
    titleKey: "tutorial.shifter.single.title",
    bodyKey: "tutorial.shifter.single.select"
  },
  singleMove: {
    lesson: 4,
    titleKey: "tutorial.shifter.move.title",
    bodyKey: "tutorial.shifter.single.move"
  },
  cooldown: {
    lesson: 4,
    titleKey: "tutorial.shifter.cooldown.title",
    bodyKey: "tutorial.shifter.cooldown.body"
  },
  multiTool: {
    lesson: 5,
    titleKey: "tutorial.shifter.multi.title",
    bodyKey: "tutorial.shifter.multi.tool"
  },
  multiFirst: {
    lesson: 5,
    titleKey: "tutorial.shifter.multi.title",
    bodyKey: "tutorial.shifter.multi.first"
  },
  multiSecond: {
    lesson: 5,
    titleKey: "tutorial.shifter.multi.title",
    bodyKey: "tutorial.shifter.multi.second"
  },
  multiMove: {
    lesson: 6,
    titleKey: "tutorial.shifter.groupMove.title",
    bodyKey: "tutorial.shifter.groupMove.body"
  },
  complete: {
    lesson: 7,
    titleKey: "tutorial.shifter.complete.title",
    bodyKey: "tutorial.shifter.complete.body",
    buttonKey: "tutorial.finish"
  }
};

const TOTAL_LESSONS = 7;
const SINGLE_ORIGIN = { lane: 1, column: 2 };
const SINGLE_TARGET = { lane: 1, column: 5 };
const GROUP_A_ORIGIN = { lane: 3, column: 2 };
const GROUP_B_ORIGIN = { lane: 4, column: 3 };
const GROUP_TARGET = { lane: 3, column: 7 };
const GROUP_B_TARGET = { lane: 4, column: 8 };

interface PlacementHint {
  type: CardId;
  position: { lane: number; column: number };
  label: Phaser.GameObjects.Text;
}

export class ShifterTutorialController {
  private step: TutorialStep = "intro";
  private readonly view: GuidedTutorialView;
  private readonly placementHints: PlacementHint[];
  private singleTower: Tower | null = null;
  private groupATower: Tower | null = null;
  private groupBTower: Tower | null = null;
  private destroyed = false;

  constructor(private readonly runtime: TutorialRuntime) {
    this.view = new GuidedTutorialView(runtime, TOTAL_LESSONS, "tutorial.shifter.progress", () => this.advance());
    this.placementHints = [
      this.createPlacementHint("A", SINGLE_ORIGIN),
      this.createPlacementHint("A", GROUP_A_ORIGIN),
      this.createPlacementHint("B", GROUP_B_ORIGIN)
    ];
    this.syncCopy();
    this.drawHighlights();
  }

  update() {
    if (this.destroyed) {
      return;
    }

    const tools = this.runtime.getToolState();
    switch (this.step) {
      case "deploy":
        this.captureLayoutTowers();
        if (this.singleTower && this.groupATower && this.groupBTower) {
          this.setStep("singleTool");
        }
        break;
      case "singleTool":
        if (!this.ensureLayout()) {
          break;
        }
        if (tools.shifterMode) {
          this.setStep("singleSelect");
        }
        break;
      case "singleSelect":
        if (!this.ensureLayout()) {
          break;
        }
        if (!tools.shifterMode) {
          this.setStep("singleTool");
        } else if (this.singleTower && tools.shifterSelection.includes(this.singleTower)) {
          this.setStep("singleMove");
        }
        break;
      case "singleMove":
        if (!this.ensureLayout()) {
          break;
        }
        if (!tools.shifterMode && this.singleTower && this.towerMovedFrom(this.singleTower, SINGLE_ORIGIN)) {
          this.setStep("cooldown");
        } else if (!tools.shifterSelection.includes(this.singleTower!)) {
          this.setStep(tools.shifterMode ? "singleSelect" : "singleTool");
        }
        break;
      case "cooldown":
        if (!this.ensureLayout()) {
          break;
        }
        if (tools.shifterReadyRatio >= 1) {
          this.setStep("multiTool");
        }
        break;
      case "multiTool":
        if (!this.ensureLayout()) {
          break;
        }
        if (tools.shifterMode) {
          this.setStep("multiFirst");
        }
        break;
      case "multiFirst":
        if (!this.ensureLayout()) {
          break;
        }
        if (!tools.shifterMode) {
          this.setStep("multiTool");
        } else if (this.groupATower && tools.shifterSelection.includes(this.groupATower)) {
          this.setStep("multiSecond");
        }
        break;
      case "multiSecond":
        if (!this.ensureLayout()) {
          break;
        }
        if (!tools.shifterMode) {
          this.setStep("multiTool");
        } else if (!this.groupATower || !tools.shifterSelection.includes(this.groupATower)) {
          this.setStep("multiFirst");
        } else if (this.groupBTower && tools.shifterSelection.includes(this.groupBTower)) {
          this.setStep("multiMove");
        }
        break;
      case "multiMove":
        if (!this.ensureLayout()) {
          break;
        }
        if (
          !tools.shifterMode &&
          this.groupATower &&
          this.groupBTower &&
          this.towerMovedFrom(this.groupATower, GROUP_A_ORIGIN) &&
          this.towerMovedFrom(this.groupBTower, GROUP_B_ORIGIN)
        ) {
          this.setStep("complete");
        } else if (
          !tools.shifterSelection.includes(this.groupATower!) ||
          !tools.shifterSelection.includes(this.groupBTower!)
        ) {
          this.setStep(tools.shifterMode ? "multiFirst" : "multiTool");
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
    this.placementHints.forEach((hint) => hint.label.destroy());
  }

  private advance() {
    switch (this.step) {
      case "intro":
        this.setStep("deploy");
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
    this.view.setCopy(TUTORIAL_COPY[this.step]);
  }

  private drawHighlights() {
    const alpha = this.view.beginHighlights();
    this.syncPlacementHints(alpha);
    switch (this.step) {
      case "intro":
      case "singleTool":
      case "multiTool":
        this.view.drawToolHighlight("shifter", alpha);
        return;
      case "deploy":
        this.drawMissingDeploymentHighlights(alpha);
        return;
      case "singleSelect":
        this.view.drawCellHighlight(this.singleTower?.lane ?? SINGLE_ORIGIN.lane, this.singleTower?.column ?? SINGLE_ORIGIN.column, alpha);
        return;
      case "singleMove":
        this.view.drawCellHighlight(SINGLE_TARGET.lane, SINGLE_TARGET.column, alpha);
        return;
      case "cooldown":
        this.view.drawToolHighlight("shifter", alpha);
        return;
      case "multiFirst":
        this.view.drawCellHighlight(GROUP_A_ORIGIN.lane, GROUP_A_ORIGIN.column, alpha);
        return;
      case "multiSecond":
        this.view.drawCellHighlight(GROUP_A_ORIGIN.lane, GROUP_A_ORIGIN.column, alpha);
        this.view.drawCellHighlight(GROUP_B_ORIGIN.lane, GROUP_B_ORIGIN.column, alpha);
        return;
      case "multiMove":
        this.view.drawCellHighlight(GROUP_TARGET.lane, GROUP_TARGET.column, alpha);
        this.view.drawCellHighlight(GROUP_B_TARGET.lane, GROUP_B_TARGET.column, alpha);
        return;
    }
  }

  private drawMissingDeploymentHighlights(alpha: number) {
    const missingSingle = !this.findTowerAt("A", SINGLE_ORIGIN);
    const missingGroupA = !this.findTowerAt("A", GROUP_A_ORIGIN);
    const missingGroupB = !this.findTowerAt("B", GROUP_B_ORIGIN);
    if (missingSingle || missingGroupA) {
      this.view.drawCardHighlight("A", alpha);
    }
    if (missingGroupB) {
      this.view.drawCardHighlight("B", alpha);
    }
    if (missingSingle) {
      this.view.drawCellHighlight(SINGLE_ORIGIN.lane, SINGLE_ORIGIN.column, alpha);
    }
    if (missingGroupA) {
      this.view.drawCellHighlight(GROUP_A_ORIGIN.lane, GROUP_A_ORIGIN.column, alpha);
    }
    if (missingGroupB) {
      this.view.drawCellHighlight(GROUP_B_ORIGIN.lane, GROUP_B_ORIGIN.column, alpha);
    }
  }

  private createPlacementHint(type: CardId, position: { lane: number; column: number }): PlacementHint {
    const x = BOARD_X + (position.column + 0.5) * CELL_WIDTH;
    const y = BOARD_Y + (position.lane + 0.5) * CELL_HEIGHT;
    const label = this.runtime.scene.add
      .text(x, y - 3, type, {
        color: "#ffd75a",
        fontFamily: "monospace",
        fontSize: "34px",
        fontStyle: "700",
        stroke: "#050505",
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(166);
    return { type, position, label };
  }

  private syncPlacementHints(alpha: number) {
    for (const hint of this.placementHints) {
      const missing = !this.findTowerAt(hint.type, hint.position);
      hint.label.setVisible(this.step === "deploy" && missing).setAlpha(0.55 + alpha * 0.35);
    }
  }

  private captureLayoutTowers() {
    this.singleTower ??= this.findTowerAt("A", SINGLE_ORIGIN) ?? null;
    this.groupATower ??= this.findTowerAt("A", GROUP_A_ORIGIN) ?? null;
    this.groupBTower ??= this.findTowerAt("B", GROUP_B_ORIGIN) ?? null;
  }

  private ensureLayout() {
    if (this.singleTower?.inPlay && this.groupATower?.inPlay && this.groupBTower?.inPlay) {
      return true;
    }
    this.singleTower = null;
    this.groupATower = null;
    this.groupBTower = null;
    this.setStep("deploy");
    return false;
  }

  private findTowerAt(type: CardId, position: { lane: number; column: number }) {
    return this.runtime.getTowers().find((tower) => {
      return tower.inPlay && tower.type === type && tower.lane === position.lane && tower.column === position.column;
    });
  }

  private towerMovedFrom(tower: Tower, origin: { lane: number; column: number }) {
    return tower.lane !== origin.lane || tower.column !== origin.column;
  }
}
