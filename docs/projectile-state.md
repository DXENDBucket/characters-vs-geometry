# Projectile State Boundary

`game/projectileState.ts` owns the three projectile data contracts and the pure
tower, homing, mortar and reflection construction rules. It has no Phaser runtime
dependency. Damage, separate hit judgments, partial interception budgets, copied
behavior, targeting references and trajectory parameters belong here.

`Projectile`, `EnemyProjectile` and `MortarProjectile` in `types.ts` extend those
contracts with a render `body`. `game/projectiles.ts` remains the live factory
adapter: it attaches the same shapes, glyphs, colors and trails as before. Existing
callers and its exported spec types remain compatible. Enemy attack damage and
facing are still resolved by that adapter's combat dependencies.

## Snapshots

`game/captureBattleSnapshot.ts` can run without loading Phaser or any restore
factory. `battleSnapshot.ts` restores visuals and re-exports capture for existing
callers. The graph format and battle rules version are unchanged.

- Projectile nodes have explicit included fields, checked against every key of
  their state interface, including optional fields. A new state field requires a
  corresponding snapshot decision at compile time.
- New display caches attached to a projectile are not saved. Pure projectile data
  can be classified without a body. Stored pipeline packets remain ordinary data
  objects; they are not reclassified as live projectiles.
- The encoder filters the original object's property order instead of projecting
  through an ordered field list. This retains existing graph IDs and replay hashes.
- Target/source references, removed source towers and stored reflection events
  preserve shared identity and cycles through `saveGraph`; they are not cloned.
- Decode, validation and legacy migrations are unchanged, so old graphs can still
  be restored with their existing node kinds and optional fields.

## Extension Rules

1. Add battle fields to the appropriate state interface, not just the live type.
2. Update the capture field record and any save validation for the new field.
3. Keep state construction free of display objects, clocks and random draws.
4. Preserve individual hits through reflection/storage; do not replace multi-hit
   damage with a single summed hit, which would change armor interactions.
5. Run rule, pipeline and deterministic replay checks when changing this boundary.

`scripts/test-projectile-state.mjs` runs without engine stubs. It checks exact
construction, copy context, homing targets, partial reflection damage, legacy graph
equivalence, visual exclusion and cyclic references. Browser regression scripts
exercise real rendering adapters, interception, pipeline routing and save resumes.

## Remaining Boundaries

This is an incremental split, not a headless battle engine or network protocol.
Towers now also have [explicit state contracts](tower-state.md); enemies and Bosses
still use visual exclusion lists. Source/target types still reference live entities.
Enemy/Boss contracts and stable entity IDs remain future work. Projectile
movement/collision also still invokes rendering.
No full-battle FPS improvement is claimed by this pass.
