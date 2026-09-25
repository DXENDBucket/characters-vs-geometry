import type { CardId } from "../types";
import type { BattleRuntime } from "./battleRuntime";
import type { BattleOperationPermission } from "./battleParticipants";
import { canControlBattleEntity, type BattleOwnedEntity } from "./battleOwnership";
import { battleCardTime } from "./battleLoadout";
import { getCardDefinition } from "../registry/cardDefinitions";

// Presentation reads never enter the runtime's authoritative command actor context.
export class BattlePlayerView {
  constructor(private readonly runtime: BattleRuntime, readonly actorId: string) {
    if (!runtime.session.actor(actorId)) throw new Error("Unknown battle view actor");
  }
  get resources() { return this.runtime.players.get(this.actorId); }
  get loadout() { return this.resources.loadout; }
  get battleTime() { return this.runtime.world.battleTime; }
  get cardTime() { return this.resources.cardTime; }
  get rawChars() { return this.runtime.world.economy.balance(this.actorId); }
  get chars() { return this.runtime.world.effectiveChars(this.actorId); }
  cardTimeFor(id: CardId) { return battleCardTime(getCardDefinition(id), this); }
  can(permission: BattleOperationPermission) { return !!this.runtime.session.actor(this.actorId)?.permissions.includes(permission); }
  canControl(entity: BattleOwnedEntity) { return canControlBattleEntity(this.runtime.session.policy, this.actorId, entity); }
  autoEnabledFor(entity: BattleOwnedEntity) {
    return this.runtime.players.get(entity.ownerId).auto.autoUpgradeEnabled;
  }
}
