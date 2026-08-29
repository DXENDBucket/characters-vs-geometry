import type { CardId, LevelConfig } from "../types";
import { AUTO_UPGRADE_TUTORIAL_LOADOUT, AutoUpgradeTutorialController } from "./autoUpgradeTutorial";
import { BASIC_TUTORIAL_LOADOUT, BasicTutorialController } from "./basicTutorial";
import { SHIFTER_TUTORIAL_LOADOUT, ShifterTutorialController } from "./shifterTutorial";
import { TOWER_TYPE_TUTORIAL_LOADOUT, TowerTypeTutorialController } from "./towerTypeTutorial";
import type { TutorialController, TutorialRuntime } from "./tutorial";

export function tutorialLoadout(
  mechanic: LevelConfig["specialMechanic"],
  fallback?: CardId[]
) {
  switch (mechanic) {
    case "tutorialBasics":
      return [...BASIC_TUTORIAL_LOADOUT];
    case "tutorialTowerTypes":
      return [...TOWER_TYPE_TUTORIAL_LOADOUT];
    case "tutorialAutoUpgrade":
      return [...AUTO_UPGRADE_TUTORIAL_LOADOUT];
    case "tutorialShifter":
      return [...SHIFTER_TUTORIAL_LOADOUT];
    default:
      return fallback;
  }
}

export function createTutorialController(
  mechanic: LevelConfig["specialMechanic"],
  runtime: TutorialRuntime
): TutorialController | null {
  switch (mechanic) {
    case "tutorialBasics":
      return new BasicTutorialController(runtime);
    case "tutorialTowerTypes":
      return new TowerTypeTutorialController(runtime);
    case "tutorialAutoUpgrade":
      return new AutoUpgradeTutorialController(runtime);
    case "tutorialShifter":
      return new ShifterTutorialController(runtime);
    default:
      return null;
  }
}
