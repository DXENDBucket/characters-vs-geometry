import type { CardId, Tower, TowerFinalStats } from "../types";

export interface TowerBehaviorContext {
  type: CardId;
  level: number;
  stats: TowerFinalStats;
}

const actionContexts = new WeakMap<object, TowerBehaviorContext>();

export function towerActionContext(tower: object) { return actionContexts.get(tower); }

export function withTowerActionContext<T>(tower: Tower, context: TowerBehaviorContext, run: () => T): T {
  const previous = actionContexts.get(tower);
  actionContexts.set(tower, context);
  try { return run(); }
  finally {
    if (previous) actionContexts.set(tower, previous);
    else actionContexts.delete(tower);
  }
}

// Card identity governs price, upgrades and unlocks; only behavior can be copied.
export function towerBehaviorType(tower: Pick<Tower, "type" | "copiedType">) {
  return actionContexts.get(tower)?.type ?? towerFormType(tower);
}

export function towerFormType(tower: Pick<Tower, "type" | "copiedType">) {
  return tower.type === "@" ? tower.copiedType ?? "@" : tower.type;
}

export function isNumberTower(tower: Pick<Tower, "type" | "copiedType" | "numberValue">) {
  const type = towerFormType(tower);
  return type === "1" || (type === "+" && tower.numberValue !== undefined);
}

export function numberTowerValue(tower: Pick<Tower, "level" | "numberValue">) {
  return Math.max(1, Math.floor(tower.numberValue ?? tower.level));
}

export function towerHasSkillBehavior(tower: Tower, type: CardId) {
  return towerBehaviorType(tower) === type ||
    ((isNumberTower(tower) || towerFormType(tower) === "+") && tower.imitatedSkills?.includes(type) === true);
}
