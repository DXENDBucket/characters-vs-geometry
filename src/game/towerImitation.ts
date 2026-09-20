import type { CardDefinition, CardId, Tower } from "../types";
import type { ImitationBehavior, TowerActionEvent } from "./towerActions";
import type { CombatRuntime } from "./combatRuntime";
import type { TriggerTowerRuntime } from "./triggerTowers";
import { triggerShockTower, triggerTrapTower } from "./triggerTowers";
import { isNumberTower } from "./towerIdentity";
import { towerAttackAmount, withTowerBehavior } from "./unitStats";
import { getHitProductionAmount, getProductionAmount, towerDamageType } from "./towers";

export interface TowerImitationRuntime {
  combat: CombatRuntime;
  trigger: TriggerTowerRuntime;
  getDefinition: (id: CardId) => CardDefinition;
  startVolley: (tower: Tower, behavior: ImitationBehavior) => void;
  skill: (tower: Tower, event: Extract<TowerActionEvent, { kind: "skill" }>) => void;
  targeted: (type: CardId, tower: Tower, level: number) => void;
  detonate: (tower: Tower) => void;
  reflect: (tower: Tower, event: Extract<TowerActionEvent, { kind: "reflection" }>) => void;
}

export function executeTowerImitation(tower: Tower, behavior: ImitationBehavior, event: TowerActionEvent, runtime: TowerImitationRuntime) {
  if (!tower.inPlay || !isNumberTower(tower) || !tower.numberMemory?.some(entry => entry.type === behavior.type)) return;
  const definition = runtime.getDefinition(behavior.type);
  const { combat } = runtime;
  withTowerBehavior(tower, definition, behavior.level, () => {
    switch (event.kind) {
      case "attack": runtime.startVolley(tower, behavior); break;
      case "skill": runtime.skill(tower, event); break;
      case "shock": triggerShockTower({ ...runtime.trigger, removeTower: () => {} }, tower); break;
      case "trap": triggerTrapTower({ ...runtime.trigger, removeTower: () => {} }, tower, event.target); break;
      case "targeted": runtime.targeted(behavior.type, tower, behavior.level); break;
      case "detonation": runtime.detonate(tower); break;
      case "reflection": runtime.reflect(tower, event); break;
      case "production": combat.gainChars(getProductionAmount(tower, definition), tower.x, tower.y - 28); break;
      case "hitProduction": combat.gainChars(getHitProductionAmount(tower, definition), tower.x, tower.y - 28); break;
      case "retaliation":
        if (event.target.inPlay) combat.damageEnemy(event.target,
          towerAttackAmount(tower, definition, definition.reflectAttackMultiplier ?? 1),
          towerDamageType(tower, definition.damageType ?? "physical", combat.battleTime), tower);
        break;
    }
  }, combat.towers);
}
