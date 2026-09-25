import * as battleMath from "./battleMath";
import type { CardDefinition, CardId, StoredTowerShot } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { NativeTowerActionDataEvent, TowerActionDataEvent } from "./towerActions";
import type { TowerCombatRuntime } from "./towerCombatRuntime";
import type { TriggerTowerRuntime } from "./triggerTowerRules";
import { triggerShockTower, triggerTrapTower } from "./triggerTowerRules";
import { cardBehaviorsById } from "./cardBehaviorRules";
import { getHitProductionAmount, getProductionAmount, towerFacingDirection } from "./towerRules";
import { withTowerActionContext, towerBehaviorType } from "./towerIdentity";
import type { ProjectileCircuitSimulation } from "./projectileCircuitRules";
import { forEachProjectileHit } from "./projectileIntegrity";
import { getBlockedEnemies, getLaneRepelTargets, getShiftTargets } from "./towerTargeting";
import { enemyCanBeLoaded } from "./enemyContainerRules";
import { inFriendlyRange } from "./towerTopology";
import { changeTowerHealth } from "./towerHealthRules";

export interface PipelineActionRuntime {
  combat: TowerCombatRuntime;
  trigger: TriggerTowerRuntime;
  getDefinition: (type: CardId) => CardDefinition;
  skill: (tower: Tower, event: Extract<NativeTowerActionDataEvent, { kind: "skill" }>) => void;
  targeted: (type: CardId, tower: Tower, level: number) => void;
  detonate: (tower: Tower) => void;
  reflect: (tower: Tower, projectile: Extract<NativeTowerActionDataEvent, { kind: "reflection" }>["projectile"]) => void;
}

export function pipelineActionSelfCost(tower: Tower, definition: CardDefinition, runtime: TowerCombatRuntime) {
  let count = 0;
  if (definition.id === "L") count = getShiftTargets(tower, runtime.enemies).length;
  if (definition.id === "n") count = getLaneRepelTargets(tower, runtime.enemies).length;
  if (definition.id === "N" || definition.id === "q") {
    const targets = getBlockedEnemies(tower, runtime.towers, runtime.enemies, runtime.occupied);
    count = definition.id === "q" ? targets.filter(enemyCanBeLoaded).length : targets.length;
  }
  return count * (definition.selfDamage ?? 400);
}

export function routePipelineTowerAction(tower: Tower, event: TowerActionDataEvent,
  circuit: ProjectileCircuitSimulation, combat: TowerCombatRuntime, getDefinition: (id: CardId) => CardDefinition) {
  if (!circuit.captureAction(tower, event)) return false;
  const definition = getDefinition(towerBehaviorType(tower));
  const cost = event.kind === "attack" ? pipelineActionSelfCost(tower, definition, combat) : 0;
  const perHit = definition.selfDamage ?? 400;
  for (let remaining = cost; remaining > 0 && tower.inPlay; remaining -= perHit) {
    combat.damageTower(tower, perHit, definition.selfDamageType ?? "true");
  }
  return true;
}

export function healPipelineArea(tower: Tower, amount: number, runtime: TowerCombatRuntime) {
  let healed = false;
  for (const target of runtime.towers) {
    if (!target.inPlay || target.transient || !inFriendlyRange(tower, target, 2, true)) continue;
    if (changeTowerHealth(target, amount, runtime.presentation.health) > 0) {
      runtime.presentation.heal(target.x, target.y); healed = true;
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

export function emitPipelineShot(shot: StoredTowerShot, outlet: Tower, runtime: PipelineActionRuntime) {
  if (shot.action) {
    executePipelineAction(shot, outlet, runtime);
    return;
  }
  const direction = towerFacingDirection(outlet), x = outlet.x + direction * 26;
  const projectile = runtime.combat.createProjectile({ ...shot, x, y: outlet.y, lane: outlet.lane,
    speed: battleMath.hypot(shot.vx, shot.vy), angleDegrees: battleMath.atan2(shot.vy, shot.vx * direction) * 180 / Math.PI,
    maxX: x + direction * shot.remainingRange, limitDirection: direction });
  projectile.sourceBehaviorType = shot.sourceBehaviorType;
  projectile.circuitChecked = true;
  runtime.combat.projectiles.push(projectile);
}
