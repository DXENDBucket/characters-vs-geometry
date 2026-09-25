import type Phaser from "phaser";
import type { CubeBoss, Enemy } from "../types";
import type { BattleEncounterPresentation } from "../game/battleEncounter";
import { clearBossCopyWarnings } from "./bossCopyWarnings";
import { playSound } from "../audio/player";

export function battleEncounterPresentation(scene: Phaser.Scene,
  ui: Pick<BattleEncounterPresentation, "changed" | "phaseChanged">): BattleEncounterPresentation {
  return {
    ...ui,
    clearedEnemies: enemies => {
      if (!enemies.length) return;
      const bodies = enemies.map(enemy => (enemy as Enemy).body);
      scene.tweens.add({ targets: bodies, alpha: 0, scale: .12, duration: 180, ease: "Quad.easeIn",
        onComplete: () => bodies.forEach(body => body.destroy()) });
    },
    removeContained: enemy => { (enemy as Enemy).body.destroy(); },
    resetBoss: (boss, copies) => {
      (boss as CubeBoss).body.setPosition(boss.x, boss.y);
      for (const copy of copies) (copy as CubeBoss).body.destroy();
      clearBossCopyWarnings(boss as CubeBoss);
    },
    breach: () => { scene.cameras.main.shake(110, .004); playSound("breach"); }
  };
}
