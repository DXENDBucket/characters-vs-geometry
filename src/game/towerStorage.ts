import type { Enemy, Tower } from "../types";
import type { CombatRuntime } from "./combatRuntime";
import { TowerStorageSimulation } from "./towerStorageRules";
import { towerStoragePresentation } from "../render/towerStorage";

export { ENEMY_STORAGE_DURATION } from "./towerStorageRules";

type StorageRuntime = Pick<CombatRuntime, "scene" | "enemies" | "towers" | "occupied" | "battleTime" | "damageTower">;

export class TowerStorageController extends TowerStorageSimulation<Enemy, Tower> {
  constructor(runtime: () => StorageRuntime) {
    super(runtime, towerStoragePresentation(() => runtime().scene));
  }
}
