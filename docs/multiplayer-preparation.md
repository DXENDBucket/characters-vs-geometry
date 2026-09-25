# Multiplayer Preparation

Multiplayer rules are not decided yet. This is an incremental separation of game
rules from browser input and rendering, not a multiplayer implementation.

## Current Boundary

- `src/game/rules/towerMovement.ts` has no Phaser, DOM, storage, or wall-clock
  dependencies. It accepts a movement command and a read-only board interface.
- Commands contain tower IDs, expected source cells, and an anchor destination.
  They can be serialized as JSON. Internal commands are not a transport trust
  boundary: the integrated authority validates schema, identity and ordering.
- `TowerShifterController.createMoveCommand()` captures local selection.
  `executeMove()` resolves those IDs against the current battle, checks cooldown,
  revalidates the complete move, applies it, and emits the applied moves.
  Execution does not depend on the local selection or mouse pointer.
- Preview and execution share the same planner. A preview is not authorization:
  a tower disappearing, moving, or being replaced invalidates the old command.
- Only a successful move consumes cooldown. All selected towers are validated
  before any cell is changed. Selected towers may enter one another's vacated
  cells. The existing topmost-then-leftmost anchor rule is preserved.
- The shared runtime handles mirror removal and aura refresh, including moves
  without a display or mouse handler.
- IDs use a battle-local allocator, independent of coordinates and timestamps.
  Paused placement, transient cards, mirrors and same-cell rebuilding have distinct
  identities. Snapshots preserve allocator history and relationship IDs.

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
  for the actual single-player scene. World simulation is supplied by the shared
  data-only [BattleRuntime](battle-runtime.md), also usable in Node.
- Live input records semantic `BattleCommand` operations and controls: explicit
  cells/targets, skills, erasure, reserve changes, reselection, debug actions and
  tutorial progression. Commands run between ticks, ordered by tick and sequence.
  Local card/tool selection and aiming stay out of the combat log. Tutorial tool
  observations have their own bounded lesson command, not shared UI selection.
- Board mutations and manual skills support explicit `operation` commands with
  stable target references and a shared validation/authorization gate. The mouse
  path uses the same executor and records explicit commands. See
  [Semantic Battle Operations](battle-operations.md) for the remaining boundary.
- Global controls use explicit `control` commands with separate host capabilities.
  Reserve edits are local drafts and selected cards are excluded from checksums.
  Rules v9 reads v1-8 saves but rejects old-version recordings; see
  [Battle Controls](battle-controls.md) for compatibility and live verification.
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

// Trusted semantic API, also used by local input; not a network authentication boundary.
scene.submitPlayerOperation("local", {
  type: "deploy", card: "A", cell: { lane: 3, column: 2 }, expected: null
});
scene.submitPlayerControl("local", { type: "reserve", value: 500 });
```

Playback stops at `endTick`. Pause and speed controls are recorded at battle ticks,
not wall-clock timestamps; idle paused wall time is not replayed. There is no replay
file picker or replay library UI yet. Checksums include logical state and pending
attacks, but exclude purely visual Boss rotation and the render-time accumulator.

Recordings require the same game rules and data. Bump `BATTLE_RULES_VERSION` when
changing gameplay semantics or balance in an incompatible way. The checksum is a
diagnostic, not authentication. Rules 9 use pinned deterministic math with exact
Node/Chromium/Firefox/WebKit gates, including production-minified kernel vectors.
Tested platforms and coverage limits are documented in [math](battle-math.md);
arbitrary engine versions, CPU architectures and different rule versions are not
implicitly interchangeable.

## Next Boundaries

The complete integration acceptance gates and current gaps are tracked in
[Multiplayer Readiness](multiplayer-readiness.md). Pure state construction and
explicit snapshot fields now cover towers, enemies, projectiles and Bosses;
the single-player game now shares a complete data-only runtime. Entity wire
relationships use stable IDs rather than local graph traversal indices.

1. Isolate participant UI instances and local-modal versus battle pause policy;
   define configurable participant/resource policies without requiring a specific
   multiplayer mode to have been chosen.
2. Complete independent input/checkpoint adapters and legacy display hydration.
   Keep semantic commands and authoritative progression separate from local views.
3. Complete ownership, currencies and cooldown policies. Extend existing authority
   and synchronization from same-live-host reconnect to durable host recovery,
   and integrate transport lifetime handling with actual player input.

Authority and synchronization now exist, and independent browser processes
exercise actual battles over an authenticated test relay. There is still no
production transport/lobby or player-facing connection flow. The relay is test
infrastructure, not a deployable game service. Remaining gaps are tracked in the
readiness document; replay commands never replace transport authentication.

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
