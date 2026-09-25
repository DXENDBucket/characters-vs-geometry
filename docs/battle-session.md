# Battle Session Orchestration

`game/battleSession.ts` now owns the fixed-step clock, seeded random stream,
delayed-action queue, authoritative controls, command recording, replay cursor and execution guard.
The real `GameScene` uses this session; there is no alternate simulation path.

The scene supplies a `BattleSessionRuntime` with three operations: advance the
integrated `BattleWorld` once, execute an input command, and report whether simulation may continue.
It supplies unscaled frame time. The session applies the authoritative speed and
checks its own pause state before advancing and between catch-up ticks. Menus and
reselection remain local UI holds, subject to the captured modal policy. The scene
can refresh paused UI without advancing simulation or draining delayed attacks.

## Ordering And State

- Commands for tick 0 run before the first tick. During catch-up, a tick advances
  world systems and then executes its recorded commands in sequence order.
- Commands at `endTick` still execute. Subsequent frames do not advance playback.
- Each session has its own clock, RNG, controls, queue and recording. Rendering randomness
  is not part of this stream. Input and exported recordings are copied, so mutation
  by callers or executors cannot rewrite stored history.
- Checkpoint restore validates version, clock, RNG, controls, participant policy and playback bounds before
  modifying the session. Legacy saves derive ticks from battle time as before.
- A new recording after resume starts at a captured checkpoint, clears the old
  command list and retains the actual current tick. Action references are restored
  separately with the world's graph so their source/target identity is preserved.
- `battleChecksum.ts` computes the current version-7 hash without mutating the
  supplied state. Frame remainder and Boss cosmetic rotation are normalized; local
  selected cards are excluded. Captured access/modal policy and the new authoritative
  controls, including pause and speed, are included. The historical top-level speed
  mirror remains normalized for old checksum diagnostics. This extraction did not change rules.
- Optional immutable participant capabilities survive snapshots and replay. An
  omitted table means the original local participant. A restore/checkpoint epoch
  invalidates stale authority instances without entering the combat checksum.
- Immutable slot/card/reselection and local-modal policies now survive snapshots
  and replay too. See [captured policy](battle-policy.md) for legacy behavior.

## Paused Checkpoints

`simulation.controls` stores pause, speed, auto-upgrade enablement, reserve and
debug enablement. Existing top-level settings remain compatibility mirrors emitted
from the same session state. A modern restore uses the nested controls; old saves
without them use the flat settings and an unpaused default, since historical pause
state was never saved. Invalid controls are rejected before session mutation.

Restoration no longer changes global pause according to the local menu policy.
The single-player resume menu is a separate local hold. Closing that overlay alone
does not change combat state; its explicit Continue action submits a recorded,
authorized resume control when required under the single-player modal policy.
Continuing-modal sessions never implicitly cancel another participant's pause.

All deferred tower shocks, targeted effect cards, S salvos, enemy volleys and Boss
attacks require `ScheduleBattleAction`. Phaser timer fallback paths and scene-owned
paused closures were removed. Already-dead shock sources stay reachable through
the saved graph until their queued attacks execute. These references still need
conversion to stable-ID relationship records for a fully independent host.

## Authoritative Replicas

Replica sessions cannot advance from local frame time or accept local `submit`.
`followFrame` prevalidates bounded ticks and semantic commands, then uses the same
world step and command executor as local play/replay. Host tick counts determine
advancement; client rendering cadence and speed do not. Commands at the current
or terminal tick still execute in order.

`recordedCommands` exports bounded independent command slices. `checkpointReplay`
captures a join checkpoint without changing the host's recording epoch or input
ledger. `atBoundary` prevents publishing partial ticks or reentrant commands.
See [synchronization](battle-synchronization.md) for validation, retry and resync.

## Still Open

This module owns session orchestration. Tick order, entity collections,
resource/wave rules and phase progress belong to [BattleWorld](battle-world.md),
with the complete data-only system assembly in [BattleRuntime](battle-runtime.md).
Independent control ingress and legacy display hydration still need adapters.
Actions hold data-object references locally and stable entity IDs on the wire.
Live commands express semantic operations/controls; local UI intent is not shared
state. `submit` remains a trusted recording API. Real input now enters through the
[command authority](battle-authority.md), which binds host-authenticated identities,
validates requests and handles sequence/receipt retry rules. Ownership/resources,
player-facing synchronization integration and durable reconnect still need work; see
[Multiplayer Readiness](multiplayer-readiness.md).

## Verification

`scripts/test-battle-session.mjs` tests independent sessions, frame schedules,
same-tick order, end-of-playback behavior, pause, reentrancy, mutation isolation,
checkpoint validation/resume and canonical checksum exclusions in Node without
Phaser stubs. Dependency guards cover the session and checksum modules.
The guards also reject reintroducing timer/paused-closure fallback paths in combat
controllers.

`test-battle-pause-browser.mjs` restores an actual paused IF-BE-4 battle containing
20 delayed actions across eight action types. It checks source identity after F
has disappeared, action order/count, no advancement during paused frames, explicit
resume recording, real survival save/load, legacy controls and 30/144 Hz checkpoint
playback. A running save opens a local menu without inventing pause commands.

The actual browser replay suite covers normal, Boss, endless, ASCII and tutorial
battles, continuation snapshots, reselection, shifter, push/erase and all finale
phases. At 3600 ticks the current rules-version-7 baselines are:

| Level | Checksum |
| --- | --- |
| 1-9 | 1e6ea626 |
| 2-10 | a7029fbd |
| 5-5 | 4efc42e7 |
| 5-10 | 9ccad86f |
| AE-1 | 245de3b5 |
| IF-1 | 09beb729 |
| IF-BE-4 | 3453b471 |

These include captured access/modal policy, authoritative controls and lifecycle.
The test separately asserts preceding hashes by removing only newly added fields
in diagnostic copies; pre-lifecycle, pre-control and pre-policy histories remain
checked separately. Actual replay
and snapshot comparisons include all authoritative fields. Policy-less recordings
still play with the historical unrestricted policy and current control snapshots.

These are local Chromium regression fixtures, not a cross-engine or networking
guarantee. No performance gain is claimed from moving orchestration ownership.
