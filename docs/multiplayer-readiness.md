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
  snapshot fields, and dependency-boundary tests exist. Status lifecycle and
  final-stat/support calculations now run without Phaser; passenger relationships
  use data-state contracts, and aura caches are isolated per battlefield. Battle
  controllers still coordinate live objects; gate 1 is only partial. See
  [combat state and display](combat-state.md).
- Determinism: the integrated `BattleSession` now owns fixed steps, seeded battle
  RNG, delayed action queue, recording and checkpoint timing. Independent session
  tests and unchanged browser replay checksums verify this extraction. `BattleWorld`
  now owns rosters/progress, tick order, resource/wave rules and phase state. Three
  real local worlds pass interleaved advancement, checkpoint and restart isolation.
  Its live system ports still depend on scene controllers/rendering. Board
  mutations and manual skills now share a semantic gate with explicit entity targets, capability
  checks and a host authorization port; direct operation recordings replay too.
  Skills, one-shot triggers, push directions and topology destinations have explicit
  commands, whole-group preflight and live UI/save/replay coverage. A local S picker
  no longer affects authoritative SP recovery. Mouse recordings still contain UI
  intent. Global settings, time controls, reselection, debug and tutorial actions
  now have a renderer-free policy/validation gate. Reserve drafts no longer affect
  auto-upgrade execution, and selected cards are excluded from combat checksums.
  Complete local UI/recording separation, multiplayer policies and the live loadout
  adapter still need work; gates 2-3 remain open. See [global controls](battle-controls.md),
  [semantic operations](battle-operations.md),
  [session boundaries](battle-session.md) and [world ownership](battle-world.md).
- Identity: common battle-local IDs now cover live towers, enemies, Boss bodies,
  projectiles and edges. Allocator history and IDs survive snapshots, old saves
  are adopted, and historical references have live-browser coverage. The first
  semantic operations use these IDs; remaining commands and serialized combat
  relationships still need migration. Gate 4 remains open. See
  [entity identity](battle-entity-identity.md).
- Networking: no authority protocol, participant policy, acknowledgment/resync
  implementation or two-client integration test yet. Gates 5-7 are open.

Next: finish separating local UI state/recording, complete
participant/resource policies and simulation/presentation ports, then
implement transport authority and reconnect. Validate each increment against the
real battle path; green isolated tests are not proof of full readiness.

See [existing replay contracts](multiplayer-preparation.md),
[performance measurements](performance.md) and [Boss state](boss-state.md).
