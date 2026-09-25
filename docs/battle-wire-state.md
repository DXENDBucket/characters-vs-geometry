# Battle Wire State

Protocol 2 uses `BattleWireGraph` version 1 inside synchronization checkpoints.
The host converts its local `SaveGraph` at transmission; the client validates and
decodes the wire graph once before passing a normal checkpoint to its restore
adapter. Local saves and replay checkpoints retain their existing format. Combat
rules remain version 8; protocol-1 peers are rejected rather than silently mixed.

## Identity And Order

- Every tower, enemy, Boss body, friendly/hostile projectile, mortar and connector
  edge has a record `{ id, kind, data }`. References use `{ entity: "enemy:42" }`,
  never the local save graph's traversal indices. IDs are scoped by the enclosing
  battle identity and stream.
- Non-entity structures (arrays, health pools, skill state, queued action payloads)
  have object records and `{ object: index }` references. Cycles and aliasing are
  preserved. A removed source retained by a pipeline payload is still an entity;
  it is not replaced with an untracked copy.
- Entity records are emitted in ID order. Sorted breadth-first traversal assigns
  non-entity indices; property insertion history is irrelevant. Array order is
  semantic and is not sorted. Incoming record order is not required to be canonical.
- The decoder rejects duplicate or wrong-kind identities, missing references,
  entities disguised as ordinary objects, forbidden/unknown entity fields,
  unreachable records, malformed arrays and oversized graphs. Limits are 250,000
  records and 2,000,000 fields, in addition to the transport's 16 MiB byte limit.
- Full snapshot validation still checks allocator bounds, battle configuration,
  policies, timestamps and combat state before any live restore. Passing structural
  wire validation alone does not make a graph a valid battle checkpoint.

## Checksums

The checksum is FNV-1a over the canonical authoritative save graph. Both object
keys and reference numbering are canonical, so deleting/reinserting an occupancy
relationship cannot manufacture a desync. Identity, allocation history, ordered
arrays, shared references and exact numeric values still affect the hash.

Capture can emit this canonical graph directly, avoiding an extra whole-graph
copy/validation on each checksum. Default capture keeps the old local-save order.
Presentation-only rotation, local card selection, frame remainder and the legacy
game-speed mirror retain their existing exclusions. No coordinate rounding or
numeric tolerance is used in production checksums. This is divergence detection,
not message authentication or a cryptographic proof.

Historical pre-protocol-2 hashes are verified by a frozen **test-only** helper;
live continuation, replay and network comparisons use the new checksum. Native
Node/Edge trigonometric discrepancies remain real mismatches, not hidden by this
change. Cross-engine numeric guarantees are still unfinished.

## Evidence And Cost

- Identity tests round-trip all seven kinds, shared health, passengers, Boss copies,
  historical sources and cycles; reorder both object fields and entity records;
  reject malformed records; and traverse a 12,000-record cycle without recursion.
- Protocol tests remap all non-entity indices and reverse record/field order, then
  join and continue commands without a checksum mismatch.
- The complete-runtime AE-EX-2 regression compares live, local-save and wire-save
  continuation through first occupancy refresh and NUL timing for 4,200 ticks.
- Node/browser diagnostics continue for 3,600 ticks in eleven scenarios, restoring
  a Node runtime through the wire format at tick 1,500. AE-EX-2 now passes strict
  equality. P3 still exposes two sampled native-trigonometric coordinate differences.
- The authenticated HTTP browser fixture uses actual protocol-2 messages between
  a host and two isolated clients, including pipeline actions and layered movement.

`node scripts/benchmark-battle-serialization.mjs` measures a static 800-circle
state in Node, not mixed-combat frame time or complete synchronization cost. A
local run produced a 950,965-byte checkpoint, about 10.0 ms median checksum time
(old noncanonical checksum 7.5 ms), 13.3 ms wire conversion and 14.1 ms wire decoding.
An initial implementation with a second graph traversal took about 16.9 ms for
the checksum. These figures are diagnostics, not portable performance guarantees;
browser, mixed-content, queueing and full restore costs still need profiling.
