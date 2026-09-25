# Independent Battle Entry

`createIndependentBattle` in `game/independentBattle.ts` boots a complete data-only
host, replica or semantic replay. It reads no profile, browser, renderer, wall
clock or transport. The caller supplies the captured session configuration.

## Shared Paths

- `battleSetup.ts` creates the session and world for both this entry point and the
  actual GameScene. Tutorial difficulty and unlimited-firepower weight adjustments
  share one implementation. Invalid levels, cards and replay headers are rejected.
- `BattleRuntime.executeCommand` applies semantic operations **and controls**.
  Its retained `sessionRuntime` supplies complete fixed-step advancement and
  command execution without a UI. Local scene adapters use the same executor.
- `battleControlRuntime.ts` owns reselection/deadlines, debug damage/resources,
  flawless eligibility, tutorial observations and settings-triggered upgrades.
  Live observers only rebuild views, refresh HUD state or play effects.
- `restoreBattleData.ts` owns codec construction defaults and legacy attack,
  Boss haste, DEL hitbox/skill, status and passenger-seat restoration. Defaults
  do not consume battle RNG and cannot depend on a display factory's RNG.
  `battleSnapshot.ts` supplies display objects and renders the restored state.
- Validation permits absent cosmetic Boss rotation fields. Present values must
  still be finite; authoritative positions, dimensions and combat fields remain
  required. This fixed pure Boss checkpoints being rejected by browser clients.
- Static symbols live in `data/symbols.ts`; localized enemy names live in
  `enemyDisplayName.ts`. Combat registries no longer import browser language or
  profile settings just to obtain display text.

## Host Integration

```ts
const runtime = createIndependentBattle(options);
const authority = new BattleAuthority(battleId, runtime.session, {
  available: () => !runtime.world.gameOver,
  inputTime: ingressClock,
  execute: command => runtime.executeCommand(command)
});
const host = new BattleSyncHost(runtime.session, authority, {
  inputTime: ingressClock,
  checksum: () => battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0])),
  checkpoint: () => runtime.session.checkpointReplay(
    captureBattleSnapshot(runtime.snapshot(runtime.world.loadout.ids[0])),
    runtime.world.loadout.ids
  )
});

// Caller owns scheduling and authenticated connection lifetime.
runtime.session.advance(elapsedMilliseconds, runtime.sessionRuntime);
host.publish(false);
```

Authenticate peers before `host.connect(actorId, send)`. Do not expose authority
handles or trusted submission as client RPCs. A Node/Electron host bundles the
TypeScript module graph through its own build entry; tests use the existing TS
loader. No production server or lobby is implied by the HTTP test fixture.

For a semantic recording, pass `{ playback: replay }`. For a checkpoint, pass
`{ checkpoint }` with its captured current loadout. Restore validates the graph
against the level and verifies card order before constructing the runtime state.
A replica requires `{ replica: true, checkpoint }`, cannot advance from local
frame time, and follows accepted frames with `session.followFrame`.

Legacy pointer/tool recordings intentionally still require the local input adapter.
They are explicitly rejected by this headless entry instead of silently skipped.
Current live UI records semantic commands. Profile settlement stays outside the
runtime in the live presentation adapter.

## Verification

- `test-battle-runtime.mjs` covers full rules plus independent boot, complete
  controls through real authority, 30/144 Hz semantic replay, cooldown-preserving
  reselection, validated checkpoint resume, stale tutorial selections, debug
  damage, legacy migration and six families of headless Boss checkpoint validation.
- Boundary tests follow all emitted dependencies and reject rendering imports,
  native approximated math, browser globals and wall-clock/timer use.
- `test-headless-host-browser.mjs` uses the production independent entry in Node,
  a real authority and serialized HTTP messages to Firefox and WebKit GameScenes.
  IF-1, 5-10, AE-EX-2 and AE-10 cover joining, remote controls/deployments, pause,
  reselection, denied permissions, a lost receipt followed by reconnect without
  double deployment, and checksum divergence repair. AE-EX-2 runs through active
  NUL and resynchronizes while towers are suspended. Client profiles stay unchanged.
- Existing browser replay baselines and strict independent-runtime comparisons
  remain required regression gates; no checksum rounding or test-only simulation
  callbacks are used by the independent host.

Run with Vite and Playwright installed:

```sh
node scripts/test-headless-host-browser.mjs
```

It accepts `--ownership`, `--economy`, `--resources`, `--url`, `--playwright`, `--engines=firefox,webkit` and an optional
`--browser` executable for Chromium. It does not access the player's browser profile.

The [durable host](durable-battle-host.md) now adds atomic checkpoint/receipt commits
and process-restart recovery. Optional [tower ownership](battle-ownership.md) is
integrated in semantic execution, as are [individual wallets](battle-economy.md).
Optional [individual resources](battle-player-resources.md) isolate decks and cooldowns.
Real remote-input
UI/transport lifecycle and crowded synchronization profiling remain open. This
entry completes the independent simulation path, not the whole multiplayer goal.
