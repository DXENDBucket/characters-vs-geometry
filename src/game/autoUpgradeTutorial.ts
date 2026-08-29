import type { CardId, Tower } from "../types";
import {
  GuidedTutorialView,
  type GuidedTutorialCopy,
  type TutorialRuntime
} from "./tutorial";

export const AUTO_UPGRADE_TUTORIAL_LOADOUT = ["A"] as const satisfies readonly CardId[];

type TutorialStep =
  | "intro"
  | "deploy"
  | "selectAuto"
  | "mark"
  | "waiting"
  | "controls"
  | "selectErase"
  | "erase"
  | "complete";

const TUTORIAL_COPY: Record<TutorialStep, GuidedTutorialCopy> = {
  intro: {
    lesson: 1,
    titleKey: "tutorial.auto.intro.title",
    bodyKey: "tutorial.auto.intro.body",
    buttonKey: "tutorial.continue"
  },
  deploy: {
    lesson: 2,
    titleKey: "tutorial.auto.deploy.title",
    bodyKey: "tutorial.auto.deploy.body"
  },
  selectAuto: {
    lesson: 3,
    titleKey: "tutorial.auto.mark.title",
    bodyKey: "tutorial.auto.select.body"
  },
  mark: {
    lesson: 3,
    titleKey: "tutorial.auto.mark.title",
    bodyKey: "tutorial.auto.mark.body"
  },
  waiting: {
    lesson: 3,
    titleKey: "tutorial.auto.wait.title",
    bodyKey: "tutorial.auto.wait.body"
  },
  controls: {
    lesson: 4,
    titleKey: "tutorial.auto.controls.title",
    bodyKey: "tutorial.auto.controls.body",
    buttonKey: "tutorial.continue"
  },
  selectErase: {
    lesson: 5,
    titleKey: "tutorial.auto.erase.title",
    bodyKey: "tutorial.auto.erase.select"
  },
  erase: {
    lesson: 5,
    titleKey: "tutorial.auto.erase.title",
    bodyKey: "tutorial.auto.erase.body"
  },
  complete: {
    lesson: 6,
    titleKey: "tutorial.auto.complete.title",
    bodyKey: "tutorial.auto.complete.body",
    buttonKey: "tutorial.finish"
  }
};

const TOTAL_LESSONS = 6;
const TARGET = { lane: 3, column: 4 };

export class AutoUpgradeTutorialController {
  private step: TutorialStep = "intro";
  private readonly view: GuidedTutorialView;
  private tower: Tower | null = null;
  private destroyed = false;

  constructor(private readonly runtime: TutorialRuntime) {
    this.view = new GuidedTutorialView(runtime, TOTAL_LESSONS, "tutorial.auto.progress", () => this.advance());
    this.syncCopy();
    this.drawHighlights();
  }

  update() {
    if (this.destroyed) {
      return;
    }

    const tools = this.runtime.getToolState();
    switch (this.step) {
      case "deploy": {
        const tower = this.findTargetTower();
        if (tower) {
          this.tower = tower;
          this.setStep("selectAuto");
        }
        break;
      }
      case "selectAuto":
        if (!this.ensureTower()) {
          break;
        }
        if (tools.autoUpgradeMode) {
          this.setStep("mark");
        }
        break;
      case "mark":
        if (!this.ensureTower()) {
          break;
        }
        if (this.tower?.autoUpgrade) {
          this.setStep("waiting");
        } else if (!tools.autoUpgradeMode) {
          this.setStep("selectAuto");
        }
        break;
      case "waiting":
        if (!this.ensureTower()) {
          break;
        }
        if (!this.tower?.autoUpgrade) {
          this.setStep("selectAuto");
        } else if ((this.tower?.level ?? 0) >= 2) {
          this.setStep("controls");
        }
        break;
      case "controls":
        this.ensureTower();
        break;
      case "selectErase":
        if (!this.ensureTower()) {
          break;
        }
        if (tools.eraserMode) {
          this.setStep("erase");
        }
        break;
      case "erase":
        if (!this.tower?.inPlay) {
          this.setStep("complete");
        } else if (!tools.eraserMode) {
          this.setStep("selectErase");
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
  }

  private advance() {
    switch (this.step) {
      case "intro":
        this.setStep("deploy");
        return;
      case "controls":
        this.setStep("selectErase");
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
    switch (this.step) {
      case "intro":
        this.view.drawToolHighlight("autoUpgrade", alpha);
        this.view.drawToolHighlight("erase", alpha);
        return;
      case "deploy":
        this.view.drawCardHighlight("A", alpha);
        this.view.drawCellHighlight(TARGET.lane, TARGET.column, alpha);
        return;
      case "selectAuto":
        this.view.drawToolHighlight("autoUpgrade", alpha);
        return;
      case "mark":
        this.view.drawToolHighlight("autoUpgrade", alpha);
        this.view.drawCellHighlight(TARGET.lane, TARGET.column, alpha);
        return;
      case "waiting":
        this.view.drawCellHighlight(TARGET.lane, TARGET.column, alpha);
        return;
      case "controls":
        this.view.drawToolHighlight("autoUpgradeEnabled", alpha);
        this.view.drawToolHighlight("autoUpgradeReserve", alpha);
        return;
      case "selectErase":
        this.view.drawToolHighlight("erase", alpha);
        return;
      case "erase":
        this.view.drawToolHighlight("erase", alpha);
        this.view.drawCellHighlight(TARGET.lane, TARGET.column, alpha);
        return;
    }
  }

  private ensureTower() {
    if (this.tower?.inPlay) {
      return true;
    }
    this.tower = null;
    this.setStep("deploy");
    return false;
  }

  private findTargetTower() {
    return this.runtime.getTowers().find((tower) => {
      return tower.inPlay && tower.type === "A" && tower.lane === TARGET.lane && tower.column === TARGET.column;
    });
  }
}
