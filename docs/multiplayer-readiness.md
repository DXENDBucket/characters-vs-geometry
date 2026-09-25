# Multiplayer Readiness

Goal: make the existing game ready to integrate multiplayer without choosing a
specific cooperative or competitive mode. Passing isolated rules is insufficient:
the actual single-player path must share the authoritative core and commands.

## Acceptance Gates

1. Explicit battle data/presentation boundaries for towers, enemies, projectiles,
   Bosses, cooldowns, actions and relationships. No Phaser, DOM, wall-clock or
   cosmetic RNG dependency in the authoritative core.
2. An independent session advances the complete game with fixed ticks and seeded
   randomness. The single-player scene adapts that core rather than duplicating it.
3. Semantic commands identify actor, target and operation. Local selection is
   not authoritative. Ownership, resources, cooldowns, pause and speed policies
   can be configured for a future mode.
4. Stable battle-local IDs survive snapshots and restore; commands and serialized
   relationships do not depend on live Phaser references.
5. Transport-neutral authority validates schema, identity, permissions, ordering,
   duplicates and bounded input. Clients cannot dictate damage/resources/progress.
6. Versioned snapshots, acknowledgments and checksums support joining, resync and
   reconnect without repeated actions. Player profiles stay outside remote/replay
   simulation.
7. Tests exercise the actual game with independent connected clients, late,
   duplicated, reordered and unauthorized input, and disconnect/reconnect.
   Existing saves, deterministic replay and single-player UI stay verified.

Steam transport, matchmaking and finalized mode design are separate decisions.
Their absence does not excuse missing core/authority/synchronization guarantees.

## Current Evidence

### Simulation And Presentation

The real scene now delegates these systems to data-only implementations:

- State factories, status lifecycle, final stats, support queries and geometry:
  [combat state](combat-state.md), [unit geometry](unit-geometry.md).
- Projectile advancement/collision, reflection, Gathering and Orientation:
  [projectile simulation](projectile-runtime.md).
- Damage, shared health, removal, passengers, splits and lethal locks:
  [unit lifecycle](unit-lifecycle.md).
- Enemy movement, blocking, attacks, skills, slope flight and loading:
  [enemy simulation](enemy-simulation.md).
- Tower targeting, attacks, triggers, SP skills and delayed volleys:
  [tower simulation](tower-simulation.md).
- Boss combat, promotion, copies, companions and DEL sweeps:
  [Boss simulation](boss-simulation.md).
- Encounter spawning/succession, phase cleanup, breaches, field cells, NUL and
  storage: [encounter rules](battle-encounter.md).
- Pipeline routing, actions, output, interception, shields, healing and targeted
  attachments: [pipeline simulation](pipeline-simulation.md).
- Deployment, upgrades, mirrors, copies, topology and board-wide support refresh:
  [tower board](tower-board.md).
- Shifter cooldown/execution, whole-chain push, generated towers and actual
  semantic command application: [tower movement](tower-movement.md).

These are used by single-player, with explicit factories, callbacks and display
ports. Node integrations run without Phaser; selected real displayed, display-
disabled and restored scenes agree. Scratch state is per-world/runtime and module
guards reject rendering imports and dependency cycles.

The complete combat runtime/factory/callback graph and world-system assembly now
live in a shared [BattleRuntime](battle-runtime.md), used by the actual GameScene
and independent Node integrations. Semantic operation wiring and resolved-state
capture/restore also use that assembly. Local targeting controllers bind its
existing simulation objects rather than constructing parallel ones.

The [independent entry](independent-battle.md) now shares boot, semantic controls,
checkpoint defaults and legacy state migration with the scene. Dependency guards
and a no-browser-shim Node test verify its boundary. **Gates 1-2 are implemented
for current semantic battles**; legacy pointer recordings still require the local
adapter, and coverage is not exhaustive across content/platforms. Canonical capture
fixes property-order-sensitive checksums. Rules-9 math passes exact Node/Chromium/Firefox/WebKit
comparisons for eleven complete-runtime fixtures; see [math](battle-math.md) and
[wire state](battle-wire-state.md) for the contract and verification limits.

### Session, Commands And Profile Isolation

BattleSession owns fixed ticks, seeded RNG, delayed actions, recordings,
checkpoints and authoritative pause/speed. BattleWorld owns rosters, progress,
wave/resource rules, phases and terminal settlement. Actual UI records semantic
operations/controls; selection and aiming stay local. Captured loadout, card
clocks, policies and tutorial state restore independently of their views.
Continuing-modal policy does not unpause a peer when a local menu closes.

