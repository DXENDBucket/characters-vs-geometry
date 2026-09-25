# Battle Controls And Local UI

`battleControls.ts` is a renderer-free semantic boundary for nine control intents:
pause, speed, auto-upgrade enablement, reserve, reselection, debug enablement,
debug resources, debug damage and tutorial advancement. The real scene uses it
from both UI adapters and `GameScene.submitPlayerControl(actorId, control)`.

## Validation And Policy

- Desired settings are explicit values, not toggles. Reapplying the same setting
  has no effect callback. This is not transport-level request deduplication;
  resource grants and other actions still need the future authority protocol.
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
- A local menu does not reject an explicit control. The single-player menu still
  pauses the Phaser scene; separating that local modal from host advancement and
  applying a multiplayer pause policy are remaining integration work.

Control data lives in a separate `BattleControlState`. Actual costs, callbacks and
card rebuilding still use live scene adapters. Time and resource policies remain
single-player defaults; a participant registry, independent wallets and a complete
renderer-free loadout runtime are not implemented by this boundary.

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

Actual controls are recordable as `{ type: "control", actorId, control }`. Legacy
pointer/tool commands still execute through the same operation/control gates, but
are not yet removed from local recordings. Complete per-player selection objects
and recording only semantic commands remain next work.

Replay drains already-due commands before checking whether ticks can advance.
This permits a same-tick resume control to release a restored paused session.
It never advances a tick after processing a pause without a matching resume.

## Compatibility And Checks

Rules version is now **7**: reserve editing no longer suspends automatic upgrades,
and local card selection no longer contributes to the checksum. Version 1-6 saves
remain readable and continue under current rules. Version 6 recordings are
explicitly rejected rather than silently interpreted with new input semantics.

- `test-battle-controls.mjs`: schemas, capabilities, host policy, whole-loadout
  preflight, idempotent settings, debug guards, pause/resume playback and UI-free
  checksums. Runs in the normal rule suite without Phaser.
- `test-battle-controls-browser.mjs`: two real battle worlds with different local
  cards, tools and input focus; tower and edge auto-upgrades; stale display clocks;
  reselection; debug operations; menu controls; checkpoint restore; and full
  30/144 Hz replay through 14,620 ticks.
- The broader replay suite covers seven normal/Boss/endless/ASCII levels, tutorial
  progression, all finale phases and the older pointer input adapter. Its
  `v6FormatHash` is a diagnostic normalization to separate checksum-format changes
  from changes to those scenarios' combat state, not support for v6 playback.

See [multiplayer readiness](multiplayer-readiness.md) for the full unfinished goal.
