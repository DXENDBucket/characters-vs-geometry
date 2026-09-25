# Projectile Simulation

`game/projectileRuntime.ts` now advances all three projectile families using data
states and explicit ports. The real scene calls this same code; no parallel
headless implementation was added.

## Ownership

The simulation owns movement, homing and retargeting, swept enemy collisions,
parabolic mortar trajectories, target redirection, reflection payloads, splash
falloff, individual hit judgments, status application and removal from rosters.
It consumes only supplied battle time and delta. It imports neither Phaser nor
rendering and can run on entities with no display fields.

`ProjectileRuntime` requires damage and construction ports. Reflected shots go
through those factories, so the live adapter still allocates normal entity IDs.
Pipeline routing, interception and reflection routing remain explicit optional
capabilities. Omitting them does not silently disable ordinary hit resolution.

`ProjectilePresentation` is a write-only display contract. The live adapter in
`render/projectileRuntime.ts` attaches position/rotation updates, mortar scale and
trails, hit particles, shifts and ion impact feedback at the original execution
points. No rule reads a display object or a presentation return value.
`NO_PROJECTILE_PRESENTATION` explicitly disables only presentation for a headless
host or test. Damage and factory ports remain required.

The live adapter caches one wrapper per live runtime and forwards current roster,
time and aura-cache references. It does not copy combat state. Its live-view casts
are confined to the adapter and factories, whose graph was constructed/restored
with display objects. Do not feed a bodyless graph to the live adapter.

`gatheringRules.ts` owns j's collision/transfer checks, contention cancellation and
self-damage requests. `orientationRules.ts` owns locked-target redirection. Their
existing skill modules still handle charging and visual state. `projectileMotion`
and bounds also accept data-only entities. Projectile source/target relationships
and tower shell/health-pool links now use data states, with narrower live types at
the rendering boundary.

## Isolation And Compatibility

Lane candidates, transient tower candidates, mortar targets/reflectors and Boss
splash scratch data are isolated per runtime. Another battlefield can advance
inside a callback without overwriting this world's pending targets. Scratch data
is not saved and does not consume RNG. Keep runtime instances stable across ticks
to reuse those buffers.

The extraction does not change collision geometry, query order, update order,
damage, armor breakpoints, partial-hit budgets, reflection timing or trajectory
math. Snapshot fields and graph ordering remain unchanged. Relationships still
use graph references; this is not yet the stable-ID relationship migration.

## Evidence

- `test-projectile-runtime.mjs` loads actual rules and state factories in Node
  without engine, DOM, rendering or module overrides. It checks 11 cases covering
  direct/homing/splash hits, fast sweeps, shell routing, reflection, Orientation,
  N, Gathering, partial interception, cross-world scratch isolation and checkpoint
  continuation with and without presentation observation. Damage ports use the
  actual damage arithmetic but are a fixture, not the full unit lifecycle.
- `test-projectile-runtime-browser.mjs` uses three real battle scenes. At 1800
  ticks, normal presentation, detached projectile presentation and a restored
  checkpoint all have checksum `c0bf6750`. The fixture observes friendly, enemy
  and mortar projectiles and activates j through the real semantic skill command.
- The seven-stage deterministic replay suite retains its previous checksums.
  Connected-client synchronization retains the previous hashes too.
- Pipeline, shell and chevron browser tests retain interception/reflection and
  ion audio/visual behavior. Desktop and small-viewport impact screenshots were
  checked. Full rules, audio, data validation and build pass.
- Dependency guards prevent these simulation modules from importing rendering.

This removes direct rendering dependencies from projectile advancement, but the
full battle is not headless yet. Damage/removal cascades, firing, enemy/Boss controllers,
pipeline execution and other skills still need their remaining display/factory
dependencies separated. No full-battle FPS gain is claimed.
