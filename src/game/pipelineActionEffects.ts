import type { CardDefinition, CardId, StoredTowerShot, Tower } from "../types";
import type { NativeTowerActionEvent } from "./towerActions";
import type { CombatRuntime } from "./combatRuntime";
import type { TriggerTowerRuntime } from "./triggerTowers";
import { towerCombatRuntime } from "../render/towerCombat";
import { triggerTowerRuntime } from "../render/triggerTowers";
import * as rules from "./pipelineActionRules";

export interface PipelineActionRuntime {
  combat: CombatRuntime;
  trigger: TriggerTowerRuntime;
  getDefinition: (type: CardId) => CardDefinition;
  skill: (tower: Tower, event: Extract<NativeTowerActionEvent, { kind: "skill" }>) => void;
  targeted: (type: CardId, tower: Tower, level: number) => void;
  detonate: (tower: Tower) => void;
  reflect: (tower: Tower, projectile: Extract<NativeTowerActionEvent, { kind: "reflection" }>["projectile"]) => void;
}
const adapters = new WeakMap<PipelineActionRuntime, rules.PipelineActionRuntime>();
export function pipelineActionRuntime(live: PipelineActionRuntime): rules.PipelineActionRuntime {
  let runtime = adapters.get(live);
  if (!runtime) {
    runtime = {
      get combat() { return towerCombatRuntime(live.combat); },
      get trigger() { return triggerTowerRuntime(live.trigger); },
      getDefinition: id => live.getDefinition(id),
      skill: (tower, event) => live.skill(tower as Tower, event),
      targeted: (type, tower, level) => live.targeted(type, tower as Tower, level),
      detonate: tower => live.detonate(tower as Tower),
      reflect: (tower, projectile) => live.reflect(tower as Tower, projectile as Extract<NativeTowerActionEvent, { kind: "reflection" }>["projectile"])
    };
    adapters.set(live, runtime);
  }
  return runtime;
}
export function pipelineActionSelfCost(tower: Tower, definition: CardDefinition, runtime: CombatRuntime) {
  return rules.pipelineActionSelfCost(tower, definition, towerCombatRuntime(runtime));
}
export function healPipelineArea(tower: Tower, amount: number, runtime: CombatRuntime) {
  return rules.healPipelineArea(tower, amount, towerCombatRuntime(runtime));
}
export function executePipelineAction(shot: StoredTowerShot, outlet: Tower, runtime: PipelineActionRuntime) {
  rules.executePipelineAction(shot, outlet, pipelineActionRuntime(runtime));
}
export function emitPipelineShot(shot: StoredTowerShot, outlet: Tower, runtime: PipelineActionRuntime) {
  rules.emitPipelineShot(shot, outlet, pipelineActionRuntime(runtime));
}
