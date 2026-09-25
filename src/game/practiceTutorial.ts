import type { CardId } from "../types";
import { TutorialPresentation, type TutorialController } from "./tutorial";
import { copyTutorialState, type TutorialState } from "./tutorialState";

export const PRACTICE_TUTORIAL_LOADOUT = ["A", "X", "B"] as const satisfies readonly CardId[];
export class PracticeTutorialController implements TutorialController {
  usesWaveSchedule = false;
  readonly presentation = new TutorialPresentation(1, "tutorial.practice.progress");
  private destroyed = false;
  constructor() { this.refresh(); }
  advance() { if (!this.destroyed) { this.usesWaveSchedule = true; this.refresh(); } }
  update() {}
  destroy() { this.destroyed = true; }
  snapshot(): TutorialState { return { version: 1, kind: "tutorialPractice", started: this.usesWaveSchedule }; }
  restore(value: TutorialState) {
    this.usesWaveSchedule = copyTutorialState(value, "tutorialPractice").started;
    this.refresh();
  }
  private refresh() {
    this.presentation.setCopy({ lesson: 1, titleKey: "tutorial.practice.title",
      bodyKey: this.usesWaveSchedule ? "tutorial.practice.battle" : "tutorial.practice.body",
      buttonKey: this.usesWaveSchedule ? undefined : "tutorial.practice.start" });
  }
}
