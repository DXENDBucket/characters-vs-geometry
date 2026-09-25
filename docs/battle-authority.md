# Battle Command Authority

`game/battleAuthority.ts` is the transport-neutral command ingress used by the real
single-player UI and explicit participant commands. It wraps the existing session,
operation and control executors; it does not implement another combat simulation.
Battle rules are advertised separately. The command protocol has its own version, currently 1.

## Trust Boundary

- The trusted host configures up to 16 participants and their capabilities when
  creating the scene/session. Configuration is copied, validated and frozen.
  Omitted configuration means the original all-capabilities `local` participant.
- A transport must authenticate a connection before the host calls
  `commandAuthority.connect(actorId)`. This returns an opaque host-local handle;
  neither `connect` nor the authority object is a remotely callable endpoint.
- Bind the authenticated transport connection to that handle, then pass incoming
  JSON text to `receiveText(handle, text)`. Requests cannot supply an actor ID,
  damage, resources, simulation tick or global command sequence.
- `submitPlayerOperation`, `submitPlayerControl`, `submitTrusted` and the deprecated
  raw-input adapter are privileged host APIs, not alternatives to authentication.
- Capability checks are executed by the real operation/control gates, including
  existing whole-target-group preflight. This does not yet add per-tower ownership
  or separate player wallets: cards, cooldowns and currency are still shared.

An example request is:

```json
{
  "version": 1,
  "battleId": "host-generated-battle-id",
  "sequence": 0,
  "intent": {
    "type": "operation",
    "operation": {
      "type": "deploy",
      "card": "A",
      "cell": { "lane": 3, "column": 0 },
      "expected": null
    }
  }
}
```

## Ordering And Retries

`describe(handle)` supplies protocol/rules versions, battle ID, current host tick,
the actor's next request sequence and the oldest retained receipt. Sequences start
at zero independently for each actor. The host alone assigns execution tick and
the globally ordered session command index.

- A well-formed next request is evaluated once. Its receipt has `status: executed`
  and a game-rule `result`, which may be a rejection such as `cooldown`, `stale` or
  `forbidden`. These evaluated requests consume a sequence and enter the replay.
- An identical retry returns the original receipt without recording or executing
  again. JSON property order does not affect identity. Reusing a sequence for a
  different intention is a conflict, not a correction.
- A future sequence is rejected as a gap, with the expected sequence. There is no
  hidden out-of-order queue. An evicted old request is rejected as expired; it is
  never re-executed. A cached receipt's sequence hint is historical; use `describe`
  for the current position after reconnect.
- Only the newest connected handle for an actor remains valid. Disconnect removes
  the handle but retains its actor's sequence and receipts in the live authority.
- Repeated requests can retrieve a cached result after the game has ended.
  Scene shutdown, restart or save restoration closes the old authority. A fresh
  battle ID prevents old input from being applied to a restored/rewound world.
- A throwing game handler fails the authority closed because the world may already
  have changed. There is no automatic retry or claim of transactional rollback.

Input is limited to 64 KiB of UTF-8 JSON, exact bounded schemas and 64 retained
receipts per actor. Remote execution is limited to 128 evaluated requests per
actor per 1000 ms host-ingress window. That injected clock is independent of the
simulation clock, so pause cannot deadlock rate-limit recovery. It never affects
combat timing or replay. Trusted local input is not network-rate-limited. Transport
connection/flood limits are still the transport's responsibility.

## Persistence And Limits

Participant capabilities are included in new configured-session snapshots and
replay headers. Replay uses those capabilities, not the current local defaults;
checkpoint policies must match the recording. Old single-player snapshots and
recordings retain the default participant and their unchanged checksums.

The authority's request ledger, channel handles and ingress time are intentionally
outside combat checksums. The ledger currently survives only reconnect to the same
live authority, not process loss or loading a save. There is no production network
adapter, host migration or durable reconnect yet. The new
[synchronization layer](battle-synchronization.md) adds client snapshots, late join,
checksummed command frames and same-live-host reconnect. Slot/card access and the local-modal pause choice now come from
[captured session policy](battle-policy.md); replay no longer grants access that
was denied by a newly recorded battle. The default still pauses local single-player
menus, while an explicitly configured host can continue under overlays. Separate
resources and participant-owned UI still need work. Paused-action snapshots now
have actual browser restore/replay coverage; see [session state](battle-session.md).

## Verification

- `test-battle-authority.mjs`: schemas, frozen participants, impersonation, capability
  enforcement, global/per-actor ordering, retry/conflict/expired/gap behavior,
  same-host reconnect, bounds, paused rate-limit recovery, lifecycle invalidation,
  reentrancy, failing handlers and replay/checkpoint policy restoration. Runs in
  Node without Phaser, as part of `test:rules`.
- `test-battle-authority-browser.mjs`: two authenticated peer handles and an observer
  act on the actual game alongside local UI. Checks real tower costs/cooldowns,
  stable-target rejection, skill authorization, commands during a local menu,
  retries/reconnect, validated snapshots and full/checkpoint 30/144 Hz replay.
  The fixture reaches 1800 ticks with protocol-2 checksum `ededb3fc`, including captured access policy and lifecycle.
- Existing board/skill/control/tutorial browser tests and the seven-stage replay
  suite remain passing. All seven pre-policy combat baselines remain unchanged
  under the frozen test-only historical hash. Current checksums use canonical
  serialization and additionally cover access/modal policy.

The authority browser test uses in-memory serialized requests and real battle
scenes. A separate synchronization browser suite now exercises two independent
clients over an authenticated HTTP relay. Neither test implies completion of all
[multiplayer acceptance gates](multiplayer-readiness.md).
