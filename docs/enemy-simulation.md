# Enemy Simulation

## Ownership

The actual scene calls `game/enemyRuntime.ts`, now a thin live compatibility
facade. Its cached `render/enemySimulation.ts` adapter delegates to
`game/enemySimulation.ts`; there is no second simplified simulation.

The data-only runtime owns movement and swept blocking, normal melee, charge and
ram collisions, deferred ranged volleys, mortar selection, lasers, burrow
boarding/emergence, solar-bomb collisions and high-flight trajectories.
`enemySkillExecution.ts` owns healing, wings, ascension, heart relocation and
incitement using the existing shared skill definitions. `parenthesisRules.ts`
owns boarding, passenger health contribution and inherited movement effects.
`enemyBlockingRules.ts` is also used by the remaining live targeting helpers.

The old public skill, slope, spawning and projectile-factory APIs remain narrow
adapters for existing callers. No gameplay algorithm is duplicated in them.

## Ports And Ordering

`EnemySimulationRuntime` contains only state and explicit ports for damage,
projectile construction, scheduled enemy actions, trap/retaliation callbacks and
base breaches. The live factories still allocate original stable IDs; the pure
projectile constructors preserve per-hit damage, appearances and launch data.

`EnemySimulationPresentation` is observation-only. Seat positions, lanes,
oscillation phases and high-flight landing are updated by rules before display.
Disabling presentation cannot suppress SP use, damage or movement.

Tick order is preserved: boarding, skill updates, individual movement/attacks,
swept boarding, then passenger seating. High-speed projectile contacts still
resolve before deferred base exit. Mortars retarget at each scheduled shot;
multihit volleys preserve damage per judgment, not combined damage.

Heart plan pools and laser/mortar scratch buffers belong to each runtime, not
module-wide mutable arrays. Nested work in another battlefield cannot overwrite
them. Adapters forward live roster/time getters and are reused across ticks and
checkpoint restoration.

## Verification

- 14 new no-engine integration cases use real factories, movement, skills,
  projectiles and lifecycle rules without module overrides. They cover extreme
  speed, target priority, armor/resistance stopping, multihit volleys, frozen
  actions, traps, slope velocity, passengers, burrow exclusions, heart-plan
  isolation, ion charge, solar shield breaks and snapshot continuation.
- Existing enemy-skill execution tests now use the pure presentation port,
  without fake Phaser bodies.
- Three actual scenes compare ordinary display, detached enemy/projectile/
  lifecycle display and checkpoint restore. At 900 ticks the checksum is
  `1da93fe9`; all carrier, burrow, slope, heart, wings, ion, laser and mortar
  branches are exercised.
- The seven-level deterministic suite retains its hashes, including 5-10 phase
  transitions. One host and two independent clients retain all synchronization,
  recovery and terminal hashes.
- Dependency guards enforce no Phaser/render/scene imports in these rules and
  acyclic runtime dependencies.
- 594 rule tests, 7 audio tests, data validation and TypeScript/Vite build pass.
  Projectile/lifecycle, AE-5, chevron and incitement browser regressions also pass.

## Remaining Work

This does not make the entire game headless. Tower attacks, triggers and skills
now have the same separation; see [tower simulation](tower-simulation.md).
Live callbacks still connect pipelines and Boss orchestration.
Relationships still use state graph references rather than stable-ID
wire records. Participant resource/ownership policies and production UI/transport
lifetime handling are separate unfinished work.

No whole-battle FPS gain is claimed by moving these modules.
