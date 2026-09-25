# Battle Performance Boundaries

This documents incremental optimization and the shared data-only battle runtime,
not a complete multiplayer implementation. Combat uses fixed ticks and resolves each hit
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

Boss execution now uses a cached data-only runtime on the actual battle path,
including promotion, copies, companions and DEL skills. Its companion/contact/
laser buffers are isolated per battlefield. Position integration remains in the
simulation and polyhedron rotation remains cosmetic. Node integrations and seven
displayed/detached/restored browser scenarios verify this boundary, not an FPS
gain. See [Boss simulation](boss-simulation.md).

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
`BattleWorld`; the shared `BattleRuntime` now assembles its pure system ports,
with display factories and observers attached separately. See
[Battle Session Orchestration](battle-session.md) and [World Ownership](battle-world.md).
This is an ownership change with unchanged existing browser replay checksums,
not an FPS claim. Independent Node comparisons and their newly exposed numeric
and checksum limitations are documented in [BattleRuntime](battle-runtime.md).

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

Pipeline routing, capture/transfer, output and attachment rules now use data-only
states with explicit presentation/factory ports. Scene runtime and action adapters
are retained instead of reconstructed on every transfer/output. Routing credits,
partial judgments and processing rates are unchanged. Bodyless integrations,
900-tick displayed/detached/restored scenes and connected-client continuation agree.
No full-battle FPS improvement is claimed. See [pipeline simulation](pipeline-simulation.md).

Deployment, mirror lifecycle, copied forms, topology connection and board-wide
support/shared-health refresh now also use data-only rules. Board caches remain
per-instance and live runtime getters are retained rather than rebuilt per query.
Visual upgrades and mirror creation are observer callbacks. Bodyless, actual
display-disabled/restored and connected-client tests verify behavior, not a measured
FPS gain. See [tower board simulation](tower-board.md).

Shifter/push execution, generated placement and command application now also use
data-only rules. The live push runtime is retained; push planning copies only
required grid fields instead of whole towers. Layered mirror support rebuilding
was corrected and versioned. Bodyless, displayed/detached/restored and connected
client checks pass; no whole-battle FPS gain is claimed. See
[tower movement](tower-movement.md).

Enemy movement/attack/skill rules now share a data-only runtime with the live
scene. Heart plans, mortar target counts and laser hit buffers are isolated per
runtime; live adapters are cached. The 800-circle synthetic check still adds only
five textures (latest local spawn 68.2 ms, simulation-tick median 0.43 ms), with
overlays drawn once per displayed frame. These timings are diagnostic and are
not mixed-combat FPS or evidence of a speedup from this extraction.
See [enemy simulation](enemy-simulation.md).

Tower targeting, attacks, one-shot triggers and skill simulation now also run on
data-only states. Healing/laser/relocation scratch buffers are isolated per
runtime and live adapters are cached. Local aiming is no longer owned by skill
simulation. Bodyless tests, actual display-detached/restored scenes and connected
clients preserve behavior. This improves ownership and multi-world isolation;
it is not a measured full-battle FPS gain. See [tower simulation](tower-simulation.md).

Status lifecycle, final combat panels and passenger-seat calculations now run
without rendering dependencies. Numeric caches and aura source/cell buffers are
isolated per unit or battlefield, while status visuals run once per displayed
frame. New tests cover cross-battle isolation, same-tick changes and read-only
overlay rendering. See [Combat State And Status Display](combat-state.md).

Since protocol 2, checksums use canonical capture directly instead of copying and
validating a second graph each time. A Node-only 800-circle benchmark measured
about 10.0 ms median checksum time versus 7.5 ms for the old order-sensitive
checksum, with a 950,965-byte wire snapshot. This is still a significant cost;
it is not full browser synchronization/frame-time evidence. Broader mixed-content
profiling remains open. Reproduce with `node scripts/benchmark-battle-serialization.mjs`;
see [wire state](battle-wire-state.md) for format and diagnostic limits.

Rules 9 replace core native trigonometry/power/hypot with pinned deterministic
JavaScript kernels. Cross-engine correctness now has exact gates, including a
minified bundle and a mixed-engine host/client test. This is not evidence of a
performance gain. The prior static timings above predate this change; mixed-battle
profiles must include the kernels and the complete synchronization path. See
[math](battle-math.md) for compatibility and verification.

