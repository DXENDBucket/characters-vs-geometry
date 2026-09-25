# Battle World Ownership

`BattleWorld` owns entity rosters, occupancy, permanent/timed cell seals, progress,
resource clocks, raw currency, base integrity, tower placement order and Boss phase
progress. `GameScene` uses this instance for the real single-player path. Its
temporary compatibility accessors point at world fields; they do not keep another
copy of battle data. Restart creates a new world, and restore replaces that world's
collections rather than leaving the simulation attached to stale arrays.

`BattleSession` still owns fixed ticks, RNG, queued actions and recordings. The
world uses the session's exact RNG object. Battle configuration is copied once at
construction, so caller mutation cannot alter another world through shared input.

## Simulation Order

The world drives the existing tick order through required `BattleWorldSystems`
ports: timed effects and seals, copy synchronization, scheduled actions, tower
skills/push/topology/mirrors, support refresh, accelerated card clock, production,
arming, storage, Bosses, swept motion, enemies, tower attacks, pipelines, friendly
projectiles, deferred exits, hostile projectiles, mortars, tutorials, waves and
auto-upgrades. Missing systems are not silently replaced by no-op defaults.

Preserve this order. In particular:

- Current-tick skill changes affect card recovery before production/spending.
- Timed seals erase towers before due actions execute.
- Swept projectile hits resolve before deferred base breaches.
- Mortars refresh slow-aura sources after earlier damage may remove a tower.
- A terminal event retains the original remainder of the current tick. The
  session's continuation policy stops subsequent ticks; this extraction does not
  add an early return halfway through a tick.

The world itself implements natural/timed production, raw/effective resource math,
wave completion/progress, wave-start column seals, phase selection, phase-state
reset and phase stats. Boss phase changes retain accumulated wave/weight growth.
Scene ports provide sounds, labels, persistent records and visual cleanup; none
of those are dependencies of the world module.

## Wave Generation

`waveSpawner.ts` owns actual normal/endless selection, lanes, flag leaders and
environmental extra spawns. It takes a battle RNG and an enemy-creation callback.
The old runtime entry point delegates to this same implementation.

Do not precompute every spawn position before creating enemies. Enemy initialization
consumes the same RNG between placements. Changing that interleaving changes the
entire battle even if every individual random distribution looks equivalent.

## Save Compatibility

`progressSnapshot()` is a data view consumed immediately by graph serialization,
not an independently immutable save. It preserves the existing field order and
references. No new wrapper node, save migration or rules-version change is added.
`restoreProgress()` restores trusted decoded scalar progress and supplies legacy
phase defaults. Entity construction, graph reconnection and controller restoration
remain in the live snapshot adapter.

## Verification

- `test-battle-world.mjs` loads without Phaser stubs. It checks system order,
  reentrancy, seal deadlines, production, resources, completion, passenger/storage
  records, phases, independent worlds and session/checkpoint continuation.
- Eight wave fixtures were captured from commit `023b9e0`'s previous spawner with
  the real pure enemy constructor. They verify full enemy states and RNG, covering
  ordinary/flag waves, mixed leaders, endless ranks, extra spawns and tutorial lanes.
- `test-battle-world-browser.mjs` runs two actual scene/world instances with
  interleaved 60/30 Hz updates and restores a third from a checkpoint. At 2400 ticks
  all checksums match; restarting one instance does not change the others.
- Existing browser replay baselines remain unchanged, including continuation,
  reselection/movement and all finale phases. Timed NUL, endless records and the
  practice tutorial have separate browser checks.

The Node system-order fixture supplies test drivers for combat stages. It is not
proof that the complete game runs headlessly. The browser isolation test exercises
three local scenes, not networked clients.

## Remaining Boundary

The world module has no Phaser/DOM/render imports, but its live ports still call
scene-owned controllers and runtime modules that coordinate combat with graphics.
Storage, nullification, skills, pipelines, mirrors and other controller state are
not all world-owned yet. Input selection and interpretation remain local-scene
responsibilities. Port implementations must be separated from rendering before a
complete authoritative headless host can use this world.

Stable entity IDs, semantic per-player commands, authorization, transport and
reconnect remain open. See [multiplayer readiness](multiplayer-readiness.md). This
pass changes ownership and dependency boundaries; it does not claim a full-battle
FPS improvement.
