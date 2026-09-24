import type { CardId } from "../types";
import { GuidedTutorialView, type TutorialController, type TutorialRuntime } from "./tutorial";

export const PRACTICE_TUTORIAL_LOADOUT = ["A", "X", "B"] as const satisfies readonly CardId[];

export class PracticeTutorialController implements TutorialController {
  usesWaveSchedule = false;
  private readonly view: GuidedTutorialView;

  constructor(runtime: TutorialRuntime) {
    this.view = new GuidedTutorialView(runtime, 1, "tutorial.practice.progress", () => {
      this.usesWaveSchedule = true;
      this.refresh();
    });
    this.refresh();
  }

  update() {}

  destroy() { this.view.destroy(); }

  private refresh() {
    this.view.setCopy({ lesson: 1, titleKey: "tutorial.practice.title",
      bodyKey: this.usesWaveSchedule ? "tutorial.practice.battle" : "tutorial.practice.body",
      buttonKey: this.usesWaveSchedule ? undefined : "tutorial.practice.start" });
  }
}