The rules-9 browser performance regression still adds five textures for 800
circles, observes one overlay draw per frame and bounds unused glyph retention.
This local run measured 66.5 ms spawn time and 0.44 ms median simulation tick.
It remains a synthetic circle fixture, not a populated pipeline/Boss battlefield
or a synchronized-client frame-time measurement.

## Mixed Battle And Durable Host Profile

Reproduce with:

```sh
node scripts/benchmark-crowded-battle.mjs
node scripts/benchmark-crowded-browser.mjs
```

Both accept `--counts=100,400,800`. Node accepts `--samples=12`; the browser accepts
the usual `--playwright`, `--browser`, `--url`, and optional `--screenshot=path.png`.
No progress/save from the player's profile is used. Atomic file profiling uses a
new temporary directory, deleted after the run.

The shared fixture deploys real towers, shared health, six pipeline edges and a
5-10 Boss, then spawns mixed enemies including passengers, health links, ranged
attackers and leaders. It warms 180 ticks and samples actual continuing combat.
Towers can die normally: requested enemy count is not field roster count. Output
reports the live census, passengers, projectiles, buffers and terminal state.
At 800 requested enemies the measured initial state had 570 field enemies,
230 passengers, 340 hostile projectiles and 12 surviving towers. Mortar and
pipeline buffers were empty at sample boundaries; this is **not** a saturated
pipeline/mortar workload or a multi-phase Boss acceptance test.

The Node test times capture, checksum, wire encoding/decoding, host ticks,
publication, independent replica application and actual atomic file commits.
Every sampled sync frame must agree with the host, and durable output must agree
with the final persisted checksum. In-process transport excludes network latency.
Publication runs every six ticks; a tiny frame payload does not imply cheap
application, since each client simulates those ticks and checks the full state.

Local Windows / Node 22.19.0 diagnostics, 12 samples (milliseconds, medians):

| Requested enemies | Simulation tick | Checksum | Client six-tick apply | Full commit per tick | Full commit per six ticks |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.44 | 1.91 | 5.14 | 11.20 | 12.66 |
| 400 | 1.20 | 6.59 | 14.18 | 30.43 | 35.51 |
| 800 | 2.32 | 13.49 | 28.56 | 58.78 | 69.46 |

Before transaction-local checksum reuse, the six-tick commit medians were
14.27 / 41.15 / 84.97 ms. This removes one redundant full checksum on publication
transactions; tests assert one calculation and correct invalidation across
commands, frames, resync and reconnect. It does not change the wire format or
commit-before-publication guarantee. Samples are diagnostic, not portable timing
assertions; GC, JIT, antivirus and storage contention produce large outliers.

A subsequent wire-encoding pass fuses canonical traversal with wire-record
creation while retaining full input validation. The benchmark now asserts exact
bytes against a frozen pre-fusion encoder and reports `legacyEncode` alongside
`encode`. On the same captured states, a 24-sample run measured 2.44 -> 1.21 ms,
6.58 -> 3.43 ms and 13.25 -> 7.09 ms for 100 / 400 / 800 enemies. This avoids one
complete intermediate graph allocation. It does not optimize routine command
frames (which contain no snapshot), rendering or simulation checksums, nor make
per-tick full durable commits viable. Longer sample windows change the live
workload as towers die, so compare encoding side by side on the same static graph
rather than attributing all cross-run commit differences to this change.

At 800 enemies the snapshot was about 1.28 MB and the atomic write portion about
7.4 ms. Full serialization remains the larger cost. **Do not schedule one durable
transaction per 60 Hz tick in crowded battles.** Even six-tick commits leave
limited headroom; input transactions, accelerated play and slower storage need
further work. Journaling/commit scheduling must retain receipt and publication
durability rather than dropping that safety barrier.

The headless Edge 153.0.4234.48 browser check renders 72 frames, one fixed tick per
frame, then compares to an independent core and reads back the canvas. CPU frame
medians for 100 / 400 / 800 were 4.4 / 9.9 / 18.2 ms, with p95 9.9 / 20.2 / 172.5 ms.
Animation-frame intervals and maximum stalls are reported separately. These include
initial render/JIT work after simulation warm-up and headless browser scheduling;
they are not steady-state player FPS. The 800-enemy result demonstrates remaining
rendering/allocation pressure, not a solved large-battle performance problem.

