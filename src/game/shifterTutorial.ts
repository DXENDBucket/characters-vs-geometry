import { copyTutorialState, TUTORIAL_STEPS, type TutorialState } from "./tutorialState";
import type { TowerState } from "./towerState";
import type { CardId } from "../types";
import {
  TutorialPresentation,
  type GuidedTutorialCopy,
  type TutorialRuntime
} from "./tutorial";

export const SHIFTER_TUTORIAL_LOADOUT = ["A", "B"] as const satisfies readonly CardId[];

type TutorialStep = typeof TUTORIAL_STEPS.tutorialShifter[number];

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


export class ShifterTutorialController {
  readonly usesToolInteraction = true;
  private step: TutorialStep = "intro";
  readonly presentation: TutorialPresentation;
  private singleTowerId: string | null = null;
  private get singleTower() { return this.runtime.getTowers().find(tower => tower.entityId === this.singleTowerId) ?? null; }
  private set singleTower(tower: TowerState | null) {
    if (tower && !tower.entityId) throw new Error("Tutorial tower requires a battle entity ID");
    this.singleTowerId = tower?.entityId ?? null;
  }
  private groupATowerId: string | null = null;
  private get groupATower() { return this.runtime.getTowers().find(tower => tower.entityId === this.groupATowerId) ?? null; }
  private set groupATower(tower: TowerState | null) {
    if (tower && !tower.entityId) throw new Error("Tutorial tower requires a battle entity ID");
    this.groupATowerId = tower?.entityId ?? null;
  }
  private groupBTowerId: string | null = null;
  private get groupBTower() { return this.runtime.getTowers().find(tower => tower.entityId === this.groupBTowerId) ?? null; }
  private set groupBTower(tower: TowerState | null) {
    if (tower && !tower.entityId) throw new Error("Tutorial tower requires a battle entity ID");
    this.groupBTowerId = tower?.entityId ?? null;
  }
  private destroyed = false;

  constructor(private readonly runtime: TutorialRuntime) {
    this.presentation = new TutorialPresentation(TOTAL_LESSONS, "tutorial.shifter.progress");
    this.syncCopy();
    this.drawHighlights();
  }

  snapshot(): TutorialState {
    return { version: 1, kind: "tutorialShifter", step: this.step, singleTowerId: this.singleTowerId, groupATowerId: this.groupATowerId, groupBTowerId: this.groupBTowerId };
  }

  restore(value: TutorialState) {
    const state = copyTutorialState(value, "tutorialShifter");
    this.step = state.step;
    this.singleTowerId = state.singleTowerId;
    this.groupATowerId = state.groupATowerId;
    this.groupBTowerId = state.groupBTowerId;
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
  }

  advance() {
    if (this.destroyed) return;
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
    this.presentation.setCopy(TUTORIAL_COPY[this.step]);
  }

  private drawHighlights() {
    this.presentation.beginHighlights();
    this.syncPlacementHints();
    switch (this.step) {
      case "intro":
      case "singleTool":
      case "multiTool":
        this.presentation.drawToolHighlight("shifter");
        return;
      case "deploy":
        this.drawMissingDeploymentHighlights();
        return;
      case "singleSelect":
        this.presentation.drawCellHighlight(this.singleTower?.lane ?? SINGLE_ORIGIN.lane, this.singleTower?.column ?? SINGLE_ORIGIN.column);
        return;
      case "singleMove":
        this.presentation.drawCellHighlight(SINGLE_TARGET.lane, SINGLE_TARGET.column);
        return;
      case "cooldown":
        this.presentation.drawToolHighlight("shifter");
        return;
      case "multiFirst":
        this.presentation.drawCellHighlight(GROUP_A_ORIGIN.lane, GROUP_A_ORIGIN.column);
        return;
      case "multiSecond":
        this.presentation.drawCellHighlight(GROUP_A_ORIGIN.lane, GROUP_A_ORIGIN.column);
        this.presentation.drawCellHighlight(GROUP_B_ORIGIN.lane, GROUP_B_ORIGIN.column);
        return;
      case "multiMove":
        this.presentation.drawCellHighlight(GROUP_TARGET.lane, GROUP_TARGET.column);
        this.presentation.drawCellHighlight(GROUP_B_TARGET.lane, GROUP_B_TARGET.column);
        return;
    }
  }

  private drawMissingDeploymentHighlights() {
    const missingSingle = !this.findTowerAt("A", SINGLE_ORIGIN);
    const missingGroupA = !this.findTowerAt("A", GROUP_A_ORIGIN);
    const missingGroupB = !this.findTowerAt("B", GROUP_B_ORIGIN);
    if (missingSingle || missingGroupA) {
      this.presentation.drawCardHighlight("A");
    }
    if (missingGroupB) {
      this.presentation.drawCardHighlight("B");
    }
    if (missingSingle) {
      this.presentation.drawCellHighlight(SINGLE_ORIGIN.lane, SINGLE_ORIGIN.column);
    }
    if (missingGroupA) {
      this.presentation.drawCellHighlight(GROUP_A_ORIGIN.lane, GROUP_A_ORIGIN.column);
    }
    if (missingGroupB) {
      this.presentation.drawCellHighlight(GROUP_B_ORIGIN.lane, GROUP_B_ORIGIN.column);
    }
  }

  private syncPlacementHints() {
    if (this.step !== "deploy") return;
    for (const [type, position] of [["A", SINGLE_ORIGIN], ["A", GROUP_A_ORIGIN], ["B", GROUP_B_ORIGIN]] as const) {
      if (!this.findTowerAt(type, position)) this.presentation.drawPlacementHint(type, position.lane, position.column);
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

  private towerMovedFrom(tower: TowerState, origin: { lane: number; column: number }) {
    return tower.lane !== origin.lane || tower.column !== origin.column;
  }
}
