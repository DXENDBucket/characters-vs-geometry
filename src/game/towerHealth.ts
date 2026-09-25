import type { Tower } from "../types";
import type { TowerState } from "./towerState";
import { changeTowerHealth as change, syncTowerHealthCapacity as capacity, syncTowerHealthNetworks as networks } from "./towerHealthRules";
import { syncHealthBar } from "../render/towerHealth";
export { towerMinimumHealth, towerHealthDepleted } from "./towerHealthRules";
export { syncHealthBar } from "../render/towerHealth";

const changed = (tower: TowerState) => syncHealthBar(tower as Tower);
export function changeTowerHealth(tower: Tower, amount: number) { return change(tower, amount, changed); }
export function syncTowerHealthCapacity(tower: Tower, previousMaxHp: number, healIncrease: boolean) {
  capacity(tower, previousMaxHp, healIncrease, changed);
}
export function syncTowerHealthNetworks(towers: Tower[]) { networks(towers, changed); }
