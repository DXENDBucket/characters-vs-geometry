import type { BattlePolicy } from "./battlePolicy";
import { copyBattleParticipants, validBattleActorId, type BattleOperationActor } from "./battleParticipants";
import type { TowerState } from "./towerState";

export interface BattleOwnedEntity { ownerId?: string }

export function canControlBattleEntity(policy: BattlePolicy, actorId: string | undefined, entity: BattleOwnedEntity) {
  return policy.towerAccess !== "owner" || entity.ownerId === undefined || entity.ownerId === actorId;
}

export function canLinkBattleOwners(policy: BattlePolicy, a: BattleOwnedEntity, b: BattleOwnedEntity) {
  return policy.towerAccess !== "owner" || a.ownerId === b.ownerId;
}

export function inheritBattleOwner(target: BattleOwnedEntity, source: BattleOwnedEntity) {
  if (source.ownerId === undefined) delete target.ownerId;
  else target.ownerId = source.ownerId;
}

// Checks historical action sources and suspended towers too, not just the active board.
export function validateBattleOwners(towers: Iterable<TowerState>, edges: Iterable<BattleOwnedEntity>,
  participants?: readonly BattleOperationActor[], policy?: BattlePolicy) {
  const actors = new Set(copyBattleParticipants(participants)
    .filter(actor => policy?.walletMode !== "individual" || actor.permissions.includes("build")).map(actor => actor.id));
  const check = (entity: BattleOwnedEntity) => {
    if (entity.ownerId !== undefined && (!validBattleActorId(entity.ownerId) || !actors.has(entity.ownerId))) {
      throw new Error("Unknown battle entity owner");
    }
  };
  const groups = new Map<number, string | undefined>();
  for (const tower of towers) {
    check(tower);
    if (policy?.towerAccess !== "owner" || !tower.mirrorGroupId) continue;
    if (groups.has(tower.mirrorGroupId) && groups.get(tower.mirrorGroupId) !== tower.ownerId) {
      throw new Error("Mirror network crosses battle ownership");
    }
    groups.set(tower.mirrorGroupId, tower.ownerId);
  }
  for (const edge of edges) check(edge);
}
