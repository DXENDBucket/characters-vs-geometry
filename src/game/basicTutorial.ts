import { BOARD_WIDTH, BOARD_X, CELL_WIDTH } from "../config";
import type { CardId } from "../types";
import {
  GuidedTutorialView,
  type GuidedTutorialCopy,
  type TutorialRuntime
} from "./tutorial";

export const BASIC_TUTORIAL_LOADOUT = ["X", "A", "B"] as const satisfies readonly CardId[];

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
  private readonly view: GuidedTutorialView;
  private destroyed = false;

  constructor(private readonly runtime: TutorialRuntime) {
    this.view = new GuidedTutorialView(runtime, TOTAL_LESSONS, "tutorial.progress", () => this.advance());
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
    this.view.destroy();
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
    this.view.setCopy(TUTORIAL_COPY[this.step]);
  }

  private drawHighlights() {
    const alpha = this.view.beginHighlights();

    switch (this.step) {
      case "welcome":
      case "incomingReady":
        this.view.drawLaneDirectionGuide(CENTER_LANE, alpha);
        return;
      case "producer":
        this.view.drawCardHighlight("X", alpha);
        this.view.drawCellHighlight(PRODUCER_TARGET.lane, PRODUCER_TARGET.column, alpha);
        return;
      case "attacker":
        this.view.drawCardHighlight("A", alpha);
        this.view.drawCellHighlight(ATTACKER_TARGET.lane, ATTACKER_TARGET.column, alpha);
        return;
      case "defender":
        this.view.drawCardHighlight("B", alpha);
        this.view.drawCellHighlight(DEFENDER_TARGET.lane, DEFENDER_TARGET.column, alpha);
        return;
      case "upgrade": {
        this.view.drawCardHighlight("A", alpha);
        const attacker = this.centerAttacker();
        if (attacker) {
          this.view.drawCellHighlight(attacker.lane, attacker.column, alpha);
        }
        return;
      }
      case "reinforce": {
        this.view.drawCardHighlight("A", alpha);
        const column = this.centerAttacker()?.column ?? ATTACKER_TARGET.column;
        if (!this.attackerInLane(CENTER_LANE - 1)) {
          this.view.drawCellHighlight(CENTER_LANE - 1, column, alpha);
        }
        if (!this.attackerInLane(CENTER_LANE + 1)) {
          this.view.drawCellHighlight(CENTER_LANE + 1, column, alpha);
        }
        return;
      }
      case "firstWave":
      case "blockingWave":
      case "finalWave":
        this.view.drawEnemyHighlights(alpha);
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
