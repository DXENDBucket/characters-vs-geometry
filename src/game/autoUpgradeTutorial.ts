import { copyTutorialState, TUTORIAL_STEPS, type TutorialState } from "./tutorialState";
import type { TowerState } from "./towerState";
import type { CardId } from "../types";
import {
  TutorialPresentation,
  type GuidedTutorialCopy,
  type TutorialRuntime
} from "./tutorial";

export const AUTO_UPGRADE_TUTORIAL_LOADOUT = ["A"] as const satisfies readonly CardId[];

type TutorialStep = typeof TUTORIAL_STEPS.tutorialAutoUpgrade[number];

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
    lesson: 6,
    titleKey: "tutorial.auto.erase.title",
    bodyKey: "tutorial.auto.erase.select"
  },
  erase: {
    lesson: 6,
    titleKey: "tutorial.auto.erase.title",
    bodyKey: "tutorial.auto.erase.body"
  },
  complete: {
    lesson: 7,
    titleKey: "tutorial.auto.complete.title",
    bodyKey: "tutorial.auto.complete.body",
    buttonKey: "tutorial.finish"
  },
  batchMark: { lesson: 5, titleKey: "tutorial.auto.batch.title", bodyKey: "tutorial.auto.batch.mark" },
  batchClear: { lesson: 5, titleKey: "tutorial.auto.batch.title", bodyKey: "tutorial.auto.batch.clear" }
};

const TOTAL_LESSONS = 7;
const TARGET = { lane: 3, column: 4 };
const PEER = { lane: 4, column: 4 };

export class AutoUpgradeTutorialController {
  readonly usesToolInteraction = true;
  private step: TutorialStep = "intro";
  readonly presentation: TutorialPresentation;
  private towerId: string | null = null;
  private get tower() { return this.runtime.getTowers().find(tower => tower.entityId === this.towerId) ?? null; }
  private set tower(tower: TowerState | null) {
    if (tower && !tower.entityId) throw new Error("Tutorial tower requires a battle entity ID");
    this.towerId = tower?.entityId ?? null;
  }
  private destroyed = false;

  constructor(private readonly runtime: TutorialRuntime) {
    this.presentation = new TutorialPresentation(TOTAL_LESSONS, "tutorial.auto.progress");
    this.syncCopy();
    this.drawHighlights();
  }

  snapshot(): TutorialState {
    return { version: 1, kind: "tutorialAutoUpgrade", step: this.step, towerId: this.towerId };
  }

  restore(value: TutorialState) {
    const state = copyTutorialState(value, "tutorialAutoUpgrade");
    this.step = state.step;
    this.towerId = state.towerId;
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
        if (tower && this.findPeerTower()) {
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
      case "batchMark":
      case "batchClear": {
        if (!this.ensureTower()) break;
        const peer = this.findPeerTower();
        if (!peer) { this.setStep("deploy"); break; }
        const marked = this.step === "batchMark";
        if (this.tower?.autoUpgrade === marked && peer.autoUpgrade === marked) {
          this.setStep(marked ? "batchClear" : "selectErase");
        }
        break;
      }
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
  }

  advance() {
    if (this.destroyed) return;
    switch (this.step) {
      case "intro":
        this.setStep("deploy");
        return;
      case "controls":
        this.setStep("batchMark");
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
    this.presentation.setCopy(TUTORIAL_COPY[this.step]);
  }

  private drawHighlights() {
    this.presentation.beginHighlights();
    switch (this.step) {
      case "intro":
        this.presentation.drawToolHighlight("autoUpgrade");
        this.presentation.drawToolHighlight("erase");
        return;
      case "deploy":
        this.presentation.drawCardHighlight("A");
        this.presentation.drawCellHighlight(TARGET.lane, TARGET.column);
        this.presentation.drawCellHighlight(PEER.lane, PEER.column);
        return;
      case "selectAuto":
        this.presentation.drawToolHighlight("autoUpgrade");
        return;
      case "mark":
        this.presentation.drawToolHighlight("autoUpgrade");
        this.presentation.drawCellHighlight(TARGET.lane, TARGET.column);
        return;
      case "waiting":
        this.presentation.drawCellHighlight(TARGET.lane, TARGET.column);
        return;
      case "controls":
        this.presentation.drawToolHighlight("autoUpgradeEnabled");
        this.presentation.drawToolHighlight("autoUpgradeReserve");
        return;
      case "selectErase":
        this.presentation.drawToolHighlight("erase");
        return;
      case "batchMark":
      case "batchClear":
        this.presentation.drawToolHighlight("autoUpgrade");
        this.presentation.drawCellHighlight(PEER.lane, PEER.column);
        return;
      case "erase":
        this.presentation.drawToolHighlight("erase");
        this.presentation.drawCellHighlight(TARGET.lane, TARGET.column);
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

  private findPeerTower() {
    return this.runtime.getTowers().find(tower => tower.inPlay && tower.type === "A" &&
      tower.lane === PEER.lane && tower.column === PEER.column);
  }
}
