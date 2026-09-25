import type Phaser from "phaser";
import { palette } from "../config";
import type { Tower } from "../types";
import type { TargetedEffectCardRuntime } from "../game/targetedEffectCards";
import type { TargetedEffectPresentation } from "../game/targetedEffectRules";
import { syncTowerAttachmentVisual } from "./towerAttachments";
import { syncTowerFacingVisual } from "./towerFacing";
import { syncTowerTrueDamageVisual } from "../game/towers";
import { syncTowerLevelText } from "../game/towers";
import { syncHealthBar } from "./towerHealth";

export function targetedEffectPresentation(live: () => Pick<TargetedEffectCardRuntime, "scene" | "updateCards">): TargetedEffectPresentation {
  return {
    attachment: tower => syncTowerAttachmentVisual(live().scene, tower as Tower),
    turned: tower => { syncTowerFacingVisual(tower as Tower); makeTurnCardPulse(live().scene, tower as Tower); },
    trueDamage: (tower, time) => syncTowerTrueDamageVisual(tower as Tower, time),
    pulse: tower => makeTargetedEffectPulse(live().scene, tower as Tower),
    placed: tower => { syncTowerFacingVisual(tower as Tower); syncTowerLevelText(tower as Tower); (tower as Tower).body.setDepth(45 + tower.lane); },
    level: tower => { syncTowerLevelText(tower as Tower); (tower as Tower).levelText.setAlpha(1); },
    health: tower => syncHealthBar(tower as Tower),
    upgraded: tower => { live().scene.tweens.add({ targets: (tower as Tower).body, scale: 1.08, yoyo: true, duration: 90, ease: "Quad.easeOut" }); },
    cards: () => live().updateCards()
  };
}

function makeTurnCardPulse(scene: Phaser.Scene, tower: Tower) {
  const ring = scene.add.circle(tower.x, tower.y, 24, palette.black, 0).setStrokeStyle(2, palette.gold, 0.95);
  ring.setDepth(108);
  const marker = scene.add
    .text(tower.x - 36, tower.y - 4, tower.facingDirection === -1 ? "<" : ">", {
      color: "#ffd75a",
      fontFamily: "monospace",
      fontSize: "24px",
      fontStyle: "700"
    })
    .setOrigin(0.5)
    .setDepth(109);

  scene.tweens.add({
    targets: ring,
    scale: 1.75,
    alpha: 0,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
  });
  scene.tweens.add({
    targets: marker,
    alpha: 0,
    y: marker.y - 12,
    duration: 300,
    ease: "Quad.easeOut",
    onComplete: () => marker.destroy()
  });
}

function makeTargetedEffectPulse(scene: Phaser.Scene, tower: Tower) {
  const ring = scene.add.circle(tower.x, tower.y, 36, palette.black, 0).setStrokeStyle(2, palette.gold, 0.95);
  ring.setDepth(108);
  scene.tweens.add({
    targets: ring,
    scale: 1.35,
    alpha: 0,
    duration: 320,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
  });
}
