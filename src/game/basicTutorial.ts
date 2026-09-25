import { copyTutorialState, TUTORIAL_STEPS, type TutorialState } from "./tutorialState";
import { BOARD_WIDTH, BOARD_X, CELL_WIDTH } from "../config";
import type { CardId } from "../types";
import {
  TutorialPresentation,
  type GuidedTutorialCopy,
  type TutorialRuntime
} from "./tutorial";

export const BASIC_TUTORIAL_LOADOUT = ["X", "A", "B"] as const satisfies readonly CardId[];

type TutorialStep = typeof TUTORIAL_STEPS.tutorialBasics[number];

const TUTORIAL_COPY: Record<TutorialStep, GuidedTutorialCopy> = {
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

export class BasicTutorialController {
  private step: TutorialStep = "welcome";
  readonly presentation: TutorialPresentation;
  private destroyed = false;

  constructor(private readonly runtime: TutorialRuntime) {
    this.presentation = new TutorialPresentation(TOTAL_LESSONS, "tutorial.progress");
    this.syncCopy();
    this.drawHighlights();
  }

  snapshot(): TutorialState {
    return { version: 1, kind: "tutorialBasics", step: this.step };
  }

  restore(value: TutorialState) {
    const state = copyTutorialState(value, "tutorialBasics");
    this.step = state.step;
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
  }

  advance() {
    if (this.destroyed) return;
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
    this.presentation.setCopy(TUTORIAL_COPY[this.step]);
  }

  private drawHighlights() {
    this.presentation.beginHighlights();

    switch (this.step) {
      case "welcome":
      case "incomingReady":
        this.presentation.drawLaneDirectionGuide(CENTER_LANE);
        return;
      case "producer":
        this.presentation.drawCardHighlight("X");
        this.presentation.drawCellHighlight(PRODUCER_TARGET.lane, PRODUCER_TARGET.column);
        return;
      case "attacker":
        this.presentation.drawCardHighlight("A");
        this.presentation.drawCellHighlight(ATTACKER_TARGET.lane, ATTACKER_TARGET.column);
        return;
      case "defender":
        this.presentation.drawCardHighlight("B");
        this.presentation.drawCellHighlight(DEFENDER_TARGET.lane, DEFENDER_TARGET.column);
        return;
      case "upgrade": {
        this.presentation.drawCardHighlight("A");
        const attacker = this.centerAttacker();
        if (attacker) {
          this.presentation.drawCellHighlight(attacker.lane, attacker.column);
        }
        return;
      }
      case "reinforce": {
        this.presentation.drawCardHighlight("A");
        const column = this.centerAttacker()?.column ?? ATTACKER_TARGET.column;
        if (!this.attackerInLane(CENTER_LANE - 1)) {
          this.presentation.drawCellHighlight(CENTER_LANE - 1, column);
        }
        if (!this.attackerInLane(CENTER_LANE + 1)) {
          this.presentation.drawCellHighlight(CENTER_LANE + 1, column);
        }
        return;
      }
      case "firstWave":
      case "blockingWave":
      case "finalWave":
        this.presentation.drawEnemyHighlights();
        return;
    }
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
