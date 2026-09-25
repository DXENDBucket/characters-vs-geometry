import type { CardDefinition, StoredTowerShot } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { NativeTowerActionDataEvent } from "./towerActions";
import { towerActionContext, towerFormType } from "./towerIdentity";
import { SPELL_MORTAR_SHOT_COUNT } from "../config";
import { projectileDamageBudget } from "./projectileIntegrity";
import { scaledByEffectiveUpgrades } from "./upgrades";
import { towerAttackAmount } from "./unitStatRules";

export function storeTowerAction(source: Tower, definition: CardDefinition, event: NativeTowerActionDataEvent, time: number): StoredTowerShot {
  const context = towerActionContext(source);
  const stats = { ...(context?.stats ?? source.finalStats) };
  const level = context?.level ?? Math.max(1, source.level + source.levelBonus + source.mirrorLevelBonus);
  const type = context?.type ?? towerFormType(source);
  const attack = towerAttackAmount(source, definition);
  let damage = 0;
  if (event.kind === "attack" && definition.category === "attack" || event.kind === "shock" || event.kind === "trap") damage = attack;
  if (event.kind === "attack" && type === "x") damage *= 4;
  if (event.kind === "shock" && !definition.triggerDebuff && type !== "l") {
    damage *= scaledByEffectiveUpgrades(definition.triggerCount ?? 10, level);
  }
  if (event.kind === "retaliation") damage = towerAttackAmount(source, definition, definition.reflectAttackMultiplier ?? 1);
  if (event.kind === "reflection") damage = projectileDamageBudget(event.projectile);
  if (event.kind === "skill" && type === "S") damage = attack * SPELL_MORTAR_SHOT_COUNT;
  const damageType = time < source.trueDamageUntil ? "true" :
    event.kind === "reflection" ? event.projectile.damageType : definition.damageType ?? "physical";
  return { type: "bolt", sourceTower: source, sourceBehaviorType: type, damage, damageType,
    hitCount: event.kind === "attack" ? event.hitCount ?? 1 : 1,
    vx: 1, vy: 0, splashRadius: 0, remainingRange: 0,
    action: { type, level, stats, event: { ...event }, baseDamage: damage } };
}
