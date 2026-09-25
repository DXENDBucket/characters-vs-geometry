import type { CardDefinition, CardId } from "../types";
import type { TowerState as Tower } from "./towerState";
import { isTowerShellType } from "./towerOccupancy";
import { towerAtCell, towerCell } from "./towerTopology";
import { facingWithEffects } from "./rules/reversal";
import { isTargetedEffectCardId } from "./targetedEffectRules";
import { calculateTowerFinalStats, towerBaseStatsFromDefinition } from "./unitStatRules";
import { initialTowerSkillStates } from "./towerSkillRules";
import { settleTowerMoveVisual } from "./towerRules";

export function isCopyableDefinition(definition: CardDefinition) {
  return definition.cost <= 999 && !isTowerShellType(definition.id) && !isTargetedEffectCardId(definition.id);
}

export interface TowerCopyRuntime<T extends Tower = Tower> {
  towers: T[];
  occupied: Map<string, T>;
  battleTime: number;
  getDefinition: (id: CardId) => CardDefinition;
  onChanged?: (tower: T, definition: CardDefinition) => void;
}

export function syncTowerCopies<T extends Tower>(runtime: TowerCopyRuntime<T>) {
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
    tower.skills = initialTowerSkillStates(copiedType ?? "@");
    tower.flyingUntil = 0;
    tower.reflectProjectiles = !!definition.reflectProjectiles;
    // Switching forms starts a fresh attack/arming cycle, never a free immediate attack.
    tower.lastFire = runtime.battleTime;
    tower.nextProduceAt = definition.produceEvery ? runtime.battleTime + definition.produceEvery : Infinity;
    tower.armedAt = definition.armTime ? runtime.battleTime + definition.armTime : 0;
    settleTowerMoveVisual(tower, runtime.battleTime);
    runtime.onChanged?.(tower, definition);
    changed = true;
  }
  return changed;
}
