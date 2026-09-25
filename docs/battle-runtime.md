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
owns local UI ingress, legacy pointer recordings, display attachment,
profile settlement and transport lifecycle. Shared control execution and pure graph
restoration live in the [independent entry](independent-battle.md). Remaining multiplayer responsibilities
must be addressed before calling the full multiplayer goal complete.

## Verification

- Fifteen Node tests instantiate the real assembly with its default data factories.
  They exercise real waves, attacks, damage, production, permissions, pipeline
  one-shot actions, mirrors with protective shells, push, queued skills, NUL,
  timed seals, tutorial initialization, phase transitions, endless succession,
  checkpoint continuation and repeated restoration of active mortar flights. The
  added AE-EX-2 regression compares local and ID-wire restoration through first
  occupancy refresh and NUL timing for 4,200 ticks.
- The module-boundary test traverses emitted dependencies from BattleRuntime and
  rejects scene/render imports. Ordinary Node execution requires no Phaser bodies.
- The actual movement regression matches across display modes and restore after
  1500 ticks (`060b8989` with the protocol-2 canonical checksum).
  Existing deterministic browser scenarios, operation/skill flows, pipeline
  actions, tutorial checkpoints and authenticated three-context synchronization
  remain part of the regression suite.
- `test-battle-runtime-browser.mjs` compares fresh default Node factories with an
  actual GameScene, then runs 3600 ticks with checks every 300 ticks and an
  additional Node wire-checkpoint continuation at tick 1500. Eleven scenarios cover
  1-9, 2-10, 5-5, all four 5-10 phases, AE-5, AE-10, AE-EX-2 and IF-BE-4.
- The rule suite passes 675 tests plus four math tests in its pretest hook.
  Seven audio tests, data validation and the TypeScript/Vite build also pass;
  the existing large-bundle warning remains.

The complete-runtime script is now an **exact gate**: no numeric tolerance or
optional strict mode. `--engine=chromium`, `--engine=firefox` and `--engine=webkit`
each pass all eleven cases against independent Node simulation and restoration.
Only Chromium uses an optional `--browser` executable path. See
[deterministic math](battle-math.md) for vector/bundle checks and runtime limits.

## New Findings

1. **Resolved in rules 9:** Node 22 and the installed Edge produced different native trigonometric
   results. At tick 600 of the P3 fixture, a companion y coordinate is
   186.624576969851 versus 186.62457696985103. Two sampled coordinate discrepancies
   occurred across the fixture. The pure-JavaScript kernels remove these differences.
   All three tested browser engines now match the exact Node P3 checksum `00fe9c83`.
2. **Resolved in protocol 2:** In AE-EX-2 with mirror shells, restoring a checkpoint causes the first board
   cache refresh to reinsert occupancy relationships after
   `nextNullificationAt`. Values and graph references agree, but the current
   old checksum serialized property insertion order. The original diagnostic recorded
   28 order discrepancies. Canonical capture now removes this false mismatch;
   AE-EX-2 passes exact comparison. See [wire state](battle-wire-state.md).

Do not round checksums to conceal numerical divergence or teach the simulation
cache about a particular test. Relationship serialization/checksums now have a
canonical contract and approximated math has a pinned deterministic implementation.
Platform/content coverage still needs expansion. Participant ownership/resources,
durable recovery and production transport/player
UI remain unfinished; these passing fixtures do not complete the multiplayer goal.
