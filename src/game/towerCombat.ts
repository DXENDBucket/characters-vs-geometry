import type { TowerAttackRuntime } from "./towerCombatRuntime";
import type { TowerVolleyAction } from "./battleActions";
import type { TowerState } from "./towerState";
import { cardBehaviorsById, idleCardBehavior, projectileCardBehavior, slowAuraCardBehavior } from "./cardBehaviorRules";
import { towerBehaviorType } from "./towerIdentity";
import { towerFinalStats } from "./unitStatRules";
import { effectiveTowerLevel } from "./towerRules";
import { attackIntervalMs } from "./attackSpeed";
import { volleyInterval, volleyShotCount } from "./upgrades";
import { volleyTimingCount, volleyHitsAt } from "./volley";

export function advanceTowerAttacks(runtime: TowerAttackRuntime, time: number) {
  for (const tower of runtime.towers) {
    const type = towerBehaviorType(tower), behavior = cardBehaviorsById[type];
    if (behavior === idleCardBehavior) continue;
    const attackInterval = attackIntervalMs(towerFinalStats(tower).attackSpeed);
    if (!(time >= tower.lastFire + attackInterval)) continue;
    if (!behavior.canUse(tower, runtime.getDefinition(type), time, runtime, true)) continue;
    startTowerVolley(runtime, tower, time, attackInterval);
  }
}
function startTowerVolley(runtime: TowerAttackRuntime, tower: TowerState, time: number, attackInterval: number) {
  const totalHits = volleyShotCount(towerBehaviorType(tower), effectiveTowerLevel(tower));
  const shots = volleyTimingCount(totalHits), interval = volleyInterval(attackInterval, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex++) {
    runtime.scheduleBattleAction(shotIndex * interval, {
      type: "volley", tower, hitCount: volleyHitsAt(totalHits, shotIndex), copyRevision: tower.copyRevision
    });
  }
  tower.lastFire = time + (shots - 1) * interval;
}
export function executeTowerVolley(runtime: TowerAttackRuntime, action: TowerVolleyAction) {
  if (action.behavior || !action.tower.inPlay || action.copyRevision !== action.tower.copyRevision) return;
  const type = towerBehaviorType(action.tower), behavior = cardBehaviorsById[type];
  if (behavior !== projectileCardBehavior && behavior !== slowAuraCardBehavior &&
      runtime.onTowerAction?.(action.tower, { kind: "attack", hitCount: action.hitCount })) return;
  behavior.execute(action.tower, runtime.getDefinition(type), runtime, action.hitCount);
}
