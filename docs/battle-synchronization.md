# Battle Synchronization

`battleSyncHost.ts`, `battleSyncClient.ts` and `battleSyncProtocol.ts` provide a
transport-neutral snapshot/command stream around the existing battle authority.
The host and replicas execute the same `BattleSession` and actual world systems;
there is no second implementation of combat. The [independent entry](independent-battle.md)
also runs the actual authoritative game without a browser. Mode/lobby and production
transport remain separate integration decisions.

## Integration And Trust

- A trusted host calls `GameScene.startSynchronization()`. Its adapter captures the
  real world, session, delayed actions, entity allocator, policies and lifecycle.
- Authenticate each connection outside this module, then bind the resulting actor
  with `host.connect(actorId, send)`. Incoming JSON goes to
  `host.receiveText(peerHandle, text)`. No actor identity is accepted from the wire.
- The send callback must queue/serialize transport messages without synchronously
  mutating the battle. Fence callbacks and messages by connection lifetime; revoke
  handles on disconnect. The test relay authenticates routes with isolated bearer
  tokens, but is not an account service or a production network adapter.
- A client restores a snapshot into `GameScene({ replica: snapshot.replay })` and
  uses `followSynchronizedFrame` for accepted frames. The replica cannot submit
  local battle commands, advance from frame time, restart locally or write profile
  progress. Local rendering and menus cannot reject authoritative simulation ticks.
- Request inputs through `BattleSyncClient.request`, not a replica scene's local
  authority. The current client allows one pending request and does not speculate.
  [Player-facing input](battle-player-resources.md) uses this port and waits for
  receipts. [Connection lifetime](battle-connection.md) provides retries, scene
  replacement, status display and exit cleanup around the port.

## Stream And Recovery

Protocol version 3 messages identify the battle and snapshot stream. A cursor
contains the absolute simulation tick and next global command sequence. New
connections and resync snapshots receive a new stream; old-stream messages cannot
rewind the client. A new battle needs a new client/transport scope.

Snapshots contain an [ID-based wire checkpoint](battle-wire-state.md), captured configuration, checksum
and the actor's next request number. Commands after that cursor use the existing
semantic operation/control schema. A replica validates the complete frame before
execution, maps global command indices into its checkpoint-relative recording and
follows the host's ticks using the existing executor, RNG and action queue. Pause
and speed remain battle state, not client rendering decisions. The client decodes
the validated wire graph before invoking its restore adapter; local replay/save
formats retain their graph structure, with signed-zero preservation. Checksums use
canonical property/reference order. Older protocol peers are rejected; rules 9
introduce [deterministic math](battle-math.md).

The host publishes commands immediately and coalesces command-free advancement
to at least six ticks per update (about 10 Hz at normal speed). A frame is bounded
to 600 ticks and 256 commands; larger gaps use a checkpoint. JSON messages are
bounded to 16 MiB, with a smaller authority request limit. These limits do not
replace transport connection, queue or flood limits.

Duplicate frames are ignored. Gaps and checksum differences stop local command
submission and request a fresh snapshot. Resync is limited to once per second per
live peer, using an injected ingress clock outside deterministic combat. The
transport adapter schedules retries; this module does not start timers itself.

`new BattleSyncClient(runtime, frameSliceTicks)` optionally splits frame execution.
`receiveText` may return `pending`; the caller must retain subsequent messages and
call `continueFrame` in later tasks until the result is no longer `pending`.
Calling `receiveText` during partial application is invalid. Entire-frame schema
validation still precedes execution; the final checksum and verified cursor are
not committed at intermediate ticks. One request can be buffered during
application after a valid baseline has been installed, but cannot be transmitted
until the current frame validates. Transmission precedes the next queued frame;
additional input remains blocked until its receipt. Retries wait during
application and retain their existing timer cadence. A failed frame instead
requires snapshot reconstruction before the original buffered request is sent.
Disconnect/resync clears pending frame work. Omit the second constructor argument
to retain synchronous execution. [BattleConnection](battle-connection.md) owns the
bounded ordered queue, scheduling and lifetime fencing for real remote scenes.
The raw client fences restore/follow/checksum results by operation generation:
connect, disconnect, resync or a newer snapshot invalidate older in-flight work
before it commits a cursor or readiness. Such retired work returns `ignored`.
Send errors instead use a separate transport generation: an old sender cannot
disconnect its replacement, but a current sender's failure still disconnects even
if it synchronously delivered a newer snapshot first. Snapshot reconstruction and
checksum validation keep input disabled until the validated state is committed.
This is lifecycle protection, not rollback of a runtime callback that already
mutated its old scene.

