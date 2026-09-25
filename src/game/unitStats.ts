import type { Tower } from "../types";
import type { TowerState } from "./towerState";
import type { TowerAuraSources } from "./towerAuras";
import { syncTowerFinalStats as sync } from "./unitStatRules";
import { syncHealthBar } from "../render/towerHealth";
export { calculateTowerFinalStats, towerFinalStats, withTowerBehavior, towerAttackAmount, towerBaseStats,
  effectiveTowerStatLevel, applyEnemyBaseStats, enemyBaseStatsFromDefinition, towerBaseStatsFromDefinition,
  bossBaseStatsFromValues, syncBossBaseStats, setBossBaseArmor } from "./unitStatRules";

const healthChanged = (tower: TowerState) => syncHealthBar(tower as Tower);
export function syncTowerFinalStats(tower: Tower,
  options: { healMaxHpIncrease?: boolean; towers?: Tower[]; towerAuraSources?: TowerAuraSources } = {}) {
  sync(tower, options, healthChanged);
}
