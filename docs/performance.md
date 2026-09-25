# Battle Performance Boundaries

This is an incremental optimization, not a renderer-free battle engine or a
multiplayer implementation. Combat still uses fixed ticks and resolves each hit
individually. Damage, armor thresholds, wave data and attack counts are unchanged.

## Enemy Roster And Support

- Use `enemyRoster.ts` for field insertion, removal and clearing. Its revision is
  local to the array, lives outside saved state, and does not consume battle RNG.
- Boarding into parentheses removes a unit from the field but preserves it as
  an active passenger. Burrow and tower storage remove its support completely.
  Returning passengers use the same insertion API as ordinary spawns.
- When changing a unit's family in place, call `invalidateEnemyRoster`. Promotion
  already does this at its battle runtime entry point. Reordering or replacing
  entries without changing array length must also invalidate the roster.
- `enemySupportIndex.ts` caches only candidate membership in field/passenger
  order. Position, lane, rank, alive state and high flight are read live for each
  hit. It never caches a target's final defense or a resolved damage result.
- Support-provider membership comes from `data/enemyAbilities.ts`. Add a new
  source family there and implement its support evaluation. Add a regression
  that changes its state between hits.
- Movement's lane buckets and slow-aura cell maps are reusable views owned by
  each roster. Another battle no longer overwrites them. Within one battlefield,
  consume them synchronously and refresh after roster/position changes.

## Rendering

- Static enemy rank labels and status icons use `sharedGlyphs.ts`, backed by the
  same high-resolution Phaser text rasterization as before. Identical text/style
  combinations share a texture within a scene. Each image retains its own transform.
- Textures in use are never evicted. At most 128 unused glyphs are retained, so
  endless ranks cannot accumulate unlimited historical labels. Shutdown/destroy
  releases the scene's textures and listeners, including when a scene restarts.
- Use ordinary `Text` for mutable text; shared glyphs return `Image` objects.
  Preserve their logical dimensions when adjusting scale: texture pixels are
  high-DPI and are not logical game pixels.
- Enemy creation and promotion use the same status-visual factory.
- `GameScene.syncBattleOverlays` draws status/defense-aura icons, tower facing,
  NUL, timed cell seals and enemy health links once after catch-up ticks (also
  while paused). Status/stat queries no longer draw. Immediate command/load
  redraws remain where required. Other visuals still run in simulation code.

## Checks

Publishing runs data validation, rule tests and audio tests before building.
Locally:

```sh
npm run validate
npm run test:rules
npm run test:audio
npm run build
```

With Vite running and Playwright installed:

```sh
node scripts/test-battle-performance-browser.mjs
node scripts/test-battle-determinism-browser.mjs
```

Both scripts accept `--url=...`, `--playwright=/path/to/playwright/index.mjs` and
`--browser=/path/to/browser`. The performance check also accepts
`--screenshots=logs/performance`. They use isolated browser profiles, not the
player's progress. No desktop packaging is needed.

Performance timings are diagnostics, not portable pass/fail thresholds. Stable
assertions cover texture sharing and cleanup, exact glyph pixels, bounded unused
rank textures, avoiding full-roster scans per hit, and once-per-frame overlays.
Rule tests cover live support state and roster transitions. The determinism
script covers multiple frame schedules, save continuation and multi-phase bosses.

The local headless Chromium stress fixture (800 identical circles) reduced new
text textures from 4000 to 5 and observed spawn time from about 686 ms to 75-92 ms.
This measures a synthetic spawn workload, not full-battle FPS. Profiles with many
projectiles, mixed support sources, pipelines and bosses still need separate
measurements before claiming their bottlenecks are resolved.

## Remaining Work

The second pass consolidated five enemy SP skills and three support auras into a
shared catalog, split SP execution from continuous support, and removed runtime
rendering dependencies from their encyclopedia detail queries. See
[Enemy Ability Definitions](enemy-abilities.md) for ownership and extension rules.

