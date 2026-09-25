# Damage And Unit Lifecycle

`game/unitLifecycle.ts` now runs the actual tower/enemy/Boss damage and removal
path using data states. It imports neither Phaser nor rendering. GameScene uses
this same implementation through a cached adapter in `render/unitLifecycle.ts`.
This is not a second, simplified combat implementation.

## Rule Ownership

- Damage mitigation, shell redirection, damage absorption requests, shared-pool
  changes, frozen physical-damage accumulation and invulnerability checks.
- Enemy/Boss threshold transitions, solar-bomb depletion and bounce, shared Boss
  HP, tetrahedron/icosahedron lethal locks and immediate DEL sweep shielding.
- Kill accounting, passenger release, death splitting, roster/occupancy removal,
  health-network rebuilding and cascading loss of Unyielding.
- T's disappearance detonation and in-place removal of all three projectile
  families, unless its action was captured by a pipeline.

`towerHealthRules.ts` owns network arithmetic, negative-health limits and capacity
changes. `enemyHealth.ts` now accepts data-only entities. `unitStatRules.ts` owns
base/final stat updates and temporary action panels. Existing live health/stat
exports remain thin adapters which update health bars at the original points.
Zeal and Unyielding scratch grids belong to each tower roster, not the module.

`enemySplitRules.ts` owns split kinds, ranks, lane order, offsets and facing.
It calls a required spawn port in sequence; live spawning still uses the original
factory, RNG, environment HP multiplier, entity allocator and health-link setup.
`enemyReleaseRules.ts` owns passenger positions, status inheritance, field return
and recursive destruction. Administrative removal does not award kills or spawn
death children. Normal deaths release passengers before clearing the carrier.

The pure DEL lane-sweep controller now requests echo removal through a callback.
The live Boss controller supplies the existing display cleanup.

## Presentation And Callback Boundaries

`UnitLifecyclePresentation` is observation-only. It receives health-bar updates,
flashes, form/position changes, pulses and removal animations. Disabling it must
not change authoritative state. `NO_UNIT_LIFECYCLE_PRESENTATION` explicitly
disables only display; it does not supply fake damage or spawn behavior.

Passenger seat updates previously occurred inside a position-rendering helper.
They now run in the rules before the read-only position adapter. DEL's zero-step
position/reversal update also remains in the rules, not its warning renderer.

The lifecycle still has explicit gameplay callbacks for absorption, reactions to
damage/removal, captured detonations, Boss phase replacement and level completion.
GameScene currently supplies these using its existing controllers. Mirror and
pipeline controllers, complete firing/movement/skill execution and Boss phase
orchestration are not made headless by this extraction. Their remaining ports
must still be separated. Relationships remain graph references, not ID records.

Important ordering remains unchanged:

1. A shell receives the hit using its own defense; no overflow reaches its occupant.
2. Shared tower deaths snapshot all victims before damage/removal callbacks.
3. Enemy deaths account for weight, release cargo, spawn children, then remove.
4. Tower removal updates occupancy, topology and health networks before its
   external removal callback and negative-health cascade.
5. Boss phase replacement can consume a defeat before terminal removal/settlement.

## Verification

- `test-unit-lifecycle.mjs`: 17 Node cases load real rules/factories without
  engine, DOM or module overrides. They cover the above chains, cross-world aura
  isolation, real projectile-to-lifecycle hits and data snapshot continuation.
- `test-unit-lifecycle-browser.mjs`: three real scenes compare normal display,
  detached lifecycle display and a restored checkpoint through actual mirror,
  health-pool, shell, carrier and split deaths. At 600 ticks the checksum is
  `4c7f0105`. An actual 5-10 phase handoff also matches (`7eb408f9`).
- The seven-level deterministic suite and the host/two-client synchronization
  suite retain their previous hashes. Projectile, topology, health-link, passenger,
  shell, pipeline, chevron, DEL/NUL, incitement and world-isolation browser checks
  pass. The old NUL fixture now allocates an ID for its manually constructed edge.
- 580 rules, 7 audio tests, data validation and TypeScript/Vite build pass.
  Dependency guards include the new data-only modules and retain acyclic imports.

No whole-battle FPS improvement or complete renderer-free engine is claimed.
