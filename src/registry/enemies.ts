import { enemyDefinitionAtRank, enemyDefinitions } from "../data/enemies";
import { enemyArchetypes, type EnemyAttackMode } from "../data/enemyArchetypes";
import { enemyKindAtRank, parseEnemyKind } from "../game/enemyIdentity";
import type { DamageType, EnemyDefinition, EnemyFamily, EnemyKind } from "../types";

export type { EnemyFamily, EnemyAttackMode };
export { enemyKindAtRank, isEnemyKind } from "../game/enemyIdentity";

export interface BlockedDetonation {
  delay: number;
  damage: number;
  damageType: DamageType;
}

export interface EnemyRegistration {
  definition: EnemyDefinition;
  family: EnemyFamily;
  rank: number;
  nameKey: string;
  attackMode: EnemyAttackMode;
  blockedDetonation?: BlockedDetonation;
  promotionKind?: EnemyKind;
  splitSpawnKind?: EnemyKind;
  leader?: boolean;
}

function createRegistration(kind: EnemyKind): EnemyRegistration {
  const identity = parseEnemyKind(kind);
  if (!identity) throw new RangeError(`Unknown enemy kind: ${kind}`);
  const { family, rank } = identity;
  const archetype = enemyArchetypes[family];
  const definition = enemyDefinitions[kind] ?? enemyDefinitionAtRank(family, rank);
  const registration: EnemyRegistration = {
    definition, family, rank, nameKey: `enemy.${kind}`, attackMode: archetype.attackMode
  };
  if (archetype.leader) registration.leader = true;
  // Default promotion metadata stays capped; Cube skills resolve their own rank-aware limit.
  if (rank < (archetype.promotionMaxRank ?? 0)) registration.promotionKind = enemyKindAtRank(family, rank + 1);
  if (archetype.splitToPreviousRank && rank > 1) registration.splitSpawnKind = enemyKindAtRank(family, rank - 1);
  if (archetype.blockedDetonationDelay !== undefined) {
    registration.blockedDetonation = { delay: archetype.blockedDetonationDelay, damage: definition.damage, damageType: definition.damageType };
  }
  return registration;
}

export const allEnemyDefinitions = enemyDefinitions;
export const allEnemyRegistrations = Object.fromEntries(
  Object.keys(enemyDefinitions).map(kind => [kind, createRegistration(kind as EnemyKind)])
) as Partial<Record<EnemyKind, EnemyRegistration>>;

const dynamicRegistrations = new Map<EnemyKind, EnemyRegistration>();
const MAX_DYNAMIC_REGISTRATIONS = 512;

export function getEnemyRegistration(kind: EnemyKind) {
  const known = Object.hasOwn(allEnemyRegistrations, kind) ? allEnemyRegistrations[kind] : undefined;
  if (known) return known;
  const cached = dynamicRegistrations.get(kind);
  if (cached) return cached;
  const registration = createRegistration(kind);
  // Endless runs must not retain every rank ever encountered.
  if (dynamicRegistrations.size >= MAX_DYNAMIC_REGISTRATIONS) {
    dynamicRegistrations.delete(dynamicRegistrations.keys().next().value!);
  }
  dynamicRegistrations.set(kind, registration);
  return registration;
}

export function getEnemyDefinition(kind: EnemyKind) {
  return getEnemyRegistration(kind).definition;
}

export function enemyRank(kind: EnemyKind) { return getEnemyRegistration(kind).rank; }
export function enemyFamily(kind: EnemyKind) { return getEnemyRegistration(kind).family; }
export function enemyPromotionKind(kind: EnemyKind) { return getEnemyRegistration(kind).promotionKind; }
export function enemySplitSpawnKind(kind: EnemyKind) { return getEnemyRegistration(kind).splitSpawnKind; }
export function enemyIsRanged(kind: EnemyKind) { return getEnemyRegistration(kind).attackMode === "ranged"; }
export function enemyIsMortar(kind: EnemyKind) { return getEnemyRegistration(kind).attackMode === "mortar"; }
export function enemyIsLaser(kind: EnemyKind) { return getEnemyRegistration(kind).attackMode === "laser"; }
export function enemyIsBlockedDetonator(kind: EnemyKind) { return getEnemyRegistration(kind).attackMode === "blockedDetonator"; }
export function enemyIsSiegeRam(kind: EnemyKind) { return getEnemyRegistration(kind).attackMode === "siegeRam"; }
export function enemyIsMace(kind: EnemyKind) { return getEnemyRegistration(kind).attackMode === "mace"; }
export function enemyIsLeader(kind: EnemyKind) {
  const registration = getEnemyRegistration(kind);
  return registration.leader === true || registration.attackMode === "leader";
}
export function enemyIsBossCompanion(kind: EnemyKind) { return getEnemyRegistration(kind).attackMode === "companion"; }
export function enemyBlockedDetonation(kind: EnemyKind) { return getEnemyRegistration(kind).blockedDetonation; }
