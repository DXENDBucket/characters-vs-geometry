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
  no longer affects authoritative SP recovery. Live UI now records only semantic
  operations/controls; legacy mouse recording remains a compatibility adapter.
  Global settings, time controls, reselection, debug and tutorial actions
  now have a renderer-free policy/validation gate. Reserve drafts no longer affect
  auto-upgrade execution, and selected cards are excluded from combat checksums.
  Auto-upgrade/shifter lessons replay with separate bounded tutorial observations,
  without activating local tools. Captured slot/card/reselection policies now
  survive snapshots and playback, including rejected commands. A configurable
  continuing-modal mode keeps simulation active under local menu/settings/reselection
  overlays and does not cancel a peer's pause when closing them. Participant UI
  instances, explicit pause-state/paused-action snapshots, tutorial snapshot state
  and combat presentation ports still need work;
  actual card slots/cooldowns/reselection now belong to a renderer-free world
  loadout. Live comparisons with no card views preserve the complete battle,
  including continued attacks, auto-upgrades, reselect, saves and replay. See
  [loadout state](battle-loadout.md). Participant capabilities are now configured
  on the session, immutable during a battle and preserved in snapshots/replay.
  See [captured policy](battle-policy.md) for access/modal integration and its limits.
  Independent participant resource policies
  have not been implemented;
  gates 2-3 remain open. See [global controls](battle-controls.md),
  [semantic operations](battle-operations.md),
  [session boundaries](battle-session.md) and [world ownership](battle-world.md).
- Identity: common battle-local IDs now cover live towers, enemies, Boss bodies,
  projectiles and edges. Allocator history and IDs survive snapshots, old saves
  are adopted, and historical references have live-browser coverage. The first
  semantic operations use these IDs; remaining commands and serialized combat
  relationships still need migration. Gate 4 remains open. See
  [entity identity](battle-entity-identity.md).
- Networking: the real single-player path now uses a transport-neutral authority
  with host-bound participant handles, versioned/bounded semantic requests,
  capability checks, ordered execution, acknowledgments, bounded retry receipts
  and same-live-host reconnect. Real battle tests cover two peer handles plus an
  observer, real costs/skills/cooldowns, snapshots and different-frame-rate replay.
  This is an in-memory ingress test, not two connected clients. Transport
  authentication, durable reconnect, join/resync and complete two-client testing
  remain missing. Gate 5 is partial; gates 6-7 remain open. See
  [command authority](battle-authority.md).

Next: complete participant/resource policies and explicit paused-control/action snapshots,
finish simulation/presentation ports, and build snapshot synchronization and
reconnect on the new authority boundary. Validate each increment against the
real battle path; green isolated tests are not proof of full readiness.

See [existing replay contracts](multiplayer-preparation.md),
[performance measurements](performance.md) and [Boss state](boss-state.md).
