import type { Tower } from "../types";
import type { TowerMirrorRuntime } from "../game/towerMirrors";
import type { MirrorPresentation } from "../game/towerMirrorRules";
import { syncTowerFacingVisual, syncTowerLevelText, towerUpgradePresentation } from "../game/towers";

export function mirrorPresentation(live: () => TowerMirrorRuntime): MirrorPresentation {
  return {
    ...towerUpgradePresentation,
    level: tower => syncTowerLevelText(tower as Tower),
    facing: tower => syncTowerFacingVisual(tower as Tower),
    created: tower => {
      const body = (tower as Tower).body;
      body.setAlpha(.45); body.setScale(.86);
      live().scene.tweens.add({ targets: body, alpha: 1, scale: 1, duration: 140, ease: "Quad.easeOut" });
    }
  };
}
