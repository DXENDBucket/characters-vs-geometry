# Tower Simulation

## Actual Battle Path

`GameScene` delegates normal attack timing and deferred volleys to
`game/towerCombat.ts`. The single behavior registry now lives in
`cardBehaviorRules.ts`: targeting, firing, healing, production, lasers,
relocation, melee, predictive mortars and summons use data-only states and
explicit runtime ports. `towerTargeting.ts` contains the shared pure queries.
The old public behavior and targeting modules are compatibility adapters, not
alternate implementations.

`triggerTowerRules.ts` owns one-shot consumption, debuffs and scheduled pulses.
Routing still consumes the source without duplicating its local attack.
`TowerSkillSimulation` owns SP, activation, skill imitations, guardian healing,
clock cooldown bonuses, air patrol and in-flight spell mortars. Its live
`TowerSkillController` only owns the local S target selection/reticle and
delegates battle execution to the simulation.

The orientation, gathering and push APIs also delegate to their pure skill
rules. Skill definitions resolve the current presentation port at use time,
so replacing the view does not leave captured visual callbacks behind.

## Boundaries

- Cached live adapters forward current rosters/time, preserve factory entity
  allocation and connect damage, storage, generation and pipeline callbacks.
- Laser, healing and relocation scratch arrays belong to each combat runtime.
  A nested action in another battlefield cannot replace their targets.
- Display observes state through combat, trigger and skill presentation ports.
  Expiration of the legacy `moveVisual` field is simulation-owned because it
  also gates push readiness; rendering only interpolates the resulting state.
- Multihit volleys keep at most five firing times, separate damage judgments,
  copied-behavior revision checks and the original last-fire timestamps.
- Manual skills preflight the entire group. Local S targeting cannot affect
  authoritative charge recovery or clear another participant's selection.
- Active spell-mortar flights are pure records; they remain executable after
  their source disappears and survive graph snapshot restoration.

## Verification

Ten new Node tests use actual data factories and damage rules, without engine
or gameplay-module mocks. They cover volley hits, unavailable attack intervals,
flying/Boss homing targets, laser stopping/debuffs, nested-world buffer isolation,
healing, production, reversed summons, routed one-shots, skill expiry, guardian
healing and flight restoration.

An actual three-scene comparison disables tower combat, trigger, skill, enemy,
projectile and lifecycle presentation in one scene and restores another from an
in-flight snapshot. All reach checksum `1922fc0b` at 900 ticks.

This also exposed a pre-existing status refresh hash discrepancy: snapshots omit
undefined modifier fields, which could later be inserted after the halo field.
Refresh now preserves the original field order and effect identity. A dedicated
regression verifies identical serialized effects after restoration.

604 rule tests, 7 audio tests, data validation and TypeScript/Vite build pass.
Browser coverage includes pipeline actions, continuous attack, copying,
attachments, board tools, AE-4 topology, explicit skill/UI/replay operations,
paused delayed-action restoration and the deterministic multi-level suite.
The connected host plus two isolated browser clients retain their join,
running, reconnect and terminal checksums.

## Still Open

Boss and pipeline controllers, targeted attachments, and broader board/network
orchestration still have live dependencies. The entire battle cannot yet run
without Phaser. Relationships still need stable-ID wire records; per-player
resource/ownership policies and production multiplayer UI/transport lifetime
handling remain unfinished. No whole-battle FPS gain is claimed by this split.
