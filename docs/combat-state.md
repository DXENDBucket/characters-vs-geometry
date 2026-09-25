# Combat State And Status Display

`game/statusEffects.ts`, `game/combatStats.ts`, `game/enemySupport.ts` and
`game/slowAura.ts` now operate on pure enemy, tower and Boss state. They load in
Node without Phaser stubs. Damage arithmetic, effect expiry, support ordering
and random consumption are unchanged.

## State Ownership

- Use `statusEffects.ts` for status application, refresh, expiry, removal and
  frozen physical-damage accumulation. Its per-enemy WeakMap holds reusable
  numeric output and a change revision, neither of which enters saved state.
- Low-level functions in `rules/statusEffectRules.ts` remain data-only. Live
  callers should use the lifecycle API so same-tick changes invalidate display.
- `enemyContainerRules.ts` owns logical passenger seats, loading eligibility,
  cargo traversal and health contributions. `EnemyState` cargo and health-pool
  relationships now refer to data states, not display objects. They are still
  object references, not stable entity IDs.
- Final-stat queries are renderer-free, but not read-only: they project final
  panels and expire effects. Status queries also preserve the original logical
  passenger-seat update timing. Do not move these calls into a renderer.

## Display Ownership

`render/enemyStatus.ts` owns status icons, borders, flight offsets, archangel
halos and facing. `render/enemySupport.ts` owns defense-aura icons. The scene
refreshes them after catch-up ticks, once per displayed frame, including while
paused. Pure status queries no longer draw anything. The frame overlay pass must
not change the battle checksum.

Immediate creation and snapshot restoration explicitly initialize display.
`syncEnemyBodyPosition` remains a transitional live adapter: movement still calls
it, and it coordinates logical passenger seats with body transforms. Health,
promotion and other runtime visuals also remain to be separated. This is not yet
a renderer-free complete battle engine.

## Multiple Battles

Support-source views, nearby-source buffers and slow-aura cell maps are owned by
their roster arrays using WeakMaps. A second battlefield cannot overwrite a
retained view from the first. Each view is still mutable scratch data within its
own battlefield; refresh it after relevant roster or position changes and consume
it synchronously. Candidate membership is cached; live eligibility and numeric
modifiers are checked during evaluation. Aura-icon visibility bookkeeping is
also per roster.

## Verification

- `test-combat-state.mjs` exercises real status and final-stat modules without
  engine stubs; throwing display getters catch accidental rendering access.
- Tests cover freeze accumulation, effect expiry, reversal and passenger seats,
  final attack/defense/speed, Boss reductions, snapshot exclusion and interleaved
  battle aura views.
- `test-battle-performance-browser.mjs` checks that repeated stat queries draw
  nothing, catch-up ticks draw once per frame, paused mutations refresh, and
  overlay rendering leaves the battle checksum unchanged.
- Browser replay checks retain existing checksums across ordinary, Boss, endless
  and finale-phase battles. No save migration or rules-version change is needed.

These changes reduce redundant display work and clarify dependencies. Synthetic
stress timings are diagnostics, not evidence that every full-battle bottleneck
has been eliminated. See [performance](performance.md) and the remaining
[multiplayer gates](multiplayer-readiness.md).
