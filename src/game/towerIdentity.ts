import type { CardId, NumberTowerState, Tower, TowerFinalStats } from "../types";

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
  return isLiteralNumberType(type) || (isNumericOperatorType(type) && tower.numberValue !== undefined);
}

export function isLiteralNumberType(type: CardId) { return type === "0" || type === "1"; }

export function isNumericOperatorType(type: CardId) { return type === "+" || type === "-"; }

export function canUpgradeTowerWithCard(tower: Pick<Tower, "type">, cardId: CardId) {
  return tower.type === cardId;
}

export function supportsTowerAutoUpgrade(tower: Pick<Tower, "type" | "copiedType" | "numberValue">) {
  return towerFormType(tower) === "0" || !isNumberTower(tower);
}

export function numberTowerValue(tower: Pick<Tower, "type" | "copiedType" | "level" | "numberValue">, state: NumberTowerState = tower) {
  return Math.max(0, Math.floor(state.numberValue ?? tower.level - (towerFormType(tower) === "0" ? 1 : 0)));
}

export function numberTowerStoredCount(state: NumberTowerState) {
  return (state.numberMemory ?? []).reduce((total, entry) => total + entry.count, 0);
}

export function numberTowerStates(tower: Pick<Tower, "numberChannels" | "numberValue" | "numberMemory" | "equationLevel">): NumberTowerState[] {
  return tower.numberChannels ? [tower.numberChannels.horizontal, tower.numberChannels.vertical]
    .filter((state): state is NumberTowerState => state?.numberValue !== undefined) : [tower];
}

export function numberTowerMultiplier(tower: Pick<Tower, "type" | "copiedType" | "level" | "equationLevel">, state: NumberTowerState = tower) {
  const plusBonus = isNumericOperatorType(towerFormType(tower)) ? tower.level - 1 : 0;
  return Math.max(1, Math.floor((state.equationLevel ?? 1) + plusBonus));
}

export function numberTowerActionLevel(tower: Pick<Tower, "type" | "copiedType" | "level" | "numberValue" | "equationLevel">, state: NumberTowerState = tower) {
  return numberTowerValue(tower, state) * numberTowerMultiplier(tower, state);
}

export function towerHasSkillBehavior(tower: Tower, type: CardId) {
  if (tower.routedSkills?.[type] !== undefined) return false;
  return towerBehaviorType(tower) === type ||
    ((isNumberTower(tower) || isNumericOperatorType(towerFormType(tower))) && tower.imitatedSkills?.includes(type) === true);
}
