# Battle Synchronization

`battleSyncHost.ts`, `battleSyncClient.ts` and `battleSyncProtocol.ts` provide a
transport-neutral snapshot/command stream around the existing battle authority.
The host and replicas execute the same `BattleSession` and actual world systems;
there is no second implementation of combat. This is not yet a multiplayer UI,
production transport or renderer-free authoritative server.

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
  Player-facing build/skill controls are not yet wired to this client API.

## Stream And Recovery

Protocol version 1 messages identify the battle and snapshot stream. A cursor
contains the absolute simulation tick and next global command sequence. New
connections and resync snapshots receive a new stream; old-stream messages cannot
rewind the client. A new battle needs a new client/transport scope.

Snapshots contain a current-schema checkpoint, captured configuration, checksum
and the actor's next request number. Commands after that cursor use the existing
semantic operation/control schema. A replica validates the complete frame before
execution, maps global command indices into its checkpoint-relative recording and
follows the host's ticks using the existing executor, RNG and action queue. Pause
and speed remain battle state, not client rendering decisions.

The host publishes commands immediately and coalesces command-free advancement
to at least six ticks per update (about 10 Hz at normal speed). A frame is bounded
to 600 ticks and 256 commands; larger gaps use a checkpoint. JSON messages are
bounded to 16 MiB, with a smaller authority request limit. These limits do not
replace transport connection, queue or flood limits.

Duplicate frames are ignored. Gaps and checksum differences stop local command
submission and request a fresh snapshot. Resync is limited to once per second per
live peer, using an injected ingress clock outside deterministic combat. The
transport adapter schedules retries; this module does not start timers itself.

Reconnect retains a pending request's original sequence. If the host executed it
but the receipt was lost, retry retrieves the authority's cached receipt instead
of spending resources again. Only the latest handle for an actor remains valid.
The ledger survives reconnect to the same live host, not process loss, save reload
or host migration. Expired requests are rejected rather than silently reissued.

Checksums detect divergence; they are not cryptographic authentication. The client
trusts its authenticated host for combat results. A failed command or restore is
not transactionally rolled back; recovery requires a valid authoritative snapshot
or terminating the connection.

## Verification

- `test-battle-sync.mjs` covers the protocol and real session executor in Node:
  joining, frames, retries, resync, malformed messages, bounded inputs, transport
  failures and obsolete authority epochs. Its small world fixture is not evidence
  of a complete headless battle simulation.
- `test-battle-sync-browser.mjs` runs one host and two independent browser contexts
  with isolated local storage over an authenticated local HTTP relay. All three
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
  Both clients retain the host's 600-tick result (`b2d37fe6`), including attachment
  application and the stored explosion. Existing scenario hashes are unchanged.
- AE-4 adds remote topology connection using a tower ID, a copied w on a distant
  logical cell and resynchronization after that form change. The three worlds
  match at `77b5e210` after 600 further ticks; earlier scenario hashes are unchanged.
- Existing full/checkpoint replay tests retain their combat checksums. Session,
  authority, synchronization and checksum dependencies are guarded against Phaser
  and DOM imports.

With Vite running, use `node scripts/test-battle-sync-browser.mjs`; it accepts
`--url`, `--playwright` and `--browser` in the same form as the other browser tests.
No desktop packaging is needed.

## Remaining Work

The complete simulation still has scene-dependent system ports and graph-based
relationships. Wallets, loadouts and cooldowns remain shared; ownership/resource
policies for different multiplayer modes are not implemented. Production transport,
join UI, latency handling, reconnect UI and durable authority recovery remain open.
Full-state checksum and snapshot cost need profiling on crowded battlefields;
no performance improvement is claimed by this synchronization work. See the
[multiplayer acceptance gates](multiplayer-readiness.md).
