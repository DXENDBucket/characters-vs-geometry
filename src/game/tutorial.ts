import type { EnemyKind, LevelConfig } from "../types";
import type { TowerState } from "./towerState";
import type { EnemyState } from "./enemyState";
import type { TutorialState } from "./tutorialState";
import type { TutorialPresentation } from "./tutorialPresentation";
export { TutorialPresentation, type GuidedTutorialCopy } from "./tutorialPresentation";

export interface TutorialEnemySpawn { kind: EnemyKind; lane: number; x?: number }
export type TutorialToolId = "erase" | "autoUpgrade" | "autoUpgradeEnabled" | "autoUpgradeReserve" | "shifter";
export interface TutorialToolState {
  eraserMode: boolean;
  autoUpgradeMode: boolean;
  autoUpgradeEnabled: boolean;
  shifterMode: boolean;
  shifterReadyRatio: number;
  shifterSelection: TowerState[];
}
export interface TutorialRuntime {
  getTowers(): TowerState[];
  getEnemies(): EnemyState[];
  getBattleTime(): number;
  getToolState(): TutorialToolState;
  spawnWave(spawns: TutorialEnemySpawn[]): void;
  finish(): void;
}
export interface TutorialController {
  readonly presentation: TutorialPresentation;
  usesWaveSchedule?: boolean;
  usesToolInteraction?: boolean;
  update(): void;
  advance(): void;
  snapshot(): TutorialState;
  restore(state: TutorialState): void;
  destroy(): void;
}
export function isTutorialMechanic(mechanic: LevelConfig["specialMechanic"]) {
  return mechanic === "tutorialBasics" || mechanic === "tutorialPractice" ||
    mechanic === "tutorialTowerTypes" || mechanic === "tutorialAutoUpgrade" ||
    mechanic === "tutorialShifter" || mechanic === "tutorialDamage";
}
