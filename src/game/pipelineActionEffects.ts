import type { CardDefinition, CardId, StoredTowerShot, Tower } from "../types";
import type { NativeTowerActionEvent } from "./towerActions";
import type { CombatRuntime } from "./combatRuntime";
import type { TriggerTowerRuntime } from "./triggerTowers";
import { triggerShockTower, triggerTrapTower } from "./triggerTowers";
import { cardBehaviorsById } from "./cardBehaviors";
import { getHitProductionAmount, getProductionAmount } from "./towerRules";
import { withTowerActionContext } from "./towerIdentity";
import { forEachProjectileHit } from "./projectileIntegrity";
import { getBlockedEnemies, getLaneRepelTargets, getShiftTargets } from "./targeting";
import { enemyCanBeLoaded } from "./enemyContainers";
import { inFriendlyRange } from "./towerTopology";
import { changeTowerHealth } from "./towerHealth";
import { makeHealParticles } from "../render/combatEffects";

export interface PipelineActionRuntime {
  combat: CombatRuntime;
  trigger: TriggerTowerRuntime;
  getDefinition: (type: CardId) => CardDefinition;
  skill: (tower: Tower, event: Extract<NativeTowerActionEvent, { kind: "skill" }>) => void;
  targeted: (type: CardId, tower: Tower, level: number) => void;
  detonate: (tower: Tower) => void;
  reflect: (tower: Tower, projectile: Extract<NativeTowerActionEvent, { kind: "reflection" }>["projectile"]) => void;
}

export function pipelineActionSelfCost(tower: Tower, definition: CardDefinition, runtime: CombatRuntime) {
  let count = 0;
  if (definition.id === "L") count = getShiftTargets(tower, runtime.enemies).length;
  if (definition.id === "n") count = getLaneRepelTargets(tower, runtime.enemies).length;
  if (definition.id === "N" || definition.id === "q") {
    const targets = getBlockedEnemies(tower, runtime.towers, runtime.enemies, runtime.occupied);
    count = definition.id === "q" ? targets.filter(enemyCanBeLoaded).length : targets.length;
  }
  return count * (definition.selfDamage ?? 400);
}

export function healPipelineArea(tower: Tower, amount: number, runtime: CombatRuntime) {
  let healed = false;
  for (const target of runtime.towers) {
    if (!target.inPlay || target.transient || !inFriendlyRange(tower, target, 2, true)) continue;
    if (changeTowerHealth(target, amount) > 0) {
      makeHealParticles(runtime.scene, target.x, target.y); healed = true;
    }
  }
  return healed;
}

export function executePipelineAction(shot: StoredTowerShot, outlet: Tower, runtime: PipelineActionRuntime) {
  const action = shot.action;
  if (!action || !outlet.inPlay) return;
  const definition = { ...runtime.getDefinition(action.type), selfDamage: 0 };
  const combat = runtime.combat, firstProjectile = combat.projectiles.length;
  forEachProjectileHit(shot, damage => {
    if (!outlet.inPlay) return;
    const ratio = action.baseDamage > 0 ? damage / action.baseDamage : 1;
    const stats = { ...action.stats, attackPower: action.stats.attackPower * ratio, damageType: shot.damageType };
    withTowerActionContext(outlet, { type: action.type, level: action.level, stats }, () => {
      const event = action.event;
      switch (event.kind) {
        case "attack": cardBehaviorsById[action.type].execute(outlet, definition, combat, 1); break;
        case "production": combat.gainChars(getProductionAmount(outlet, definition), outlet.x, outlet.y - 28); break;
        case "hitProduction": combat.gainChars(getHitProductionAmount(outlet, definition), outlet.x, outlet.y - 28); break;
        case "shock": triggerShockTower({ ...runtime.trigger, onTowerAction: undefined, removeTower: () => {} }, outlet); break;
        case "trap": triggerTrapTower({ ...runtime.trigger, onTowerAction: undefined, removeTower: () => {} }, outlet, event.target); break;
        case "detonation": runtime.detonate(outlet); break;
        case "targeted": runtime.targeted(action.type, outlet, action.level); break;
        case "retaliation":
          if (event.target.inPlay) combat.damageEnemy(event.target, damage, shot.damageType, shot.sourceTower);
          break;
        case "reflection": {
          const projectile = { ...event.projectile, damage: event.projectile.damage * ratio,
            partialHitDamage: event.projectile.partialHitDamage === undefined ? undefined : event.projectile.partialHitDamage * ratio,
            initialDamageBudget: undefined };
          runtime.reflect(outlet, projectile); break;
        }
        case "skill":
          (outlet.pipelineSkillContexts ??= {})[action.type] = { level: action.level, stats };
          runtime.skill(outlet, event); break;
      }
    });
  });
  for (const projectile of combat.projectiles.slice(firstProjectile)) {
    projectile.circuitChecked = true;
    projectile.sourceBehaviorType = action.type;
    projectile.sourceTower = shot.sourceTower;
  }
}
