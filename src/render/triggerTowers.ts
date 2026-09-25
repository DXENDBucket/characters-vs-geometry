import type { Enemy, CubeBoss, Tower } from "../types";
import type { TowerActionEvent } from "../game/towerActions";
import type { TriggerTowerRuntime as LiveRuntime } from "../game/triggerTowers";
import type { TriggerTowerRuntime } from "../game/triggerTowerRules";
import { makeFreezePulse, makeReversalPulse, makeShockPulse, makeTrapBurst } from "./combatEffects";
const adapters = new WeakMap<LiveRuntime, TriggerTowerRuntime>();
export function bindTriggerTowerRuntime(live: LiveRuntime, runtime: TriggerTowerRuntime) {
  runtime.presentation = triggerTowerRuntime(live).presentation;
  adapters.set(live, runtime);
}

export function triggerTowerRuntime(live: LiveRuntime): TriggerTowerRuntime {
  let runtime = adapters.get(live);
  if (!runtime) {
    runtime = {
      get enemies() { return live.enemies; }, get boss() { return live.boss; },
      get battleTime() { return live.battleTime; }, get gameOver() { return live.gameOver; },
      presentation: {
        freeze: (x, y, radius) => makeFreezePulse(live.scene, x, y, radius),
        reversal: (x, y, radius) => makeReversalPulse(live.scene, x, y, radius),
        shock: (x, y, rx, ry, type) => makeShockPulse(live.scene, x, y, rx, ry, type),
        trap: (x, y, type) => makeTrapBurst(live.scene, x, y, type)
      },
      getDefinition: id => live.getDefinition(id),
      scheduleBattleAction: (delay, action) => live.scheduleBattleAction(delay, action),
      onTowerAction: (tower, event) => live.onTowerAction?.(tower as Tower, event as TowerActionEvent),
      removeTower: tower => live.removeTower(tower as Tower),
      damageEnemy: (enemy, damage, type, source) => live.damageEnemy(enemy as Enemy, damage, type, source as Tower | undefined),
      damageBoss: (damage, type, part) => live.damageBoss(damage, type, part as CubeBoss | undefined)
    };
    adapters.set(live, runtime);
  }
  return runtime;
}
