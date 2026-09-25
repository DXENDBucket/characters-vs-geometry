import { copyTutorialState, TUTORIAL_STEPS, type TutorialState } from "./tutorialState";
import type { TowerState } from "./towerState";
import { CELL_WIDTH } from "../config";
import type { CardId } from "../types";
import {
  TutorialPresentation,
  type GuidedTutorialCopy,
  type TutorialRuntime
} from "./tutorial";

export const TOWER_TYPE_TUTORIAL_LOADOUT = ["F", "G"] as const satisfies readonly CardId[];

type TutorialStep = typeof TUTORIAL_STEPS.tutorialTowerTypes[number];

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


export class TowerTypeTutorialController {
  private step: TutorialStep = "categories";
  readonly presentation: TutorialPresentation;
  private fTowerId: string | null = null;
  private get fTower() { return this.runtime.getTowers().find(tower => tower.entityId === this.fTowerId) ?? null; }
  private set fTower(tower: TowerState | null) {
    if (tower && !tower.entityId) throw new Error("Tutorial tower requires a battle entity ID");
    this.fTowerId = tower?.entityId ?? null;
  }
  private gTowerId: string | null = null;
  private get gTower() { return this.runtime.getTowers().find(tower => tower.entityId === this.gTowerId) ?? null; }
  private set gTower(tower: TowerState | null) {
    if (tower && !tower.entityId) throw new Error("Tutorial tower requires a battle entity ID");
    this.gTowerId = tower?.entityId ?? null;
  }
  private destroyed = false;

  constructor(private readonly runtime: TutorialRuntime) {
    this.presentation = new TutorialPresentation(TOTAL_LESSONS, "tutorial.types.progress");
    this.syncStep();
    this.drawHighlights();
  }

  snapshot(): TutorialState {
    return { version: 1, kind: "tutorialTowerTypes", step: this.step, fTowerId: this.fTowerId, gTowerId: this.gTowerId };
  }

  restore(value: TutorialState) {
    const state = copyTutorialState(value, "tutorialTowerTypes");
    this.step = state.step;
    this.fTowerId = state.fTowerId;
    this.gTowerId = state.gTowerId;
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
  }

  advance() {
    if (this.destroyed) return;
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
    this.presentation.setCopy(TUTORIAL_COPY[this.step]);
    this.presentation.showCategories = this.step === "categories" || this.step === "functionClass";
  }

  private drawHighlights() {
    this.presentation.beginHighlights();

    switch (this.step) {
      case "categories":
        return;
      case "functionClass":
        this.presentation.drawCardHighlight("F");
        this.presentation.drawCardHighlight("G");
        return;
      case "deployF":
        this.presentation.drawCardHighlight("F");
        this.presentation.drawCellHighlight(F_TARGET.lane, F_TARGET.column);
        return;
      case "fReady":
        this.presentation.drawCellHighlight(F_TARGET.lane, F_TARGET.column);
        return;
      case "fActive":
        this.presentation.drawCellHighlight(F_TARGET.lane, F_TARGET.column);
        this.presentation.drawEnemyHighlights();
        return;
      case "deployG":
        this.presentation.drawCardHighlight("G");
        this.presentation.drawCellHighlight(G_TARGET.lane, G_TARGET.column);
        return;
      case "armingG":
      case "gReady":
        this.presentation.drawCellHighlight(G_TARGET.lane, G_TARGET.column);
        return;
      case "gActive":
        this.presentation.drawCellHighlight(G_TARGET.lane, G_TARGET.column);
        this.presentation.drawEnemyHighlights();
        return;
    }
  }

  private findTowerAt(type: CardId, lane: number, column: number) {
    return this.runtime.getTowers().find((tower) => {
      return tower.inPlay && tower.type === type && tower.lane === lane && tower.column === column;
    });
  }
}
