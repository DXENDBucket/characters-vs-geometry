import type Phaser from "phaser";
import { soundPlayer } from "./player";

/** Presentation only: audio never reads or advances the simulation clock. */
export function bindBattleAudio(scene: Phaser.Scene, boss: boolean, state: () => { paused: boolean; finished: boolean }) {
  let previousPaused: boolean | undefined, previousFinished: boolean | undefined;
  const refresh = () => {
    const current = state(), paused = current.paused || scene.scene.isPaused();
    if (current.finished !== previousFinished) {
      soundPlayer.setMusic(current.finished ? undefined : boss ? "boss" : "battle");
      previousFinished = current.finished;
    }
    if (paused !== previousPaused) {
      soundPlayer.pauseMusic(paused);
      previousPaused = paused;
    }
  };
  scene.events.on("postupdate", refresh);
  scene.events.on("pause", refresh);
  scene.events.on("resume", refresh);
  scene.events.once("shutdown", () => {
    scene.events.off("postupdate", refresh);
    scene.events.off("pause", refresh);
    scene.events.off("resume", refresh);
    soundPlayer.setMusic(undefined);
  });
  refresh();
}
