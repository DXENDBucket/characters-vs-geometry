# Battle Lifecycle And Local Progress

`BattleWorld` owns an immutable, versioned lifecycle record: flawless eligibility
and an optional result (victory/defeat, simulation timestamp, flawless clear).
`gameOver` is derived from that record, not a second scene boolean. Debug actions,
unlimited firepower and breaches invalidate eligibility. A result is independent
of the local profile and whether the scene is playing a recording.

## Terminal Ordering

`finish` accepts only the first result. Repeated calls cannot replace the result,
play another end sound, overwrite the unlock introduction or settle rewards again.
This fixes the last-enemy breach followed by wave completion in the same tick:
the earlier defeat cannot turn into a victory. Base integrity stops at zero.

The remainder of the active fixed tick still executes, preserving existing combat
ordering. Later world steps return without dispatch, and the session/command gates
reject further advancement and player operations. Pending delayed actions remain
in the snapshot, but do not execute after a result.

## Snapshots And Compatibility

New snapshots always contain `lifecycle` version 1. Its fields are included in the
canonical combat checksum. Restore validates it before mutating the live world;
finished snapshots immediately show their result and stay finished. Boss breaches
may have positive base integrity, and a victory may no longer have a Boss object.
The snapshot validators now support both cases and zero-integrity defeats.
The existing Boss validator also recognizes all four icosahedron stages, their
skill records, up to four copies and up to seven companion deaths, rather than
restricting Boss state to the endless-mode families.

Legacy running saves without lifecycle metadata remain readable. They are not
assumed flawless: they never recorded debug use. New checkpoints retain their
exact eligibility; resume/replay does not itself contaminate the battle record.
The public survival-save command still only writes running battles. This does not
add a completed-battle save UI or retroactively reconstruct old terminal results.

## Profile Boundary

`BattleProfile` is the local adapter for unlocks, flawless records, endless records,
enemy/Boss discoveries and survival-save deletion. Combat factories no longer
import persistent progress. Enemy creation/promotion report discovery through an
optional per-owner observer; snapshot construction suppresses these observations.
The adapter is constructed and detached by the scene, separately from combat data.

The trusted scene option `persistProgress: false` disables these writes and
survival-save writes/deletion for a live remote/diagnostic scene. Replay always
disables them, regardless of the supplied option. The option is retained on local
restart; it is not client-controlled wire data or part of a combat checksum.

Only a newly generated result in a local live battle settles rewards. Restoring
an already finished checkpoint acknowledges it without settlement, even into a
profile which has not cleared that level. Result presentation then shows no new
unlock/card-slot/reselection rewards. This prevents importing a result from being
mistaken for a new local clear. Existing local reward cards still open the codex.

The once-only guard lives for this adapter instance; this is not a durable network
receipt ledger or a profile transaction protocol. Existing progress updates are
idempotent flag/best-record changes. Future trusted multiplayer completion rewards
need an explicit integration policy, not automatic settlement on snapshot receipt.

## Verification

- `test-battle-lifecycle.mjs`: first-result precedence, immutable result data,
  terminal dispatch, same-tick ordering, eligibility/legacy handling, validation,
  checksums, isolated discovery and once-only/disabled profile adapters.
- `test-battle-lifecycle-browser.mjs`: actual wave-clear and lethal-breach paths,
  Boss breach with positive integrity, actual debug command Boss kill, queued
  volleys retained after loss, terminal restore and 30/144 Hz replay. Final-phase
  icosahedron coverage retains a removed Boss through a deferred reinforcement
  action and pending copy warnings. A fresh local
  profile receives no rewards from an imported completed checkpoint; local normal
  victory still unlocks cards. Read-only live scenes exercise actual spawn,
  promotion and endless-Boss handlers without changing local records/saves.
- Existing deterministic browser baselines (seven ordinary/Boss/endless battles)
  compare unchanged previous combat fields. Complete snapshot/replay comparisons
  include the new lifecycle field. Tutorial checkpoint, authority, world isolation
  and paused-save suites also cover the integration.

This completes the terminal-state extraction, not the entire authoritative host.
Combat ports still require scene adapters, and network join/resync/transport and
durable reconnect remain unfinished.
