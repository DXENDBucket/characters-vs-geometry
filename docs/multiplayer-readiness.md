# Multiplayer Readiness

Goal: make the existing game ready to integrate multiplayer without choosing a
specific cooperative or competitive mode. This is not complete while only isolated
rules can run in Node. The real single-player path must use the same core and
command contracts as the future authoritative host.

## Acceptance Gates

1. Explicit battle data and presentation boundaries for towers, enemies,
   projectiles, Bosses, cooldowns, actions and relationships. No Phaser, DOM,
   wall-clock or cosmetic RNG dependency in the authoritative core.
2. An independent battle session advances the actual game's complete simulation
   using fixed ticks and seeded randomness. The existing single-player scene is
   an adapter, not a second implementation of the game rules.
3. Semantic commands identify their actor, target and intended operation. Local
   selection is not shared authoritative state. Ownership, resources, cooldowns,
   pause and speed policy can be configured for a future mode.
4. Stable battle-local entity IDs survive snapshots and restore. Commands and
   serialized relationships do not rely on live Phaser object references.
5. A transport-neutral authority boundary validates schemas, participant identity,
   permissions, command ordering, duplicates and bounded inputs. It does not trust
   client-computed damage, resources or simulation progress.
6. Versioned snapshots, command acknowledgments and checksums support joining,
   resynchronization and reconnect without repeating accepted actions. Persistent
   player progress remains outside replay and remote simulation.
7. End-to-end tests exercise the actual game with two independent clients, late,
   duplicated, out-of-order and unauthorized messages, and disconnect/reconnect.
   Existing saves, deterministic replay and single-player UI remain verified.

A Steam transport, matchmaking service and finalized multiplayer game mode are
separate integration decisions. Their absence does not justify skipping the
transport-neutral authority and synchronization gates above.

## Current Evidence And Next Work

- Data boundaries: pure tower, enemy, projectile and Boss construction, explicit
  snapshot fields, and dependency-boundary tests exist. Battle controllers and
  relationships still contain live references; gate 1 is only partial.
- Determinism: fixed steps, seeded battle RNG, delayed action queue, recordings,
  checkpoints and Chromium replay comparisons exist. The scene still owns the
  simulation, and recordings contain single-player UI intent; gates 2-3 are open.
- Identity: tower placement IDs exist, but remaining units and Boss parts need a
  common identity lifecycle. Gate 4 is open.
- Networking: no authority protocol, participant policy, acknowledgment/resync
  implementation or two-client integration test yet. Gates 5-7 are open.

Implementation order: complete state contracts, extract session orchestration and
simulation/presentation ports, introduce identities and semantic player commands,
then implement transport authority and reconnect. Validate each increment against
the real battle path; green isolated tests are not proof of full readiness.

See [existing replay contracts](multiplayer-preparation.md),
[performance measurements](performance.md) and [Boss state](boss-state.md).