The third pass consolidated seven tower SP skills, their initialization/reset
rules, manual targeting flags and encyclopedia fields. Original and copied towers
share the same initial-state factory. See [Tower Skill Definitions](tower-abilities.md).
This pass reduces maintenance duplication; it does not claim a measured FPS gain.

The fourth pass consolidated all 13 Boss SP definitions and phase-entry charge
rules, and decoupled charge/dispatch from model rendering. Idle Boss skill updates
no longer allocate an empty readiness array. See [Boss Skill Definitions](boss-abilities.md).
This is a dependency and allocation improvement, not a measured full-battle FPS gain.

The fifth pass separated projectile data/construction from display bodies and
made snapshot capture importable without Phaser. Projectile snapshots now include
explicit, type-checked state fields; old graph order and references are preserved.
See [Projectile State Boundary](projectile-state.md). This prepares a data boundary
for replay/headless work, not a measured full-battle FPS gain.

The sixth pass separated tower data/initialization and pure tower queries from the
live factory, with explicit snapshot fields. Facing synchronization is a narrow
render adapter; status effects and targeting no longer pull in the whole tower
rendering module. See [Tower State Boundary](tower-state.md). This preserves battle
behavior and snapshot compatibility; no full-battle FPS improvement is claimed.

The seventh pass separated enemy state/initialization, pure combat queries and
status-effect calculations from their live visual adapters. Enemy snapshot fields
are explicit and type-checked. See [Enemy State Boundary](enemy-state.md). The core
runtime dependency cycle shrank from eight modules to three: combat stats,
enemy support and targeting. No battle FPS improvement is claimed for this pass.

The eighth pass extracted physical hitbox geometry and Boss-part traversal from
targeting. Support queries now use that lower-level module, eliminating the last
runtime import cycle. A new rule test checks emitted source dependencies and
guards headless data/query boundaries. See [Unit Geometry Boundary](unit-geometry.md).
Selection order, damage rules and replay checksums remain unchanged.

1. Move remaining pure visual updates to a frame-level rendering adapter while
   preserving simulation-owned positions, deadlines and random streams.
2. Boss state and explicit snapshot contracts are now extracted as well; see
   [Boss State Boundary](boss-state.md). Stable IDs are integrated in live factories
   and restore; next migrate command/wire references and remaining presentation
   dependencies. See [Entity Identity](battle-entity-identity.md).
3. Continue consolidating tower aura, Boss events, scaling and encyclopedia metadata;
   named enemy, tower and Boss SP skills now share their numeric definitions.
4. Split oversized scene/runtime responsibilities along those boundaries, with
   replay checks at each step, before introducing multiplayer authority rules.

Session timing, randomness, command recording and checkpoint orchestration have
now moved from `GameScene` to an integrated `BattleSession`. The tick delegates to
`BattleWorld`, whose system ports still call live runtime adapters. See
[Battle Session Orchestration](battle-session.md) and [World Ownership](battle-world.md).
This is an ownership change with unchanged replay checksums, not an FPS claim.

Projectile movement, collision and reflection now have a renderer-free runtime
used by the actual scene. Its target and mortar buffers belong to each runtime
instead of being shared across battlefields, and the live adapter is cached rather
than rebuilt each tick. Bodyless rule tests and real displayed/detached battle
comparisons verify behavior; this is not a full-battle performance measurement.
See [projectile simulation](projectile-runtime.md).

Damage/removal and shared-health rules now use data-only states with explicit
presentation ports. Tower aura buffers are isolated per roster and the live
lifecycle adapter is cached; health observers are reused rather than created
per hit/stat refresh. Rules, real presentation-detached scenes, checkpoint
continuation and connected-client regressions preserve battle behavior. This is
an ownership/allocation change, not a full-battle FPS measurement.
See [damage and unit lifecycle](unit-lifecycle.md).

Status lifecycle, final combat panels and passenger-seat calculations now run
without rendering dependencies. Numeric caches and aura source/cell buffers are
isolated per unit or battlefield, while status visuals run once per displayed
frame. New tests cover cross-battle isolation, same-tick changes and read-only
overlay rendering. See [Combat State And Status Display](combat-state.md).
