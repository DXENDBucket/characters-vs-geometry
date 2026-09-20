import type { CardDefinition, CardId, Tower } from "../types";
import { towerAtCell, towerCell } from "./towerTopology";
import { facingWithEffects } from "./rules/reversal";
import { isTargetedEffectCardId } from "./targetedEffectCards";
import { calculateTowerFinalStats, towerBaseStatsFromDefinition } from "./unitStats";

export function isCopyableDefinition(definition: CardDefinition) {
  return definition.cost <= 999 && !isTargetedEffectCardId(definition.id);
}

export interface TowerCopyRuntime {
  towers: Tower[];
  occupied: Map<string, Tower>;
  battleTime: number;
  getDefinition: (id: CardId) => CardDefinition;
  onChanged: (tower: Tower, definition: CardDefinition) => void;
}

export function syncTowerCopies(runtime: TowerCopyRuntime) {
  let changed = false;
  for (const tower of runtime.towers) {
    if (tower.type !== "@" || !tower.inPlay || tower.transient) continue;
    const direction = facingWithEffects(tower, tower.facingDirection ?? 1);
    const cell = towerCell(tower);
    const target = towerAtCell(runtime.occupied, tower, cell.lane, cell.column + direction);
    const candidate = target?.inPlay && !target.transient ? runtime.getDefinition(target.type) : undefined;
    const copiedType = candidate && isCopyableDefinition(candidate) ? candidate.id : undefined;
    if (tower.copiedType === copiedType) continue;

    const definition = runtime.getDefinition(copiedType ?? "@");
    const pool = tower.healthPool;
    const ratio = pool ? pool.hp / pool.maxHp : tower.hp / tower.maxHp;
    const previousMax = tower.maxHp;
    tower.copiedType = copiedType;
    tower.copyRevision = (tower.copyRevision ?? 0) + 1;
    tower.baseStats = towerBaseStatsFromDefinition(definition);
    calculateTowerFinalStats(tower, runtime.towers);
    tower.maxHp = tower.finalStats.maxHp;
    tower.baseMaxHp = tower.baseStats.maxHp;
    tower.armor = tower.finalStats.armor;
    tower.magicResistance = tower.finalStats.magicResistance;
    tower.attackSpeed = tower.finalStats.attackSpeed;
    tower.hp = ratio * tower.maxHp;
    if (pool) {
      pool.maxHp += (tower.maxHp - previousMax) / pool.linkCount;
      pool.hp = ratio * pool.maxHp;
    }
    tower.skills = copiedType === "w" ? { airPatrol: { sp: 8, spBuffer: 0, activeUntil: 0 } } : {};
    tower.flyingUntil = 0;
    tower.reflectProjectiles = !!definition.reflectProjectiles;
    // Switching forms starts a fresh attack/arming cycle, never a free immediate attack.
    tower.lastFire = runtime.battleTime;
    tower.nextProduceAt = definition.produceEvery ? runtime.battleTime + definition.produceEvery : Infinity;
    tower.armedAt = definition.armTime ? runtime.battleTime + definition.armTime : 0;
    runtime.onChanged(tower, definition);
    changed = true;
  }
  return changed;
}
