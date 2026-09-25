import type { CardDefinition, CardId } from "../types";
import type { BattleCardState } from "./battleLoadout";
import type { TowerState } from "./towerState";
import { deploymentCardId } from "./cardIdentity";
import { facingWithEffects } from "./rules/reversal";
import { towerActionContext, towerBehaviorType, supportsTowerAutoUpgrade } from "./towerIdentity";
import { scaledByEffectiveUpgrades } from "./upgrades";

const SHOCK_TOWER_IDS = new Set<CardId>(["F", "f", "i", "l", "r"]);
export function settleTowerMoveVisual(tower: TowerState, time: number) {
  if (tower.moveVisual && time >= tower.moveVisual.startedAt + tower.moveVisual.duration) tower.moveVisual = undefined;
}

export function isShockTower<T extends TowerState>(tower: T | undefined): tower is T {
  return tower !== undefined && SHOCK_TOWER_IDS.has(towerBehaviorType(tower));
}

export function towerFacingDirection(tower: TowerState) {
  return facingWithEffects(tower, tower.facingDirection ?? 1);
}

export function effectiveTowerLevel(tower: TowerState) {
  return towerActionContext(tower)?.level ?? Math.max(1, tower.level + tower.levelBonus + tower.mirrorLevelBonus);
}

export function getProductionAmount(tower: TowerState, definition: CardDefinition) {
  return scaledByEffectiveUpgrades(definition.produceAmount ?? 0, effectiveTowerLevel(tower));
}

export function getHitProductionAmount(tower: TowerState, definition: CardDefinition) {
  return scaledByEffectiveUpgrades(definition.hitProduceAmount ?? 0, effectiveTowerLevel(tower));
}

export function getShockCount(tower: TowerState, definition: CardDefinition) {
  if (towerBehaviorType(tower) === "l") return 1;
  return scaledByEffectiveUpgrades(definition.triggerCount ?? 10, effectiveTowerLevel(tower));
}

export function getTriggerDebuffDuration(tower: TowerState, definition: CardDefinition) {
  if (definition.triggerDebuff === "reversed") return (definition.triggerDebuffDuration ?? 0) * effectiveTowerLevel(tower);
  return scaledByEffectiveUpgrades(definition.triggerDebuffDuration ?? 0, effectiveTowerLevel(tower));
}

export function isTrapArmed(tower: TowerState, time: number) {
  return towerBehaviorType(tower) === "G" && time >= tower.armedAt;
}

export function findAutoUpgradeTarget<T extends TowerState>(towers: T[], cardId: CardId, eligible?: (tower: T) => boolean) {
  let target: T | undefined;
  for (const tower of towers) {
    if (!tower.inPlay || !tower.autoUpgrade || tower.type !== deploymentCardId(cardId) || !supportsTowerAutoUpgrade(tower)) continue;
    if (eligible && !eligible(tower)) continue;
    if (!target || tower.level < target.level || (tower.level === target.level && tower.placedOrder < target.placedOrder)) target = tower;
  }
  return target;
}

export function isCardReadyForAutoUpgrade(cardState: Pick<BattleCardState, "readyAt">, cardTime: number) {
  return cardTime >= cardState.readyAt;
}

export function towerDamageType(tower: TowerState, damageType: CardDefinition["damageType"], battleTime: number) {
  if (towerActionContext(tower)?.stats.damageType) return towerActionContext(tower)!.stats.damageType!;
  return towerHasTrueDamage(tower, battleTime) ? "true" : damageType ?? "physical";
}

export function towerHasTrueDamage(tower: TowerState, battleTime: number) {
  return battleTime < tower.trueDamageUntil;
}

export function towerIsFlying(tower: TowerState) {
  return tower.flyingUntil > 0;
}

export function setTowerFlyingUntil(tower: TowerState, until: number) {
  tower.flyingUntil = until;
}
