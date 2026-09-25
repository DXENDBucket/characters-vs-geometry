# Battle Session Orchestration

`game/battleSession.ts` now owns the fixed-step clock, seeded random stream,
delayed-action queue, command recording, replay cursor and execution guard.
The real `GameScene` uses this session; there is no alternate simulation path.

The scene supplies a `BattleSessionRuntime` with three operations: advance world
systems once, execute an input command, and report whether simulation may continue.
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
- Checkpoint restore validates version, clock, RNG and playback bounds before
  modifying the session. Legacy saves derive ticks from battle time as before.
- A new recording after resume starts at a captured checkpoint, clears the old
  command list and retains the actual current tick. Action references are restored
  separately with the world's graph so their source/target identity is preserved.
- `battleChecksum.ts` computes the existing version-6 hash without mutating the
  supplied state. Frame remainder, playback speed and Boss cosmetic rotation are
  normalized exactly as before. No replay or save version bump is needed.

## Still Open

This is session orchestration, not a complete headless battle engine. `stepBattle`
and command interpretation still belong to `GameScene`; actions still hold live
unit references. The runtime currently calls visual adapters during simulation.
Commands still express single-player UI intent. `submit` is a trusted local API,
not an authorized network endpoint. Session identity, per-player semantic commands,
ownership policy, bounded network schemas, acknowledgments and reconnect are future
steps tracked in [Multiplayer Readiness](multiplayer-readiness.md).

## Verification

`scripts/test-battle-session.mjs` tests independent sessions, frame schedules,
same-tick order, end-of-playback behavior, pause, reentrancy, mutation isolation,
checkpoint validation/resume and legacy checksum compatibility in Node without
Phaser stubs. Dependency guards cover the session and checksum modules.

The actual browser replay suite covers normal, Boss, endless, ASCII and tutorial
battles, continuation snapshots, reselection, shifter, push/erase and all finale
phases. At 3600 ticks the pre-extraction baselines remain:

| Level | Checksum |
| --- | --- |
| 1-9 | 8287d3bb |
| 2-10 | b35adb5b |
| 5-5 | 45129c4a |
| 5-10 | c8385243 |
| AE-1 | 8eeca89e |
| IF-1 | 34dc5b68 |
| IF-BE-4 | e2e90bca |

These are local Chromium regression fixtures, not a cross-engine or networking
guarantee. No performance gain is claimed from moving orchestration ownership.
