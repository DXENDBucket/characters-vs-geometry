import type { CubeBoss, Enemy, Tower } from "../types";
import type { BattleSaveState } from "./battleSaveState";
import type { EnemyProjectileState, MortarProjectileState, ProjectileState } from "./projectileState";
import { rankedBossFamily } from "../bosses/bossRanks";
import { encodeSaveGraph } from "./saveGraph";

const towerVisuals = new Set<string>(["body", "border", "label", "facingIcon", "autoUpgradeBorder", "trueDamageBorder",
  "flyingHalo", "hpFill", "negativeHpBack", "negativeHpFill", "rangeBorder", "levelText"] satisfies (keyof Tower)[]);
const enemyVisuals = new Set<string>(["body", "shape", "statusBorder", "frozenBorder", "powerIcon", "sunderIcon",
  "armorIcon", "magicResistanceIcon", "flyingHalo", "statusMultiplierCache"] satisfies (keyof Enemy)[]);
const bossVisuals = new Set<string>(["body", "frame", "labelText"] satisfies (keyof CubeBoss)[]);

// Record covers optional fields too. Filtering retains the original object's field order and graph IDs.
const projectileFields = new Set(Object.keys({
  circuitChecked: true, sourceBehaviorType: true, lastGatheredAt: true,
  type: true, lane: true, x: true, y: true, vx: true, vy: true,
  damage: true, hitCount: true, partialHitDamage: true, initialDamageBudget: true,
  damageType: true, debuff: true, debuffDuration: true, splashRadius: true,
  maxX: true, limitDirection: true, targetEnemy: true, targetBossPart: true,
  sourceTower: true, speed: true, acceleration: true, maxSpeed: true
} satisfies Record<keyof ProjectileState, true>));
const enemyProjectileFields = new Set(Object.keys({
  lastGatheredAt: true, appearance: true, splashRadius: true,
  damage: true, hitCount: true, partialHitDamage: true, initialDamageBudget: true,
  x: true, y: true, vx: true, damageType: true, sourceLane: true
} satisfies Record<keyof EnemyProjectileState, true>));
const mortarFields = new Set(Object.keys({
  damage: true, hitCount: true, partialHitDamage: true, initialDamageBudget: true,
  owner: true, x: true, y: true, fromX: true, fromY: true, targetX: true, targetY: true,
  progress: true, duration: true, damageType: true, rangeX: true, rangeY: true,
  marker: true, markerText: true, markerTextColor: true, sourceEnemy: true, sourceTower: true,
  targetEnemy: true, targetTower: true, singleTarget: true, hitRadius: true, radialFalloff: true,
  debuff: true, debuffDuration: true, shiftSelfDamageApplied: true
} satisfies Record<keyof MortarProjectileState, true>));

export function captureBattleSnapshot(state: BattleSaveState) {
  return encodeSaveGraph(state, object => {
    const value = object as Record<string, unknown>;
    if (typeof value.id === "string" && value.id.startsWith("tower:")) return { kind: "tower", omit: towerVisuals };
    if ("kind" in value && "waveNumber" in value) return { kind: "enemy", omit: enemyVisuals };
    if ("advanceMinionKind" in value && "rank" in value) {
      if (!rankedBossFamily(value.kind) && value.kind !== "icosahedron" && value.kind !== "del") throw new Error("Unsupported boss save");
      return { kind: "boss", omit: bossVisuals };
    }
    if ("owner" in value && "fromX" in value && "progress" in value) return { kind: "mortar", include: mortarFields };
    if ("sourceLane" in value && "vx" in value) return { kind: "enemyProjectile", include: enemyProjectileFields };
    if ("type" in value && "limitDirection" in value && "vx" in value) return { kind: "projectile", include: projectileFields };
    if ("body" in value || (!Array.isArray(object) && Object.getPrototypeOf(object) !== Object.prototype)) {
      throw new Error("Non-data object in save");
    }
    return { kind: Array.isArray(object) ? "array" : "object" };
  });
}
