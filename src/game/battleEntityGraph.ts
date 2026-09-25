import { classifyBattleData } from "./battleDataSchema";
import { BattleEntityIds, parseBattleEntityId, type BattleEntity, type BattleEntityEntry,
  type BattleEntityIdState, type BattleEntityKind, type BattleEntityRef } from "./battleEntityIds";
import type { BattleEntities } from "./battleWorld";
import type { EdgeTower } from "../types";

// Uses the same field allowlists as saves; never traverses Phaser bodies or display caches.
export function collectBattleEntities(root: unknown): BattleEntityEntry[] {
  const entries: BattleEntityEntry[] = [], seen = new Set<object>(), pending = [root];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (seen.size > 250000) throw new Error("Battle data graph too large");
    const classification = classifyBattleData(value);
    if (classification.entityKind) entries.push({ kind: classification.entityKind, entity: value as BattleEntity });
    const keys = Object.keys(value);
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      if (classification.include && !classification.include.has(key)) continue;
      const child = (value as Record<string, unknown>)[key];
      if (child && typeof child === "object") pending.push(child);
    }
  }
  return entries;
}

export function restoreBattleEntityIds(state: { entityIds?: BattleEntityIdState }, ids = new BattleEntityIds()) {
  ids.restore(collectBattleEntities(state), state.entityIds);
  state.entityIds = ids.snapshot();
  return ids;
}

type EntityShapes<E extends BattleEntities> = E & { edge: EdgeTower };

// Build at command/synchronization boundaries, not each frame. Historical action sources are included.
export class BattleEntityIndex<E extends BattleEntities = BattleEntities> {
  private readonly entities = new Map<string, BattleEntityEntry>();
  private readonly references = new WeakMap<BattleEntity, BattleEntityRef>();

  constructor(root: unknown) {
    for (const entry of collectBattleEntities(root)) {
      const id = entry.entity.entityId, parsed = parseBattleEntityId(id);
      if (!parsed || parsed.kind !== entry.kind || this.entities.has(id!)) throw new Error("Invalid battle entity index");
      this.entities.set(id!, entry);
      this.references.set(entry.entity, { kind: entry.kind, id: id! });
    }
  }

  get size() { return this.entities.size; }

  resolve<K extends BattleEntityKind>(reference: BattleEntityRef<K>): EntityShapes<E>[K] | undefined {
    const parsed = parseBattleEntityId(reference.id);
    if (!parsed || parsed.kind !== reference.kind) return undefined;
    const entry = this.entities.get(reference.id);
    return entry?.kind === reference.kind ? entry.entity as EntityShapes<E>[K] : undefined;
  }

  reference(entity: BattleEntity): BattleEntityRef {
    const reference = this.references.get(entity);
    if (!reference) throw new Error("Entity is not in this battle graph");
    return { ...reference };
  }
}
