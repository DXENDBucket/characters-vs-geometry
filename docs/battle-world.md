# Battle World Ownership

`BattleWorld` owns entity rosters, occupancy, permanent/timed cell seals, progress,
resource clocks, raw currency, base integrity, tower placement order and Boss phase
progress. `GameScene` uses this instance for the real single-player path. Its
temporary compatibility accessors point at world fields; they do not keep another
copy of battle data. Restart creates a new world, and restore replaces that world's
collections rather than leaving the simulation attached to stale arrays.

The world also owns `BattleLoadout`: ordered cards, deadlines and reselection
memory exist before any card widgets. Scene compatibility getters use that model;
view recreation does not rebuild battle state. See [loadout state](battle-loadout.md).
Tutorial models and semantic lesson observations also belong to the world. Their
step/reference snapshots are separate from scalar progress, and rendering consumes
derived instructions. See [tutorial state](tutorial-state.md).
Terminal outcome and flawless eligibility also belong to the world and have their
own versioned snapshot record. Only the first finish is accepted; restore never
re-awards a local clear. See [battle lifecycle](battle-lifecycle.md).

`BattleSession` still owns fixed ticks, RNG, queued actions and recordings. The
world uses the session's exact RNG object. Battle configuration is copied once at
construction, so caller mutation cannot alter another world through shared input.

## Simulation Order

The world drives the existing tick order through required `BattleWorldSystems`
ports: timed effects and seals, copy synchronization, scheduled actions, tower
skills/push/topology/mirrors, support refresh, accelerated card clock, production,
arming, storage, Bosses, swept motion, enemies, tower attacks, pipelines, friendly
projectiles, deferred exits, hostile projectiles and mortars. It then updates its
tutorial model, decides whether normal waves may run, and invokes auto-upgrades.
Tutorial update/wave gating no longer use scene-owned hooks. Required combat ports
are not silently replaced by no-op defaults.

Preserve this order. In particular:

- Current-tick skill changes affect card recovery before production/spending.
- Timed seals erase towers before due actions execute.
- Swept projectile hits resolve before deferred base breaches.
- Mortars refresh slow-aura sources after earlier damage may remove a tower.
- A terminal event retains the original remainder of the current tick. The
  session's continuation policy stops subsequent ticks and the world rejects new
  steps once ended. No early return is added halfway through the active tick.

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
not an independently immutable save. It preserves the existing scalar field order
and references; lifecycle and tutorial checkpoints are separate snapshot fields.
`restoreProgress()` restores trusted decoded scalar progress and supplies legacy
phase defaults. Entity construction, graph reconnection and controller restoration
remain in the live snapshot adapter. The subsequent identity pass adds optional
allocator metadata to the complete battle snapshot, not to `progressSnapshot()`;
the world's own allocator is bound to live factories and adopted on restore. See
[entity identity](battle-entity-identity.md).

## Verification

- `test-battle-world.mjs` loads without Phaser stubs. It checks system order,
  reentrancy, seal deadlines, production, resources, completion, passenger/storage
records, phases, independent worlds and session/checkpoint continuation.
  The actual basic tutorial model also exercises world-owned tutorial wave creation
  and side-effect-free checkpoint restoration.
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
Encounter transitions, field cells, storage and nullification now use pure rule
systems on the live path; see [encounter rules](battle-encounter.md). Their ports
still connect live network/skill controllers. Pipeline and attachment rules now
use explicit data/presentation ports too; see [pipeline simulation](pipeline-simulation.md).
Deployment, mirror lifecycle, copied forms, topology connection and board-level
aura/shared-health refresh now have data-only implementations too; see
[tower board simulation](tower-board.md). Physical shifter/push execution,
generated-tower placement and full runtime composition remain live. Input selection and interpretation remain local-scene
responsibilities. Port implementations must be separated from rendering before a
complete authoritative headless host can use this world.

Stable entity IDs and semantic commands are integrated; authority and live-host
sync/reconnect have connected-client coverage. Identity-based wire relationships,
per-player resources and production connection handling remain open. See
[multiplayer readiness](multiplayer-readiness.md). This
pass changes ownership and dependency boundaries; it does not claim a full-battle
FPS improvement.
