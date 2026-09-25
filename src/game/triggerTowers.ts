import type Phaser from "phaser";
import type { TowerActionListener } from "./towerActions";
import type { ScheduleBattleAction, TowerShockAction } from "./battleActions";
import type { CardDefinition, CardId, CubeBoss, DamageType, Enemy, Tower } from "../types";
import * as rules from "./triggerTowerRules";
import { triggerTowerRuntime } from "../render/triggerTowers";

export interface TriggerTowerRuntime {
  onTowerAction?: TowerActionListener;
  scheduleBattleAction: ScheduleBattleAction;
  scene: Phaser.Scene;
  enemies: Enemy[];
  boss: CubeBoss | null;
  battleTime: number;
  gameOver: boolean;
  getDefinition: (id: CardId) => CardDefinition;
  removeTower: (tower: Tower) => void;
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType, sourceTower?: Tower) => boolean;
  damageBoss: (damage: number, damageType: DamageType, targetPart?: CubeBoss) => boolean;
}


export { isShockTower } from "./towerRules";
export function triggerShockTower(runtime: TriggerTowerRuntime, tower: Tower) {
  rules.triggerShockTower(triggerTowerRuntime(runtime), tower);
}
export function triggerTrapTower(runtime: TriggerTowerRuntime, tower: Tower, target: Enemy | CubeBoss | "boss") {
  rules.triggerTrapTower(triggerTowerRuntime(runtime), tower, target);
}
export function executeShockPulse(runtime: TriggerTowerRuntime, action: TowerShockAction) {
  rules.executeShockPulse(triggerTowerRuntime(runtime), action);
}
