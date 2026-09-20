import type { Tower } from "../types";

// Card identity governs price, upgrades and unlocks; only behavior can be copied.
export function towerBehaviorType(tower: Pick<Tower, "type" | "copiedType">) {
  return tower.type === "@" ? tower.copiedType ?? "@" : tower.type;
}
