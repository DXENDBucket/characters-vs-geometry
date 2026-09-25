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

The caller owns timers and networking. `advance(100)` is a suitable starting point
for 10 Hz host publication of six fixed simulation ticks at normal speed; it does
not change the 60 Hz rules. Accelerated play needs enough scheduling batches to
drain the clock's bounded catch-up steps. This implementation writes full checkpoints per transaction and is a
correctness-first recovery path, **not** a measured low-latency storage pipeline.
Large-state serialization, commit batching/journaling and slow-disk backpressure
still need profiling before making multiplayer performance claims. Reject floods
and oversized requests at the transport before allocating/queueing them.

## Verification

- `npm run test:host` runs thirteen cases with the real independent core and replica:
  barrier ordering, lost acknowledgments, continuation, write failures before/after
  persistence, bounded receipt tails, quota preservation, conflicting/expired
  requests, malformed checkpoints, paused and terminal states, participant
  isolation, queue saturation, close behavior, atomic file replacement and retained
  owner-only tower permissions after replacement of the host.
- A child-process test kills a Node host after an actual file flush but before
  acknowledgment, starts a new process, and retries deployment. There is one tower,
  one debit, the same receipt and a higher stream ID.
- `test-durable-host-browser.mjs` uses authenticated HTTP between the Node host
  and a real GameScene replica in Chromium, Firefox or WebKit. A 5-10 fixture loses
  a deployment receipt, replaces the host from its file, reconnects, continues and
  repairs an induced divergence. Client profile storage stays unchanged.
  All three engines agree after 186 ticks at checksum `0eaea300`.
- These tests are additions to existing cross-engine and command/replay gates,
  not evidence that participant resources, player input UI or every content path
  is already multiplayer-ready.

With Vite running:

```sh
node scripts/test-durable-host-browser.mjs --engine=firefox
```

The usual `--playwright`, `--url`, and Chromium-only `--browser` overrides apply.
No desktop packaging is needed.
