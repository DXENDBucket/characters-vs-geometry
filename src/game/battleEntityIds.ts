export const BATTLE_ENTITY_KINDS = ["tower", "enemy", "boss", "projectile", "enemyProjectile", "mortar", "edge"] as const;
export type BattleEntityKind = typeof BATTLE_ENTITY_KINDS[number];
export interface BattleEntity { entityId?: string }
export interface BattleEntityRef<K extends BattleEntityKind = BattleEntityKind> { kind: K; id: string }
export interface BattleEntityIdState { version: 1; nextId: number }
export interface BattleEntityEntry { kind: BattleEntityKind; entity: BattleEntity }

export function parseBattleEntityId(id: unknown) {
  if (typeof id !== "string") return undefined;
  const match = /^(tower|enemy|boss|projectile|enemyProjectile|mortar|edge):([1-9]\d*)$/.exec(id);
  if (!match) return undefined;
  const sequence = Number(match[2]);
  return Number.isSafeInteger(sequence) && sequence < Number.MAX_SAFE_INTEGER
    ? { kind: match[1] as BattleEntityKind, sequence } : undefined;
}

export function validateBattleEntityIdState(value: BattleEntityIdState) {
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.nextId) || value.nextId < 1) {
    throw new Error("Invalid battle entity allocator");
  }
}

// No strong entity table: expired projectiles are not retained for the duration of an endless battle.
export class BattleEntityIds {
  private nextId = 1;
  private owned = new WeakMap<BattleEntity, BattleEntityRef>();

  identify<T extends BattleEntity>(kind: BattleEntityKind, entity: T): T {
    if (!BATTLE_ENTITY_KINDS.includes(kind)) throw new Error("Invalid battle entity kind");
    const existing = this.owned.get(entity);
    if (existing) {
      if (existing.kind !== kind || entity.entityId !== existing.id) throw new Error("Battle entity identity changed");
      return entity;
    }
    if (entity.entityId !== undefined) throw new Error("Entity must be restored before reuse in a battle");
    if (this.nextId >= Number.MAX_SAFE_INTEGER) throw new Error("Battle entity IDs exhausted");
    entity.entityId = `${kind}:${this.nextId}`;
    this.nextId++;
    this.owned.set(entity, { kind, id: entity.entityId });
    return entity;
  }

  snapshot(): BattleEntityIdState { return { version: 1, nextId: this.nextId }; }

  restore(entries: readonly BattleEntityEntry[], state?: BattleEntityIdState) {
    if (state !== undefined) validateBattleEntityIdState(state);
    let next = state?.nextId ?? 1;
    const ids = new Set<string>(), objects = new Set<BattleEntity>();
    const planned: Array<{ entity: BattleEntity; ref: BattleEntityRef }> = [];
    for (const { kind, entity } of entries) {
      if (!BATTLE_ENTITY_KINDS.includes(kind)) throw new Error("Invalid battle entity kind");
      if (objects.has(entity)) throw new Error("Duplicate battle entity entry");
      objects.add(entity);
      const id = entity.entityId;
      if (id === undefined) {
        if (state) throw new Error("Missing battle entity ID");
        continue;
      }
      const parsed = parseBattleEntityId(id);
      if (!parsed || parsed.kind !== kind || ids.has(id) || (state && parsed.sequence >= state.nextId)) {
        throw new Error("Invalid or duplicate battle entity ID");
      }
      ids.add(id);
      next = Math.max(next, parsed.sequence + 1);
      planned.push({ entity, ref: { kind, id } });
    }
    // Legacy IDs follow data-graph traversal order and never consume simulation RNG.
    for (const { kind, entity } of entries) {
      if (entity.entityId !== undefined) continue;
      if (next >= Number.MAX_SAFE_INTEGER) throw new Error("Battle entity IDs exhausted");
      planned.push({ entity, ref: { kind, id: `${kind}:${next++}` } });
    }
    const owned = new WeakMap<BattleEntity, BattleEntityRef>();
    for (const { entity, ref } of planned) { entity.entityId = ref.id; owned.set(entity, ref); }
    this.nextId = next;
    this.owned = owned;
  }
}

// Transitional live-factory binding. Headless hosts call their world's allocator directly.
const owners = new WeakMap<object, BattleEntityIds>();
export function setBattleEntityIds(owner: object, ids: BattleEntityIds) { owners.set(owner, ids); }
export function identifyBattleEntity<T extends BattleEntity>(owner: object, kind: BattleEntityKind, entity: T): T {
  return owners.get(owner)?.identify(kind, entity) ?? entity;
}

export function withoutBattleEntityAllocation<T>(owner: object, run: () => T): T {
  const ids = owners.get(owner);
  owners.delete(owner);
  try { return run(); }
  finally { if (ids) owners.set(owner, ids); }
}
