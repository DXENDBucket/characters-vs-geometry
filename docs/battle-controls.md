# Battle Controls And Local UI

`battleControls.ts` is a renderer-free semantic boundary for ten control intents:
pause, speed, auto-upgrade enablement, reserve, reselection, debug enablement,
debug resources, debug damage, tutorial advancement and tutorial interactions. The real scene uses it
from both UI adapters and `GameScene.submitPlayerControl(actorId, control)`.

## Validation And Policy

- Desired settings are explicit values, not toggles. Reapplying the same setting
  has no effect callback. This is not transport-level request deduplication;
  resource grants and other actions are deduplicated by the separate authority protocol.
- The host resolves participants and authorizes separate `time`, `settings`,
  `loadout`, `debug` and `tutorial` capabilities. Identity strings are not proof of
  authentication. Single-player still registers only the trusted `local` actor.
- Inputs require exact fields, bounded numeric values, finite board points and
  bounded nonempty card lists. Duplicate cards/imitator slots are rejected.
  Clients cannot supply damage, granted currency, skill strength or cooldowns.
- Reselection checks the host's slot count, available cards, level policy and
  readiness before changing loadout or cooldown. It retains each card's clock
  domain using authoritative time, never the card widget's last displayed time.
- Debug damage/resources require both permission and enabled debug mode.
  Tutorial actions cannot be dispatched outside an active tutorial callback.
- A local menu does not reject an explicit control. Single-player menus pause by
  default; a captured host policy can keep scene/simulation advancement active
  underneath menu, settings and reselection overlays. Closing those local overlays
  does not undo a peer's explicit pause. See [battle policy](battle-policy.md).

Control data lives in a separate `BattleControlState`. Reselection and card
deadlines now use the renderer-free `BattleWorld.loadout`; the scene only rebuilds
its views after success. See [loadout state](battle-loadout.md). All control effects
use `battleControlRuntime.ts` in both the scene and independent host. Participants
and capabilities are captured session data; wallets, loadouts and cooldowns remain
shared. Independently configurable player resources are still unfinished.

## Local State

Reserve editing is a local draft. Enter/Escape confirms the value; leaving the
field by choosing another tool/card abandons the draft. While editing, automatic
upgrades use the last confirmed reserve. Input focus is no longer passed into the
tower deployment or edge upgrade runtimes. A remote setting does not clear another
player's draft.

Selected card preferences remain in local saves for convenience but are excluded
from the combat checksum. `includeLocalUi: true` is a diagnostic option for
comparing the previous checksum format, not the network checksum contract.
Cosmetic rotation, clock remainder and playback speed remain normalized.
Debug enablement is now saved explicitly so a recording resumed from a checkpoint
does not inherit unrelated local settings.

Actual controls are recorded as `{ type: "control", actorId, control }`. Live
mouse, keyboard, card-list and HUD adapters now record only operations/controls.
Card selection, aim previews, tool toggles and reserve keystrokes are local.
`submitBattleCommand` remains a deprecated privileged input adapter for legacy
current-version recordings and fixtures, not the path used by the live UI.

The auto-upgrade and shifter lessons deliberately observe tool choice and selected
tower IDs. Their `tutorialInput` control carries a bounded tool/ID observation;
the tutorial reads this separate state rather than the local player's selection.
Other levels reject it. It does not activate tools, select towers or move anything.
Full 30/144 Hz tutorial replay therefore works while local tools stay inactive.
Tutorial controllers now own explicit versioned state with stable tower IDs and
derived presentation instructions. Their observations survive checkpoints without
activating local tools. All six lessons load headlessly; live 30/144 Hz checkpoint
continuations work with tutorial views removed. This is not yet network join
synchronization. See [tutorial state](tutorial-state.md).

Replay drains already-due commands before checking whether ticks can advance.
This permits a same-tick resume control to release a restored paused session.
It never advances a tick after processing a pause without a matching resume.
The session now owns and snapshots the entire `BattleControlState`, applies speed
to unscaled frame time, and enforces pause independently of the scene's runtime
predicate. Restored pause is not overwritten by local menu behavior. All deferred
combat attacks use its data queue, including attacks from already-removed sources.
See [paused checkpoints](battle-session.md#paused-checkpoints) for legacy defaults.

## Compatibility And Checks

Current rules version is **9**. Since version 7, reserve editing no longer suspends
automatic upgrades and local card selection no longer contributes to the checksum.
Older supported saves continue under current rules; older replay rule versions
are explicitly rejected. Version 9 adds deterministic math and signed-zero snapshots.
New recordings also capture slot/card access and reselection eligibility, preventing
rejected commands from succeeding during playback against another local profile.
Old policy-less recordings retain their earlier permissive behavior.

- `test-battle-controls.mjs`: schemas, capabilities, host policy, whole-loadout
  preflight, idempotent settings, debug guards, pause/resume playback and UI-free
  checksums. Runs in the normal rule suite without Phaser.
- `test-battle-controls-browser.mjs`: two real battle worlds with different local
  cards, tools and input focus; tower and edge auto-upgrades; stale display clocks;
  reselection; debug operations; menu controls; checkpoint restore; and full
  30/144 Hz replay through 14,620 ticks.
- `test-battle-input-browser.mjs`: unrecorded local selection, paused construction,
  local-modal input rejection versus explicit host execution, and complete semantic
  replays of the auto-upgrade and shifter lessons without changing local tools or
  persistent progress.
- `test-battle-pause-browser.mjs`: real paused save/resume with queued tower,
  enemy and Boss actions, removed-source identity, exactly-once continuation,
  30/144 Hz replay, legacy settings and local resume-menu isolation.
- The broader replay suite covers seven normal/Boss/endless/ASCII levels, tutorial
  progression, all finale phases and the older pointer input adapter. Its
  `v6FormatHash` is a diagnostic normalization to separate checksum-format changes
  from changes to those scenarios' combat state, not support for v6 playback.

See [multiplayer readiness](multiplayer-readiness.md) for the full unfinished goal.
