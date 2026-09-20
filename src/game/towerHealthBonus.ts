import type { CardDefinition, CardId, Tower } from "../types";
import { towerBehaviorType } from "./towerIdentity";
import { effectiveTowerStatLevel, syncTowerFinalStats } from "./unitStats";
import { effectiveUpgradeCountForLevel } from "./upgrades";
import { syncHealthBar } from "./towerHealth";

export function syncAdjacentHealthBonuses(towers: Tower[], definition: (id: CardId) => CardDefinition) {
  const sources = towers.filter(tower => tower.inPlay && !tower.transient &&
    (definition(towerBehaviorType(tower)).adjacentHealthBonus || tower.adjacentHealthBonus));
  if (!sources.length) return;
  const cells = new Map(towers.filter(tower => tower.inPlay && !tower.transient)
    .map(tower => [`${tower.lane}:${tower.column}`, tower]));
  for (const tower of sources) {
    const config = definition(towerBehaviorType(tower)).adjacentHealthBonus;
    const pairHealth = (dl: number, dc: number) => {
      const a = cells.get(`${tower.lane + dl}:${tower.column + dc}`);
      const b = cells.get(`${tower.lane - dl}:${tower.column - dc}`);
      return config && a && b && definition(a.type).cost <= config.costLimit && definition(b.type).cost <= config.costLimit
        ? a.finalStats.maxHp + b.finalStats.maxHp : 0;
    };
    const bonus = config ? Math.max(pairHealth(1, 0), pairHealth(0, 1)) *
      (config.ratio + config.ratioPerUpgrade * effectiveUpgradeCountForLevel(effectiveTowerStatLevel(tower))) : 0;
    if ((tower.adjacentHealthBonus ?? 0) === bonus) continue;
    tower.adjacentHealthBonus = bonus;
    syncTowerFinalStats(tower, { towers, preserveHealthRatio: true });
    syncHealthBar(tower);
  }
}
