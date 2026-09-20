import type Phaser from "phaser";
import type { Tower } from "../types";

export function syncTowerAttachmentVisual(scene: Phaser.Scene, tower: Tower) {
  const existing = tower.body.getByName("continuous-attack");
  if (tower.continuousAttack && !existing) {
    const marker = scene.add.text(25, -29, "!", {
      fontFamily: "monospace", fontSize: "15px", fontStyle: "700", color: "#ffd75a",
      stroke: "#000000", strokeThickness: 3
    }).setOrigin(.5).setName("continuous-attack");
    tower.body.add(marker);
  } else if (!tower.continuousAttack) existing?.destroy();
}
