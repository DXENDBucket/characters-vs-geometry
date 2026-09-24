import type { EnemyDefinition, EnemyFamily, EnemyKind } from "../types";
import { enemyKindAtRank } from "../game/enemyIdentity";
import { enemyWeightUpgradeCount } from "../game/enemyWeight";
import { enemyArchetypes } from "./enemyArchetypes";

export function enemyDefinitionAtRank(family: EnemyFamily, rank: number = 1): EnemyDefinition {
  const kind = enemyKindAtRank(family, rank);
  const { base, growth } = enemyArchetypes[family];
  const definition: EnemyDefinition = { kind, ...base };
  if (family !== "solarBomb") definition.label = String(rank);
  for (const field of Object.keys(growth) as Array<keyof typeof growth>) {
    const upgrades = field === "weight" ? enemyWeightUpgradeCount(rank) : rank - 1;
    const value = (base[field] ?? (field === "speedMultiplier" ? 1 : 0)) + growth[field]! * upgrades;
    if (!Number.isFinite(value)) throw new RangeError(`Enemy stat overflow: ${kind}.${field}`);
    definition[field] = value;
  }
  return definition;
}

// This catalog remains finite for menus and validation; it is not the runtime rank limit.
export const enemyDefinitions: Partial<Record<EnemyKind, EnemyDefinition>> = {};
for (const family of Object.keys(enemyArchetypes) as EnemyFamily[]) {
  for (let rank = 1; rank <= enemyArchetypes[family].catalogRanks; rank += 1) {
    const definition = enemyDefinitionAtRank(family, rank);
    enemyDefinitions[definition.kind] = definition;
  }
}
