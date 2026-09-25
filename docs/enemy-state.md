# Enemy State Boundary

`game/enemyState.ts` owns enemy data, base-panel projection and initial-state
construction. `Enemy` in `types.ts` extends it with display objects and live
relationship types. `game/enemyFactory.ts` attaches those objects, records discovery
outside playback and supplies the battle RNG. The pure factory neither reads
progress nor owns a random stream.

Initialization preserves field order, lazy SP state, timer sentinels, spawn lanes
and random consumption: ordinary enemies draw once for speed variance; leaders
and solar bombs draw nothing. Tildes retain between-lane spawning, and archangels
start with permanent flight plus their separate entry high-flight effect.
Panels, effects, cargo lists and skill objects are not shared between spawns.

## Queries And Effects

`game/enemyCombatRules.ts` contains pure airborne/burrowed checks, melee and ranged
eligibility, leader-restricted mechanics, volley counts, attack timing and speed
rules. Existing exports in `enemyBehaviors.ts` remain compatible, but runtime
callers import queries directly. Solar-bomb identity lives in `enemyIdentity.ts`
instead of pulling in shape rendering.

`game/rules/statusEffectRules.ts` owns effect lookup, refresh, removal, expiry,
multiplier calculation and accumulated physical damage against freezing. Its
functions load without Phaser and operate on data holders.

- Expiry remains explicit. Name queries and multiplier calculation do not advance
  time; high-flight path sentinels remain owned by movement.
- Expiry/removal compact the existing effect array, preserving surviving object
  identities and order. Multiplier calculation writes into a caller-owned result.
- Power uses the strongest surviving strength; other multipliers keep their old
  multiplication order. Aura haste and timed haste retain separate lifetimes.
- Freeze breaks at cumulative physical damage of half maximum HP. Reapplication
  resets the counter. Sunder refresh replaces its deadline.

`game/statusEffects.ts` now owns renderer-free lifecycle coordination. It updates
a nonserialized revision after mutations and keeps numeric caches in a WeakMap.
Runtime callers should use it when changing effects; low-level mutators alone
would not invalidate same-tick display. Passenger logical seats retain their
original update timing, independently of body transforms.

`render/enemyFacing.ts` handles shape facing without the entire enemy factory.
Its rank labels keep readable orientation and chevrons retain their form update.
Status rendering is now in `render/enemyStatus.ts`, refreshed once per displayed
frame after simulation. Effect timing and authoritative positions are unchanged.

## Snapshots

`captureBattleSnapshot.ts` uses a type-checked record of every `EnemyState` key,
including optional fields. A new gameplay field requires a snapshot decision at
compile time; new display caches cannot accidentally enter saves.

Encoding retains original property order and graph references for shared health,
parenthesis passengers, burrow cargo, stored enemies, projectiles and companions.
The existing restore path still recreates visuals and reconnects the graph.
Checkpoint layout, migrations and battle rules version are unchanged.
`nextHasteTrailAt` stays serialized for existing replay checksums.

## Verification And Remaining Work

`test-enemy-state.mjs` and `test-status-effect-rules.mjs` load without engine stubs.
They cover all registered families, dynamic high ranks, injected RNG calls,
special spawns, effect deadlines, frozen damage, eligibility and legacy cyclic
snapshots. Browser checks cover status visuals, parentheses, chevrons, shared
glyphs and deterministic save/replay continuation.

This is not a renderer-free battle engine. Cargo and pool contracts now use pure
state references, but health, promotion and movement still coordinate visuals.
Boss state and session orchestration are extracted; stable entity IDs and a
complete scene-independent world simulation remain future work. See
[combat state](combat-state.md) and [battle session](battle-session.md).
The follow-up [unit geometry extraction](unit-geometry.md) removed the remaining
`combatStats.ts`, `enemySupport.ts` and `targeting.ts` runtime import cycle.
Dependency tests now protect this boundary. These passes do not claim a measured
battle FPS gain.
