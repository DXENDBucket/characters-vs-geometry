import { TutorialPresentation, type TutorialRuntime } from "./tutorial";
import { damageLessons } from "./damageTutorialLessons";
import { copyTutorialState, type TutorialState } from "./tutorialState";

export class DamageTutorialController {
  readonly presentation = new TutorialPresentation(damageLessons.length + 2, "tutorial.damage.progress");
  private index = -1;
  private fired = false;
  private destroyed = false;
  constructor(private readonly runtime: TutorialRuntime) { this.refresh(); }
  update() {}
  destroy() { this.destroyed = true; }
  advance() {
    if (this.destroyed) return;
    if (this.index >= damageLessons.length) { this.runtime.finish(); return; }
    if (this.index >= 0 && !this.fired) this.fired = true;
    else { this.index++; this.fired = false; }
    this.refresh();
  }
  snapshot(): TutorialState { return { version: 1, kind: "tutorialDamage", index: this.index, fired: this.fired }; }
  restore(value: TutorialState) {
    const state = copyTutorialState(value, "tutorialDamage");
    this.index = state.index; this.fired = state.fired;
    this.refresh();
  }
  private refresh() {
    const lesson = damageLessons[this.index];
    const id = this.index < 0 ? "intro" : lesson?.id ?? "complete";
    this.presentation.setCopy({ lesson: this.index + 2, titleKey: `tutorial.damage.${id}.title`,
      bodyKey: `tutorial.damage.${id}.body`,
      buttonKey: !lesson ? this.index < 0 ? "tutorial.continue" : "tutorial.finish"
        : this.fired ? "tutorial.continue" : "tutorial.damage.fire" });
    this.presentation.damage = { index: this.index, fired: this.fired };
  }
}