Reconnect retains a pending request's original sequence. If the host executed it
but the receipt was lost, retry retrieves the authority's cached receipt instead
of spending resources again. Only the latest handle for an actor remains valid.
The plain sync host retains its ledger in memory. The optional
[durable host](durable-battle-host.md) persists it together with the world before
publishing, supporting process-loss recovery with the same battle ID. Ordinary
single-player save reloads and cross-machine host migration are separate paths.
Expired requests are rejected rather than silently reissued.

Checksums detect divergence; they are not cryptographic authentication. The client
trusts its authenticated host for combat results. A failed command or restore is
not transactionally rolled back; recovery requires a valid authoritative snapshot
or terminating the connection.

## Verification

- `test-battle-sync.mjs` covers the protocol and real session executor in Node:
  joining, frames, retries, resync, malformed messages, bounded inputs, transport
  failures and obsolete authority epochs. Its small world fixture is not evidence
  of a complete headless battle simulation.
- `test-battle-sync-browser.mjs` runs a Chromium host and Firefox/WebKit clients
  in independent processes with isolated storage over an authenticated local HTTP relay. All three
  instantiate the actual `GameScene` and exchange serialized network messages.
- The browser fixture exercises real deployments, costs, delayed attacks, paused
  commands, speed changes, duplicate input, reordered frames, lost receipts,
  disconnect/reconnect, forged identity, state divergence, and terminal resync.
  Client profiles remain unchanged and rendering cannot advance replicas.
- Initial coverage uses IF-BE-4 and the damage tutorial. Additional join/continuation
  checks cover 1-9, 2-10, 5-5, 5-10 and AE-5 with mirror and shared-health towers.
  This is selected-content coverage, not every skill or Boss phase over a network.
- Pipeline coverage joins with a consumed one-shot source still referenced by its
  stored payload, submits a targeted attachment through the real authority,
  reconnects before the pending action executes, and opens connector edges by ID.
  Both clients retain the host's 600-tick result (rules 9, protocol 3: `94cd927e`), including
  attachment application and the stored explosion.
- AE-4 adds remote topology connection using a tower ID, a copied w on a distant
  logical cell and resynchronization after that form change. The three worlds
  match at rules-9/protocol-3 checksum `ba7fcfd7` after 600 further ticks.
- A movement fixture submits layered pushes and mirror-group shifts by entity ID,
  rejects an unauthorized actor and a stale repeat, resyncs during interpolation,
  and verifies inherited generated-tower level/facing. All three worlds agree at
  `d370331b` after 600 further ticks (rules 9, protocol 3).
- Rules 8 fixes supported mirror shells disappearing on movement. Version metadata
  changes raw hashes; historical combat fixtures still match after version
  normalization. Current-version full/checkpoint replay tests agree. Session,
  authority, synchronization and checksum dependencies are guarded against Phaser
  and DOM imports.

With Vite running, use `node scripts/test-battle-sync-browser.mjs`; it accepts
`--url`, `--playwright` and `--browser` in the same form as the other browser tests.
`--browser` only selects Chromium's executable. `--engines=chromium,chromium,chromium`
is available for same-engine diagnostics, but does not replace the default mixed-
engine gate. Install Playwright Firefox and WebKit for the default test.
No desktop packaging is needed.

## Remaining Work

The [independent entry](independent-battle.md) now shares startup, control execution
and logical restoration with the scene. Legacy pointer recordings still require
the local adapter. Entity wire relationships use
IDs. Optional ownership, wallet and resource policies support separate players;
actual peer input/HUD and generic connection lifetime are now implemented.
Production transport, join UI and mode selection remain open. Durable authority recovery
now has file/process and real browser tests; distributed failover and storage
throughput tuning remain separate work.
Full-state checksum and snapshot cost need broader profiling on crowded battlefields;
the wire-state document records an initial Node-only static benchmark, not full
battle FPS. No performance improvement is claimed by this synchronization work. See the
[multiplayer acceptance gates](multiplayer-readiness.md).
