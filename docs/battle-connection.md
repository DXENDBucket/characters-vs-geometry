# Battle Connection Lifetime

`BattleConnection` wraps the transport-neutral sync client. It owns real-time
ingress timers, not battle ticks. It has no Phaser, DOM, profile or concrete
network dependency. `RemoteBattleSession` adapts it to real GameScene replicas.
No lobby, multiplayer mode or Steam transport is selected by this layer.

## Transport Contract

Provide a `BattleTransportFactory(events)` returning `{ send(text), close() }`.
Each call must authenticate and establish a new ordered link for the same actor
and battle. Report `open()` before delivering text, and `closed()` on transport
failure. Report `closed(false)` for permanent denial; it does not auto-retry.
For queued/asynchronous sends, the adapter must report failures through `closed`
and fence its own pending network work by link lifetime. It must also dispose its
socket/listeners/heartbeat/polling in `close()`. A quiet paused battle is valid, so
transport liveness must not depend on receiving simulation frames continuously.

The connection accepts synchronous startup callbacks, queues at most 64 events
and one sync-message-size of text during factory construction, then releases the
queue. Sync protocol byte limits still apply. Callbacks retain their link epoch;
old messages/open/close callbacks are ignored after retirement or disposal.
This is not a substitute for network-layer queue, rate and authentication limits.

## Bounded Replica Tasks

`frameSliceTicks` opts into deterministic frame continuation (integer 1-600).
The low-level connection remains synchronous by default; `RemoteBattleSession`
defaults to two ticks per task. The first slice runs on receipt, subsequent slices
use one owned timer with a 1ms requested delay, and the final checksum runs after
the last tick slice. Browser scheduling may delay those tasks further.

The complete message is schema-validated before the first slice. Commands retain
their exact tick/sequence boundaries. Later frames, snapshots and receipts wait in
an ordered inbox, bounded to 64 messages and 16 Mi UTF-16 code units in aggregate;
the active decoded frame is separate. Every decoded message still has the 16 MiB
UTF-8 protocol limit. Overflow fails closed instead of accumulating unbounded work.

`catchingUp` reports partial work or queued ingress. Input `ready` is false and
`busy` true during partial application; the verified cursor advances only after
the final checksum. The display status stays `ready` during ordinary catch-up to
avoid a flashing reconnect label. Retry waits for that frame to finish; the
watchdog still bounds stalled catch-up. Disconnect/replacement clears the timer,
inbox and partial frame; callbacks from retired epochs cannot advance a new scene.

This changes scheduling, not simulation rules or wire formats. Snapshot decoding,
individual ticks and final checksums remain synchronous. See the measured costs
and limitations in [performance](performance.md#sliced-replica-application).

## Recovery

- Statuses: idle, connecting, synchronizing, ready, reconnecting, failed, closed.
  `subscribe` immediately reports the current status and returns an unsubscribe.
- A missing receipt or resync response retries the original request every 1.5s.
  The sequence and payload are never replaced by a fresh gameplay request.
- Connect/snapshot/pending-operation watchdogs default to 15s. Timeouts and send
  errors retire the link and reconnect with exponential 0.5s-to-10s backoff.
  Timing and the timer scheduler are injectable; combat RNG/time are untouched.
- Invalid protocol/snapshots fail closed without repeatedly fetching the same bad
  state. A caller may explicitly reconnect after fixing the external problem.
- Input remains blocked until a validated snapshot reconstructs the exact state.
  Pending operations block additional input. Reconnection preserves deduplication
  and pending completion; final close discards them and clears all timers.
- A connection is scoped to one battle ID. Use a new owner for a different battle.

## Scene Ownership

Create `RemoteBattleSession(game, { actorId, transport, onExit, ...timing })`, then
call `start()`. Subscribe to `connection` for joining status before the first
snapshot. The caller owns the outer navigation/join view and authentication.
Do not pass this actor ID as wire authentication; the host independently binds it.

Every checkpoint creates a new GameScene with its own input subscription and
participant view. Replacement removes the old scene but keeps the connection.
Normal exit or unexpected scene shutdown closes the connection and calls `onExit`
once. Scene destruction/game destruction cleans up without reopening navigation.
The battle's left footer displays connecting/synchronizing/reconnecting/failure
status; ready hides the label. Menus remain accessible while disconnected.

GameScene now cleans up on both shutdown and destruction, once per lifecycle.
Status subscriptions, modal DOM, pointer/key listeners and obsolete completion
callbacks do not survive replacement. Remote battles do not write local progress
or loadout preferences. Single-player scenes do not instantiate a connection.

The scene input port delegates transport/status to the connection, while the
session owner retains completion routing across scene replacement. If an operation
receipt arrives for a retired view, its old callbacks remain inactive and the
current view synchronizes any tutorial tool observation. This prevents a moved
tower from leaving a lesson stuck waiting for the shifter to be deselected.

## Evidence And Limits

- `npm run test:connection`: actual independent host/replica rules under an
  injected ingress clock, synchronous startup, automatic retry/reconnect,
  duplicate-payment prevention, stale callbacks, send failures, timeouts/backoff,
  divergence repair, terminal denial, disposal, reentrant close and startup bounds.
  Sliced cases cover boundary commands, pause/resume, queued receipts, the maximum
  600-tick gap, final checksum repair, mid-slice disconnect/reentrant replacement,
  malformed later commands and bounded inbox overflow.
- `test-headless-host-browser.mjs --connection`: independent Node authority plus
  Firefox/WebKit render and mouse/keyboard loops over authenticated HTTP. Includes
  pending-receipt disconnect, automatic reconnect, old-link messages, repeated
  checkpoint replacement, isolated resources, real reselection, menu exit,
  unexpected scene shutdown and whole-game destruction. Checks scene/menu counts,
  empty timer sets, unchanged profiles and exact host checksums.
- `test-remote-actions-browser.mjs`: actual clicks complete the 0-5 lesson (including
  Ctrl selection and a lost group-move receipt/reconnect), then aim/cancel/fire S
  and activate # with a direction. Aiming stays local, pending input is blocked,
  skill SP/target coordinates and push results are authoritative, and retrying a
  lost skill receipt does not fire twice. The same test runs in Chromium, Firefox
  and WebKit; native mouse-button detection preserves Ctrl+left multi-selection
  without treating it as Phaser's synthesized macOS right click.
- The HTTP connector is a test transport, not a production server or account
  service. Steam/lobby integration, reconnect UX before the first snapshot,
  broader content/fault coverage and crowded host/client/storage readiness remain
  separate integration work. See [readiness](multiplayer-readiness.md).
