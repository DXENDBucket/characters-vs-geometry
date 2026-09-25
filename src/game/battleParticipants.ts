export const BATTLE_PERMISSIONS = ["build", "edit", "move", "skill", "time", "settings", "loadout", "debug", "tutorial"] as const;
export type BattleOperationPermission = typeof BATTLE_PERMISSIONS[number];
export interface BattleOperationActor { readonly id: string; readonly permissions: readonly BattleOperationPermission[] }
export const LOCAL_BATTLE_ACTOR: BattleOperationActor = Object.freeze({ id: "local", permissions: BATTLE_PERMISSIONS });
Object.freeze(BATTLE_PERMISSIONS);
export const DEFAULT_BATTLE_PARTICIPANTS = Object.freeze([LOCAL_BATTLE_ACTOR]);
export const MAX_BATTLE_PARTICIPANTS = 16;
export const validBattleActorId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);

export function battleBuilderIds(participants: readonly BattleOperationActor[]) {
  return participants.filter(actor => actor.permissions.includes("build")).map(actor => actor.id).sort();
}

export function validBattleParticipants(value: unknown): value is readonly BattleOperationActor[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_BATTLE_PARTICIPANTS && Array.from(value).every(actor =>
    actor && Object.getPrototypeOf(actor) === Object.prototype && Object.keys(actor).length === 2 &&
    Object.hasOwn(actor, "id") && Object.hasOwn(actor, "permissions") && validBattleActorId(actor.id) &&
    Array.isArray(actor.permissions) && actor.permissions.length <= BATTLE_PERMISSIONS.length &&
    Array.from(actor.permissions).every(permission => BATTLE_PERMISSIONS.includes(permission as BattleOperationPermission)) &&
    new Set(actor.permissions).size === actor.permissions.length) && new Set(value.map(actor => actor.id)).size === value.length;
}

export function copyBattleParticipants(value: readonly BattleOperationActor[] = DEFAULT_BATTLE_PARTICIPANTS) {
  if (!validBattleParticipants(value)) throw new Error("Invalid battle participants");
  return Object.freeze(value.map(actor => Object.freeze({ id: actor.id, permissions: Object.freeze([...actor.permissions]) })));
}

export function sameBattleParticipants(a: readonly BattleOperationActor[], b: readonly BattleOperationActor[]) {
  return a.length === b.length && a.every(actor => {
    const other = b.find(value => value.id === actor.id);
    return other && actor.permissions.length === other.permissions.length && actor.permissions.every(p => other.permissions.includes(p));
  });
}
