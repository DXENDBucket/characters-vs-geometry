# Multiplayer Preparation

Multiplayer rules are not decided yet. This is an incremental separation of game
rules from browser input and rendering, not a multiplayer implementation.

## Current Boundary

- `src/game/rules/towerMovement.ts` has no Phaser, DOM, storage, or wall-clock
  dependencies. It accepts a movement command and a read-only board interface.
- Commands contain tower IDs, expected source cells, and an anchor destination.
  They can be serialized as JSON. A command is internal typed data, not an
  untrusted network packet; a future transport must validate incoming schemas.
- `TowerShifterController.createMoveCommand()` captures local selection.
  `executeMove()` resolves those IDs against the current battle, checks cooldown,
  revalidates the complete move, applies it, and emits the applied moves.
  Execution does not depend on the local selection or mouse pointer.
- Preview and execution share the same planner. A preview is not authorization:
  a tower disappearing, moving, or being replaced invalidates the old command.
- Only a successful move consumes cooldown. All selected towers are validated
  before any cell is changed. Selected towers may enter one another's vacated
  cells. The existing topmost-then-leftmost anchor rule is preserved.
- The scene handles mirror-network removal and aura refresh through `onMoved`,
  so these effects also run for moves executed without the mouse handler.
- Tower IDs use the battle's monotonically increasing placement order. Paused
  placement, transient effect cards, mirror creation, and same-cell rebuilding
  no longer share an ID just because their coordinates and time match.
  IDs are unique within a battle, not across restarts or independent peers.

## Next Boundaries

1. Apply the same command/validation/result boundary to placement, upgrades,
   erasure, targeted cards, and manually activated skills. Keep card selection,
   hover, tool selection, and targeting previews local to each player.
2. Separate simulation state from Phaser objects in towers, enemies, projectiles,
   card cooldowns, and boss parts. Introduce stable IDs for the remaining units.
   Publish data snapshots and visual events instead of serializing game objects.
3. Give combat a simulation-owned clock and scheduled event queue. Existing
   delayed attacks use Phaser timers and callbacks; frame delta controls movement.
   Extract those before claiming headless simulation or deterministic replays.
4. Inject a seeded gameplay random generator for waves and movement variation.
   Keep purely visual randomness separate from gameplay randomness.
5. Once the multiplayer mode is chosen, define ownership, currencies, cooldowns,
   pause/speed permissions, and the authoritative simulation. Add session IDs,
   command sequence numbers, duplicate rejection, schema validation, snapshots,
   and reconnect support at the transport boundary.

Moving towers by command is the first migrated operation. Other operations still
mutate the local scene, and there is currently no server, lobby, synchronization,
network authorization, or replay guarantee. The rendering adapter still requires
Phaser even though its movement rules can run without it.

## Verification

`npm run test:rules` runs the pure movement rules in Node using the existing
TypeScript compiler. Coverage includes JSON round trips, anchor ordering, group
overlap, sealed and out-of-bounds cells, stale requests, replacement towers,
invalid coordinates, compounded cooldown, and non-mutating validation.

Run `npm run build` and `npm run validate` after adapter changes as well.
