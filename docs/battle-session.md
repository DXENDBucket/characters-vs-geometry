# Battle Session Orchestration

`game/battleSession.ts` now owns the fixed-step clock, seeded random stream,
delayed-action queue, command recording, replay cursor and execution guard.
The real `GameScene` uses this session; there is no alternate simulation path.

The scene supplies a `BattleSessionRuntime` with three operations: advance the
integrated `BattleWorld` once, execute an input command, and report whether simulation may continue.
It supplies frame time already adjusted for local playback speed. Initial pause,
menu and reselection handling remains in the scene for UI refresh; the session also
respects the continuation policy before advancing and between catch-up ticks.

## Ordering And State

- Commands for tick 0 run before the first tick. During catch-up, a tick advances
  world systems and then executes its recorded commands in sequence order.
- Commands at `endTick` still execute. Subsequent frames do not advance playback.
- Each session has its own clock, RNG, queue and recording. Rendering randomness
  is not part of this stream. Input and exported recordings are copied, so mutation
  by callers or executors cannot rewrite stored history.
- Checkpoint restore validates version, clock, RNG, participant policy and playback bounds before
  modifying the session. Legacy saves derive ticks from battle time as before.
- A new recording after resume starts at a captured checkpoint, clears the old
  command list and retains the actual current tick. Action references are restored
  separately with the world's graph so their source/target identity is preserved.
- `battleChecksum.ts` computes the current version-7 hash without mutating the
  supplied state. Frame remainder, playback speed and Boss cosmetic rotation are
  normalized; local selected cards are excluded. This authority extraction does
  not change the rules version or default single-player checksum.
- Optional immutable participant capabilities survive snapshots and replay. An
  omitted table means the original local participant. A restore/checkpoint epoch
  invalidates stale authority instances without entering the combat checksum.

## Still Open

This is session orchestration, not a complete headless battle engine. Tick order,
entity collections, resource/wave rules and phase progress now belong to
[BattleWorld](battle-world.md). The scene supplies required system ports, whose
live controllers/runtime still call visual adapters. Command interpretation remains
in `GameScene`, and actions still hold live unit references.
Live commands express semantic operations/controls; local UI intent is not shared
state. `submit` remains a trusted recording API. Real input now enters through the
[command authority](battle-authority.md), which binds host-authenticated identities,
validates requests and handles sequence/receipt retry rules. Ownership/resources,
snapshot synchronization and durable reconnect still need work; see
[Multiplayer Readiness](multiplayer-readiness.md).

## Verification

`scripts/test-battle-session.mjs` tests independent sessions, frame schedules,
same-tick order, end-of-playback behavior, pause, reentrancy, mutation isolation,
checkpoint validation/resume and legacy checksum compatibility in Node without
Phaser stubs. Dependency guards cover the session and checksum modules.

The actual browser replay suite covers normal, Boss, endless, ASCII and tutorial
battles, continuation snapshots, reselection, shifter, push/erase and all finale
phases. At 3600 ticks the current rules-version-7 baselines remain:

| Level | Checksum |
| --- | --- |
| 1-9 | f565a778 |
| 2-10 | d86b747e |
| 5-5 | 8eb6d943 |
| 5-10 | bcbf8d7f |
| AE-1 | c1deb289 |
| IF-1 | fa677515 |
| IF-BE-4 | f07464fc |

These are local Chromium regression fixtures, not a cross-engine or networking
guarantee. No performance gain is claimed from moving orchestration ownership.
