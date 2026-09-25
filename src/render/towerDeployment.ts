import type { Tower } from "../types";
import type { TowerDeploymentRuntime } from "../game/towerDeployment";
import type { DeploymentPresentation } from "../game/towerDeploymentRules";
import { syncTowerAutoUpgradeVisual, syncTowerFacingVisual, syncTowerLevelText, towerUpgradePresentation } from "../game/towers";
import { makeAutoUpgradePulse } from "./combatEffects";

export function deploymentPresentation(live: () => Pick<TowerDeploymentRuntime, "scene" | "updateCards" | "onFeedback">): DeploymentPresentation {
  return {
    ...towerUpgradePresentation,
    generated: tower => { syncTowerLevelText(tower as Tower); syncTowerFacingVisual(tower as Tower); },
    cards: () => live().updateCards(),
    feedback: kind => live().onFeedback?.(kind),
    autoUpgrade: tower => makeAutoUpgradePulse(live().scene, tower.x, tower.y),
    autoBorder: (tower, active) => syncTowerAutoUpgradeVisual(tower as Tower, active),
    upgraded: towers => { live().scene.tweens.add({
      targets: towers.map(tower => (tower as Tower).body), scale: 1.08, yoyo: true, duration: 90, ease: "Quad.easeOut"
    }); }
  };
}