Next profiles should isolate warmed rendering/allocation hotspots, saturated
pipelines/mortars and long sessions, plus remote browser frame application. The
optional durable host is isolated from existing single-player frame work; its
storage costs do not explain single-player stalls. See [durable host](durable-battle-host.md).

### Detached Replay Capture

Replay construction previously cloned a freshly captured graph in its entirety.
The session now provides `captureCheckpointReplay`, whose callback produces a new,
detached graph owned by the returned replay; the borrowed-input API still clones.
The durable host also reuses replay capture within one transaction (not across
commands/transactions), avoiding duplicate captures on join and resync. The scene's
host snapshot port uses the fresh-capture API as well. Neither ordinary rendering
nor routine client command-frame application uses this new path.

The benchmark asserts equal serialized replay bytes for both paths and measures
`legacyReplay` and `replay` on the same static state. A local 24-sample run measured
medians of 1.91 -> 0.43 ms (100 enemies), 7.51 -> 1.53 ms (400), and 16.14 -> 4.09 ms
(800). Consecutive before/after full six-tick durable-commit medians were
10.94 -> 9.29 / 31.61 -> 26.22 / 66.67 -> 53.90 ms. Persisted sizes and fixture
censuses matched. These full-commit comparisons include storage/JIT/GC variance;
the side-by-side replay comparison isolates the removed graph clone more directly.
Checksum cost, wire validation, atomic storage and durability barriers remain.
This is not proof of production latency or a fix for crowded-client long frames.

### Warmed Rendering And Replica Batches

The browser benchmark accepts `--warm-frames=60 --frames=180` to separate actual
render warm-up from the measured window. `--profile=logs/battle.cpuprofile` records
a Chromium CPU profile (one enemy count only). The profile includes fixture setup,
warm-up and final reference checks; only the reported frame samples are the measured
window. Stage timings report simulation including cosmetic effect creation, view
refresh and WebGL rendering. Overlays/cards/HUD are nested within view refresh:
do not sum these columns as independent totals. Timing wrappers add diagnostic
overhead and never participate in combat state.

`--replica` initializes a real GameScene replica from a wire snapshot and feeds it
six-tick JSON command frames through BattleSyncClient every six renders. Each frame
checks its checksum. Host preparation occurs outside the CPU frame timing; it still
runs in the same browser process and affects frame intervals and shared GC. This
isolates displayed-client application cost, **not network latency or a remote-host
end-to-end FPS result**. Replica windows must be multiples of six. Both modes compare
the final state to a separately advancing independent core and check nonblank pixels.

Local headless Edge 153, 60 warm frames and 180 measured frames (milliseconds):

| Enemies | Local CPU frame median / p95 | Local render median | Replica six-tick apply median / p95 |
| --- | ---: | ---: | ---: |
| 100 | 4.0 / 5.8 | 2.6 | 4.9 / 13.5 |
| 400 | 10.0 / 20.9 | 6.8 | 12.7 / 23.3 |
| 800 | 18.1 / 36.7 | 12.9 | 28.1 / 54.1 |

Local and replica hashes at tick 420 agree: `984cb91a`, `9d0f763a`, `a2696ad8`.
The live roster changes during the window; census and projectile counts are emitted
with the results. At 800 enemies the replica's worst sampled CPU frame was 139.9 ms.
These results leave rendering and burst application as unresolved bottlenecks, even
after warm-up. Smaller replica median frame costs mostly reflect five frames without
a simulation batch, not a faster simulation.

CPU sampling also exposed global tween-list scans on every pooled effect acquisition.
Private pools only contain completed effects (or manually retired mortar visuals
which never have tweens). Acquiring those objects no longer calls `killTweensOf`;
refreshing an active pipeline shield still does. In one full 800-enemy profile,
`hasTarget` / `getTweensOf` self samples went from 229 / 57 to zero. Overall frame
timings are noisy and rendering remains dominant; this does not establish a broad
FPS gain. Real Phaser tests in Chromium/Firefox/WebKit cover reuse while completed
tweens still await manager cleanup, multi-target completion, unrelated active tweens,
shield refresh and scene restart (`scripts/test-effect-pools-browser.mjs`).
