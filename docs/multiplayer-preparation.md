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

## Deterministic Battle Foundation

- `battleSimulation.ts` advances gameplay at 60 fixed ticks per second. Frame
  time only feeds an accumulator; catch-up work is bounded per render frame and
  unprocessed ticks are retained. Pause does not advance gameplay.
- Each battle has a seeded, serializable 32-bit random stream. Wave selection,
  spawn positions and speed variance (including promotion) use this stream.
  Particle and Boss rotation randomness remains cosmetic and separate.
- All modes now use `BattleActionQueue` for delayed combat. S projectile progress
  and impacts are simulation-owned, not Phaser tween completion callbacks.
- `BattleSession` owns the clock, RNG, action queue, command ordering and recording
  for the actual single-player scene. World simulation is still supplied by the
  scene callback. See [Battle Session Orchestration](battle-session.md).
- `BattleCommand` records normalized board coordinates, modifiers, card/tool
  selection, skills, erasure, reserve changes, reselection, debug actions and
  tutorial progression. Commands run between ticks, ordered by tick and sequence.
  These are single-player session commands; tool/selection state is not yet
  independent per player. The existing movement planner remains reusable.
- Board mutations and manual skills support explicit `operation` commands with
  stable target references and a shared validation/authorization gate. The mouse
  path uses the same executor while retaining its old recording format. See
  [Semantic Battle Operations](battle-operations.md) for the remaining boundary.
- New endless saves retain the clock remainder, random state and mirror ID
  counter. Older saves can still resume, but their pre-save random history cannot
  be reconstructed. A recording started after loading uses that save as its
  checkpoint, rather than pretending it is a recording from battle start.
- Replay playback does not update progress, discovery, records or endless saves.

### Developer API

Given the active `GameScene` instance `scene` and its Phaser game:

```ts
const recording = scene.exportReplay(); // JSON-serializable
const checksum = scene.battleChecksum();
game.scene.start("GameScene", { replay: recording });

// Same input adapter used by the local UI; accepted between simulation ticks.
scene.submitBattleCommand({ type: "selectCard", id: "A" });
scene.submitBattleCommand({ type: "pointer", pointer: {
  x: 400, y: 300, ctrl: false, shift: false, right: false
} });
```

Playback stops at `endTick`. Pause and playback speed remain local presentation
controls; they do not need wall-clock events in the recording. There is no replay
file picker or replay library UI yet. Checksums include logical state and pending
attacks, but exclude purely visual Boss rotation and the render-time accumulator.

Recordings require the same game rules and data. Bump `BATTLE_RULES_VERSION` when
changing gameplay semantics or balance in an incompatible way. The checksum is a
diagnostic, not authentication. Verification currently covers Chromium at multiple
render rates; bit-identical floating-point results across different JS engines,
architectures or game versions are not promised.

## Next Boundaries

The complete integration acceptance gates and current gaps are tracked in
[Multiplayer Readiness](multiplayer-readiness.md). Pure state construction and
explicit snapshot fields now cover towers, enemies, projectiles and Bosses;
live runtime orchestration and object relationships still need separation.

1. Finish splitting UI intent into semantic commands and local selection state;
   define configurable participant/resource policies without requiring a specific
   multiplayer mode to have been chosen.
2. Separate simulation state from Phaser objects in towers, enemies, projectiles,
   card cooldowns, and boss parts. Stable IDs now exist for all entity factories.
   Publish data snapshots and visual events instead of serializing game objects.
3. Implement mode-neutral ownership, currencies, cooldowns, pause/speed policies
   and the authoritative simulation. Add session IDs,
   command sequence numbers, duplicate rejection, schema validation, snapshots,
   and reconnect support at the transport boundary.

There is still no server, lobby, rollback, network authorization, synchronization
or reconnect protocol. The rendering adapter still requires Phaser; the entire
battle is not yet a headless simulation. Replay commands are not a network trust
boundary, and transport-level validation/authority must not be skipped.

## Verification

`npm run test:rules` runs the pure movement rules in Node using the existing
TypeScript compiler. Coverage includes JSON round trips, anchor ordering, group
overlap, sealed and out-of-bounds cells, stale requests, replacement towers,
invalid coordinates, compounded cooldown, and non-mutating validation.

Run `npm run build` and `npm run validate` after adapter changes as well.

`scripts/test-battle-determinism.mjs` tests seeded sequences, clock checkpointing,
frame-rate independence, catch-up and replay command validation. For actual Phaser
battles, start Vite and run `node scripts/test-battle-determinism-browser.mjs` with
Playwright installed. Optional `--playwright=<absolute module path>`,
`--browser=<Chromium executable>` and `--url=<Vite URL>` select local tools.
This covers 30/144 FPS and jittered frames, active S flights, save continuation,
normal/Boss/endless/ASCII stages, tutorial input and the four finale phases.