Explicit operations use stable entity targets, complete group preflight and
capability/authorization ports before mutation. Live rendering is an observer.
Terminal outcomes are immutable; read-only replicas and replay do not award
progress or delete saves. See [session](battle-session.md), [world](battle-world.md),
[operations](battle-operations.md), [controls](battle-controls.md),
[loadout](battle-loadout.md), [policy](battle-policy.md),
[tutorial state](tutorial-state.md) and [lifecycle](battle-lifecycle.md).

Participant capabilities and optional
[owner-only tower access](battle-ownership.md) are immutable session policy.
Ownership follows deployments, generation, mirrors, suspended and historical
entities; whole-command preflight protects foreign entities and topology.
Optional [individual wallets](battle-economy.md) now isolate payment and production,
including automatic upgrades, pipeline outputs and snapshot/host restoration.
Optional [player resources](battle-player-resources.md) now isolate initial/current
loadouts, card clocks, shifter/reselection cooldowns, extraction pools and automatic
upgrade settings. **Gate 3 has configurable policy and actual player UI bindings**:
the participant view resolves the correct wallet/deck/clocks/tools, and mouse/key
operations use the remote intent port. Firefox/WebKit real-input tests cover
deployment, shifter, erase protection, reselection, settings and pending receipts.
Actual S/# targeting and the full shifter tutorial now have Chromium/Firefox/WebKit
input coverage, including Ctrl selection and pending move/skill receipts across
scene replacement. This does not choose a multiplayer game mode or establish
every skill/tutorial UI path.

### Identity And Synchronization

Battle-local IDs cover towers, enemies, Boss bodies, projectiles and edges.
Allocator history survives snapshots and legacy-save adoption. Semantic commands
and protocol-3 serialized entity relationships use stable IDs, including historical
sources retained by actions. Local-save graph compatibility is preserved by the
wire adapter; shared non-entity objects retain graph identity. **Gate 4 is
implemented**, with identity/codec, complete-runtime and connected-client evidence.
See [entity identity](battle-entity-identity.md) and [wire state](battle-wire-state.md).

The actual single-player path uses bounded, versioned command authority with
host-bound participant handles, ordered execution, acknowledgments, retry receipts
and same-live-host reconnect. The synchronization layer transports snapshots,
command frames and checksums, handles joining and repairs divergence.

One real host and two clients in separate Chromium, Firefox and WebKit processes
communicate through an authenticated local HTTP relay. Tests cover duplicate/reordered messages, lost receipts,
reconnect, forged identity, paused actions, profile isolation and terminal resync,
plus selected normal/Boss/ASCII content, mirror/shared-health relationships,
stored removed-source actions, topology/copy changes and layered movement.
This is connected-client evidence, not merely multiple scenes in one browser.
See [authority](battle-authority.md), [synchronization](battle-synchronization.md).

**Gates 5-7 remain partial.** The relay is test infrastructure, not a production
connection/lobby service. Player input is now wired, and a
[connection owner](battle-connection.md) handles retry/backoff, status, scene
replacement and final disposal, with real-browser lifecycle checks.
[Durable host recovery](durable-battle-host.md)
now covers atomic file replacement, killed-process restart and real browser
reconnection. A reproducible [mixed-battle profile](performance.md#mixed-battle-and-durable-host-profile)
now measures simulation, replicas, rendering and real atomic storage. It exposes
costly full-state commits and crowded-client stalls. Transaction-local checksum
reuse and fused wire conversion remove duplicate work with unchanged bytes and
validation, but do not settle load/latency readiness. Broader content/fault coverage, distributed
failover and production load/latency readiness remain unfinished.

The outer `BattleHostLoop` now bounds timer-driven advancement to one pending
commit, drains fixed-tick remainder, skips idle paused writes and explicitly stops
on overload instead of discarding elapsed time. Committed timing is not exposed
before persistence. Real-clock Node/file/browser checks cover pause, resume, stop
and disk restoration. This prevents unbounded scheduling; it does not reduce the
cost of a full checkpoint or establish crowded-battle latency readiness.

## Next Work

1. Address full-checkpoint commit overhead without weakening durability; isolate
   warmed rendering/allocation and remote-client application hotspots. Broaden
   mixed profiles to saturated pipelines/mortars and long sessions.
2. Broaden fault and content coverage, especially targeted skill/tutorial input,
   while retaining exact cross-engine numeric gates.
3. Audit the full acceptance gates against current implementation and evidence.
   Steam/lobby transport and final mode design remain separate decisions.

Rules version 9 adds deterministic math and signed-zero preservation; older saves
remain loadable, while older replay rule versions are rejected. The full goal is still active. See
[replay compatibility](multiplayer-preparation.md) and [performance](performance.md).
