# Battle Wire State

Protocol 3 uses `BattleWireGraph` version 2 inside synchronization checkpoints.
The host converts its local `SaveGraph` at transmission; the client validates and
decodes the wire graph once before passing a normal checkpoint to its restore
adapter. Local saves and replay checkpoints retain their graph format, with an
additional `-0` numeric tag. Combat rules are version 9; older protocol/wire peers
are rejected rather than silently mixed. See [deterministic math](battle-math.md).

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
- Encoding validates the entire input graph, then discovers reachable records in
  that same sorted breadth-first order directly into wire records. It no longer
  materializes an intermediate canonical `SaveGraph`. No trusted-input bypass,
  wire version change, reference-order change or input mutation is involved.
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

Historical pre-protocol-2 hashes are verified by a frozen **test-only** helper and
native-math diagnostic route; live continuation, replay and network comparisons
use current math and checksums. Rules 9 resolve the observed native Node/Edge
trigonometric discrepancies, without tolerating or rounding numeric differences.

## Evidence And Cost

- Identity tests round-trip all seven kinds, shared health, passengers, Boss copies,
  historical sources and cycles; reorder both object fields and entity records;
  reject malformed records; and traverse a 12,000-record cycle without recursion.
- A frozen pre-fusion encoder provides byte-for-byte comparison over 40 seeded
  node/reference/key permutations, integer-looking object keys, cyclic data,
  unreachable nodes, all entity kinds and tagged numbers. Encoding still rejects
  malformed unreachable data, forbidden keys, missing references and invalid or
  duplicate identities. The mixed-combat benchmark checks exact old/new bytes too.
- Protocol tests remap all non-entity indices and reverse record/field order, then
  join and continue commands without a checksum mismatch.
- The complete-runtime AE-EX-2 regression compares live, local-save and wire-save
  continuation through first occupancy refresh and NUL timing for 4,200 ticks.
- Strict Node/browser comparisons continue for 3,600 ticks in eleven scenarios,
  restoring a Node runtime through the wire format at tick 1,500. Chromium,
  Firefox and WebKit agree exactly, including P3 and AE-EX-2.
- The authenticated HTTP browser fixture uses actual protocol-3 messages between
  separate Chromium/Firefox/WebKit processes, including pipeline actions and
  layered movement. Identity tests also preserve signed zero through JSON.

`node scripts/benchmark-battle-serialization.mjs` measures a static 800-circle
state in Node, not mixed-combat frame time or complete synchronization cost. A
protocol-2 local run produced a 950,965-byte checkpoint, about 10.0 ms median checksum time
(old noncanonical checksum 7.5 ms), 13.3 ms wire conversion and 14.1 ms wire decoding.
An initial implementation with a second graph traversal took about 16.9 ms for
the checksum. These figures are diagnostics, not portable performance guarantees;
broader workloads and queueing still need profiling.

The [mixed battle benchmark](performance.md#mixed-battle-and-durable-host-profile)
now includes a same-process old/new encoder comparison. In a local Node 22.19.0
Windows run (24 samples), old/new median encoding times for 100 / 400 / 800
requested enemies were 2.44/1.21, 6.58/3.43 and 13.25/7.09 ms. Wire bytes are
identical. These are conversion costs, not overall battle FPS or full restore
latency; snapshot cloning, hashing, client validation and durable storage remain.
