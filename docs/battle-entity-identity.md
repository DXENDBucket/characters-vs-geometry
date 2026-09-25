# Battle Entity Identity

Each `BattleWorld` owns one `BattleEntityIds` allocator. The live scene binds its
factories to that allocator at initialization. Towers, enemies, Boss bodies,
friendly/hostile flat shots, mortars and edge connectors receive `entityId` values
such as `enemy:42`. One monotonically increasing sequence is shared across kinds
within a battlefield. Another world has an independent sequence; IDs are not
globally unique and must eventually be scoped by the protocol's battle identity.

## Lifecycle

- Deployment, generated/mirrored towers, enemy splits, Boss copies, DEL echoes and
  emitted/reflected projectiles allocate new IDs at their actual factory boundary.
- Upgrading, moving, transforming, boarding and returning preserve identity.
- Erasing and replacing an entity at the same position allocates a new ID.
- A pending Boss warning is not a Boss body; allocation occurs at appearance.
- Buffered pipeline payloads are values, not world projectiles. Their historical
  source/target entities and captured reflection projectiles retain their IDs.
- Factories not bound to a world still support isolated previews/tests. A headless
  host explicitly calls `world.entityIds.identify(kind, state)` after construction.

`Tower.id` remains the older placement-order key used by existing combat rules.
It is **not** the universal `entityId`; do not substitute it in `BattleEntityRef`.
This pass deliberately does not rewrite blocking or old save relationship keys.

The allocator keeps object ownership in a WeakMap, not a strong table of every
projectile ever created. Discarded endless-battle entities are not retained by it.
Capture/index creation never assigns IDs or consumes simulation randomness.

## Snapshots And Restore

Snapshots contain `{ entityIds: { version: 1, nextId } }` as well as entity IDs.
Persisting the counter matters even when no entities remain. Version 1 identity
metadata is independent of combat rules version 6; this changes no combat rule.

`battleDataSchema.ts` provides shared, type-checked field allowlists to snapshot
capture and entity graph traversal. They visit cyclic pools, passengers, homing
targets, queued actions and historical sources, without evaluating display fields.
Edges retain their existing plain-object save-node kind for compatibility.

With identity metadata present, capture and restore reject missing, malformed,
wrong-kind or duplicate IDs and IDs not below the next allocation counter.
Old saves without metadata are adopted in deterministic data-graph order, after
the highest supplied valid ID. Saving again records the complete identity state.

Live snapshot reconstruction suspends allocation. It restores the original RNG
and discovery mode even on failure, destroys constructed bodies on failure, and
does not change the world's allocator. Only applying the decoded state adopts
its objects and counter into the active world. Restoring a checkpoint into an
already advanced world replaces allocation history with the checkpoint's history.
Future network envelopes must reject commands from previous battle/session epochs.

## Lookup And Remaining Work

`BattleEntityIndex` is an on-demand index of the supplied battle data graph. Build
it at command/synchronization boundaries, not each frame, and discard it after
that operation. `{ kind, id }` resolves to the restored instance, including
historical entities. A lookup succeeding does **not** prove the target is alive,
in play, player-owned or authorized. The future command layer must check all of
those policies and use the current world's graph, not a caller-provided graph.

Default battle checksums include IDs and allocator history. The explicit
`includeEntityIds: false` diagnostic compares behavior with pre-identity fixtures;
it must not be used as an authoritative synchronization checksum.

Serialized saves still use graph references, and combat actions still hold local
data-object references. Semantic player commands, identity-based wire contracts,
authorization and reconnect are not implemented by this change. The identity
part of readiness gate 4 is implemented; the whole gate remains open.

## Evidence

- `test-battle-entity-ids.mjs`: allocation/adoption, invalid inputs, cycles,
  historical sources, empty-field continuation, display isolation, checksums,
  per-world binding and edge replacement.
- `test-battle-entity-ids-browser.mjs`: real placement, same-cell shell, upgrade,
  promotion/boarding, Boss copy, homing, mortar/ion/reflection factories, delayed
  removed source, invalid-load isolation, old saves and DEL echoes.
- Three live worlds still match after interleaved 60/30 Hz advancement and restore.
- Seven real battle replay fixtures still match across frame schedules and save
  continuation. Behavior-only hashes match the pre-identity baseline, including
  5-10; the complete replay suite also exercises all finale phases and reselection.

This is identity/restore infrastructure, not a full multiplayer implementation
or a measured frame-rate improvement.
