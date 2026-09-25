# Shared Battle Runtime

## Ownership

`game/battleRuntime.ts` now assembles the full rule graph used by the actual
GameScene. It owns tower deployment, mirror networks, targeted attachments,
pipeline capture/output, skills, movement, storage, NUL, board refresh, cells,
encounters, damage/removal, targeting, projectiles, delayed action dispatch and
the complete BattleWorld step. It also applies semantic operations and captures
and restores resolved battle data.

The runtime uses one BattleWorld and the same BattleSession random stream.
Factories default to data-only entities. The live adapter supplies display
factories and observers; it does not assemble a second set of combat callbacks.
Rosters and clocks are own enumerable getters, so restored arrays remain live
and routed actions can still clone their current runtime ports.

Local skill aiming, push direction selection and shifter selection retain their
UI controllers, bound to the same core simulation objects. Rendering adapters
retain compatibility facades for existing content and diagnostics. Their
WeakMap bindings point at the actual core objects, including when tests replace
presentation observers.

GameScene no longer owns the full combat factory/callback graph, tick-system
assembly, operation execution wiring or resolved-state restoration. It still
owns control/UI ingress, legacy pointer recordings, display graph hydration,
profile settlement and transport lifecycle. Those remaining responsibilities
must be addressed before calling the full multiplayer goal complete.

## Verification

- Seven Node tests instantiate the real assembly with its default data factories.
  They exercise real waves, attacks, damage, production, permissions, pipeline
  one-shot actions, mirrors with protective shells, push, queued skills, NUL,
  timed seals, tutorial initialization, phase transitions, endless succession,
  checkpoint continuation and repeated restoration of active mortar flights.
- The module-boundary test traverses emitted dependencies from BattleRuntime and
  rejects scene/render imports. Ordinary Node execution requires no Phaser bodies.
- The actual movement regression still matches `96cce19b` after 1500 ticks.
  Existing deterministic browser scenarios, operation/skill flows, pipeline
  actions, tutorial checkpoints and authenticated three-context synchronization
  remain part of the regression suite.
- `test-battle-runtime-browser.mjs` compares fresh default Node factories with an
  actual GameScene, then runs 3600 ticks with checks every 300 ticks and an
  additional Node checkpoint continuation at tick 1500. Eleven scenarios cover
  1-9, 2-10, 5-5, all four 5-10 phases, AE-5, AE-10, AE-EX-2 and IF-BE-4.
- The complete rule suite passes 658 tests; seven audio tests, data validation
  and the TypeScript/Vite build pass. The existing large-bundle warning remains.

This last script is deliberately a **diagnostic**, not a passing gate for strict
cross-engine synchronization. It checks exact data for Node-to-Node continuation,
permits only coordinate differences no greater than 1e-10 for Node versus Edge,
and reports object-key ordering discrepancies. Run with
`--case=5-10:P3 --strict=true` to reproduce the unresolved exact checksum failure.

## New Findings

1. Node 22 and the installed Edge produce slightly different native trigonometric
   results. At tick 600 of the P3 fixture, a companion y coordinate is
   186.624576969851 versus 186.62457696985103. Two sampled coordinate discrepancies
   occur across the complete fixture. No observed count/health/action difference
   in this short run proves that a longer run cannot diverge at a hit boundary.
2. In AE-EX-2 with mirror shells, restoring a checkpoint causes the first board
   cache refresh to reinsert occupancy relationships after
   `nextNullificationAt`. Values and graph references agree, but the current
   checksum serializes property insertion order. The diagnostic records 28
   order discrepancies across its checkpoints. This can cause unnecessary
   resynchronization even without a gameplay-state difference.

Do not round checksums to conceal numerical divergence or teach the simulation
cache about a particular test. Relationship serialization/checksums need a
canonical contract. Native transcendental operations need a deterministic
implementation or an explicitly enforced matching engine/runtime requirement.
Both remain open along with participant ownership/resources, fully independent
control ingress, durable recovery and production transport/player UI.
