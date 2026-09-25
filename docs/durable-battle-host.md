# Durable Battle Host

`game/durableBattleHost.ts` combines the real independent battle, authority and
synchronization layer behind a serialized asynchronous persistence barrier.
It is a host integration API, not a lobby, Steam transport or host-migration UI.

## Contract

- `create(battleId, options, ports)` requires an explicit captured access policy.
- `restore(text, ports)` validates the wire snapshot, current rules, saved policy,
  participants, loadout, checksum, tick/command cursor and bounded receipt ledger.
- Authenticate a peer outside this API, then call `connect(actorId, send)`.
  Opaque peer handles are process-local and must never come from client messages.
- `receiveText`, `advance`, connect/disconnect and persistence are serialized.
  The queue is bounded to 64 pending tasks. Frame deltas must be 0-1000 ms.
- Every transaction atomically persists one document containing combat state,
  per-actor sequences and the last 64 receipts, rate-limit usage, global command
  cursor and synchronization stream high-water mark. Only then can output escape.
- A failed handler or save closes the host and discards queued outputs. Restore
  from storage in a new host; do not retry mutation in the possibly changed world.
- `checkpointText` is the last successfully committed state, never an in-flight
  world. Combat runtime/authority handles are intentionally not exposed.
- `timing` is a copied, committed-only view of tick, remainder, speed, pause and
  terminal state. It changes only after storage succeeds, just like output.
- `close` stops ingress immediately, drains already queued commits and closes
  channels. An abrupt process exit can recover from the last atomic file.

The caller's `save(text)` must resolve **after durable atomic replacement**, not
after scheduling a write. A write that reached storage but lost its completion
still recovers safely: the saved receipt handles a repeated request. A write that
did not reach storage is retried on the previous world. Expired receipts remain
expired; a retry is never silently rewritten as a new request.

`BattleSession.restoreCommandOffset` retains global wire numbering while the
resumed local recording starts at command zero relative to its checkpoint.
Synchronization streams continue above the saved high-water mark, so existing
clients accept the new snapshot and discard delayed pre-restart frames.
Process-relative timestamps and channel handles are not saved. Recovered rate
usage is conservatively retained for one new ingress-clock window.

## Storage And Scheduling

`electron/battle-checkpoint.cjs` is a Node/Electron-main file adapter: write a unique
sibling file, flush it, atomically rename over the target, and flush the parent
directory where Node supports it. Windows file contents are flushed before rename;
power-loss durability of directory metadata remains OS/filesystem dependent. Tests
cover process termination, not sudden loss of power or corrupted storage hardware.

The store has a 32 MiB document limit. Supply a trusted host-owned filename, never
arbitrary renderer-supplied paths. There is no renderer IPC endpoint for this API.
One active writer must own a battle. Distributed leases, split-brain prevention,
cloud backups and failover to another machine remain transport/deployment work.

The caller owns networking and can use `BattleHostLoop` for real-time scheduling.
Its default 100 ms interval targets 10 Hz publication of six fixed simulation ticks
at normal speed; it does not change the 60 Hz rules. Only one advancement may be
in flight. The next timer starts after the commit, accounting for actual elapsed
time (including storage time), and schedules earlier when the twelve-step catch-up
cap leaves a remainder. It does not queue timer-driven work behind slow commits.
Paused hosts perform no periodic writes and do not catch up paused wall time;
terminal hosts stop scheduling. Commands still use the same serialized host queue.

The scheduler uses a monotonic clock outside the authoritative core. A callback
gap over 1000 ms, simulated backlog over the configurable limit (default 2000 ms),
closed host or persistence failure stops it and calls the required `failed` handler
once. There is no silent elapsed-time clamp. The owner must notify/disconnect peers
and close or replace the host; the handler must not throw. This is bounded failure
handling, not automatic migration or proof of acceptable latency under load.
Custom schedulers must invoke each timer asynchronously once, no earlier than its
delay, and support cancellation. `start()` is one-shot; recovery uses a new loop.

On shutdown, await `loop.stop()` before `host.close()`: stop cancels future callbacks
and waits for the outstanding commit without closing the host itself. Never run
multiple loops or manual advancement concurrently for the same battle. Restored
hosts get a new time origin, not catch-up for the time the process was offline.

This implementation writes full checkpoints per transaction and is a
correctness-first recovery path, **not** a low-latency storage pipeline.
The [mixed-battle profile](performance.md#mixed-battle-and-durable-host-profile)
shows full checkpoints cannot sustain per-tick commits in crowded battles.
Checksum reuse within one transaction removes duplicate publication/commit work;
the cache is invalidated for every transaction and fenced by tick/command cursor.
Replay capture now has the same transaction-local lifetime. Join/resync snapshots
and persistence reuse a detached capture at the same cursor, but never reuse it
across transactions. `captureCheckpointReplay` accepts a fresh capture callback
without immediately cloning its entire graph a second time. The original
`checkpointReplay(graph, cards)` still copies borrowed input. Replay headers and
card lists remain independent, peer delivery still clones messages, and the wire
encoder still validates the graph. No version or stored/wire bytes change.
Large-state serialization, commit batching/journaling and overloaded-host recovery
still need improvement before deployment. Reject floods
and oversized requests at the transport before allocating/queueing them.

## Verification

- `npm run test:host-loop` covers single-flight scheduling, slow commits, speed,
  retained remainder, pause, terminal state, cancellation, explicit overload and
  clock/storage failures. Real host/replica checks verify committed-only timing,
  restoration and zero idle writes; rejected persistence cannot leak timing.
- `npm run test:host` runs sixteen cases with the real independent core and replica:
  barrier ordering, lost acknowledgments, continuation, write failures before/after
  persistence, bounded receipt tails, quota preservation, conflicting/expired
  requests, malformed checkpoints, paused and terminal states, participant
  isolation, queue saturation, close behavior, atomic file replacement and retained
  owner-only tower permissions after replacement of the host. Checksum cache
  and replay capture coverage verify single calculation/capture per transaction
  without stale commands, frames, resyncs or reconnects.
- A child-process test kills a Node host after an actual file flush but before
  acknowledgment, starts a new process, and retries deployment. There is one tower,
  one debit, the same receipt and a higher stream ID.
- `test-durable-host-browser.mjs` uses authenticated HTTP between the Node host
  and a real GameScene replica in Chromium, Firefox or WebKit. A 5-10 fixture loses
  a deployment receipt, replaces the host from its file, reconnects, continues and
  repairs an induced divergence. Client profile storage stays unchanged.
  All three engines agree after 186 ticks at checksum `0eaea300`.
- Adding `--scheduled` then exercises the real wall-clock loop, atomic files and
  browser replica together: advance, pause without writes, resume, drain on stop,
  publish the final boundary and restore from disk. Checksums must agree at each
  settled boundary within a run. Wall-clock runs have different tick counts and
  are not a replacement for the fixed-tick cross-engine checksum gate. Chromium,
  Firefox and WebKit pass this scheduled integration path.
- These tests are additions to existing cross-engine and command/replay gates,
  not evidence that participant resources, player input UI or every content path
  is already multiplayer-ready.

With Vite running:

```sh
node scripts/test-durable-host-browser.mjs --engine=firefox
```

The usual `--playwright`, `--url`, and Chromium-only `--browser` overrides apply.
No desktop packaging is needed.
