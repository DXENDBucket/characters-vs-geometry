# Tutorial State And Presentation

The six existing tutorial controllers now execute without Phaser, DOM, scene time,
UI widgets or rendering stubs. They remain the real game rules; there is no second
tutorial implementation for a server. Their runtime reads tower/enemy data, battle
time and explicit lesson observations, and supplies wave/finish effects.

## Ownership

- `BattleWorld.tutorial` owns the lesson model; the world ticks it after mortars and
  before regular wave scheduling. Practice starts its normal wave schedule only
  after the start command. Tutorial wave creation and weight tracking also belong
  to the world, using the existing enemy creation and wave-notification ports.
- `BattleWorld.tutorialInteraction` stores bounded tool/selected-ID observations
  from semantic `tutorialInput` controls. These are lesson input, not local UI state.
- Tutorial models produce `TutorialPresentation`: copy keys, cell/card/tool/enemy
  highlights, placement labels, category visibility and damage demonstration state.
  These are derived data, excluded from the combat snapshot.
- `render/guidedTutorialView.ts` and `render/tutorialExtras.ts` consume the data.
  Flashing uses renderer time only. Rendering is refreshed once per displayed frame
  and after explicit navigation; it cannot spawn enemies or advance lesson rules.
  Destroying the tutorial view does not destroy the model.
- The view's button submits the existing authorized/recorded `tutorialAdvance`
  control. No callback registration through a Phaser widget is required by the model.
- Remote tool observations wait for the preceding operation's receipt. A successful
  move first clears local selection, then sends `tutorialInput`; attempting both
  while the sync client has one pending request would lose the second command.
  Observation receipts do not recursively send more observations, and viewers
  without the `tutorial` permission do not submit them.
- If a pending operation outlives its scene during reconnect, the connection owner
  asks the replacement view to report its current lesson tools. Retired callbacks
  remain fenced; no old tower selection is restored and the move is not repeated.

## Checkpoints

Tutorial battles add an optional top-level `tutorial` checkpoint:
`{ state, interaction }`. Non-tutorial snapshots keep their previous shape and
checksums. State schema version is 1, independent of the battle rules version.

State records the mechanic plus its exact step, practice start flag or damage
lesson index/fired flag. Auto-upgrade, F/G and shifter references use battle entity
IDs, not live tower objects. A removed tower's ID remains meaningful: restoring
it must not substitute a newly deployed tower at the same cell. The model resolves
current objects from the world when it evaluates a rule.

The schema checks exact keys, allowed steps, ID types, bounded damage indices and
valid lesson observations. Restore rejects a lesson kind that differs from the
current level. It reconnects state after units are restored and regenerates display
instructions, without calling update/advance or replaying wave-entry effects.
Local tools and selection stay untouched.

Old non-tutorial saves and start-to-finish recordings still work. An old tutorial
checkpoint with no lesson metadata is rejected rather than silently restarting
the lesson against an already-running battlefield. That missing historical state
cannot be reconstructed reliably. This does not add a new public tutorial save UI;
it completes internal checkpoint/replay state needed for future synchronization.

## Evidence

- `test-tutorials.mjs` loads the actual models without engine stubs and tests
  deployment/wave progression, F disappearance, G arming, damage diagrams, practice
  gating, replacement-tower identity, validation and checksum contribution.
- `test-battle-world.mjs` executes the real basic tutorial model with world wave
  generation and verifies that restoring an active wave does not spawn it again.
- `test-battle-input-browser.mjs` verifies 19 auto-upgrade/shifter checkpoint
  positions, restores semantic observations without changing local tools, and
  continues each checkpoint at 30/144 Hz with the tutorial view removed.
- `test-tutorial-checkpoints-browser.mjs` covers 38 further positions across basic,
  practice, F/G and damage lessons. Cases include pending shocks from an already
  removed F and multiple commands at the same tick. Restores preserve checksums;
  view-free suffix replay matches the original battle without profile writes.
- Existing tutorial/practice browser tests and a small-screen damage-lab screenshot
  verify actual input, labels and layout. Seven normal/Boss/endless replay baselines
  retain exactly the same hashes.

`test-remote-actions-browser.mjs` drives the whole 0-5 lesson with actual card,
tool and board clicks against an authenticated independent Node authority. It
checks single movement, Ctrl multi-selection, relative group placement, a lost
movement receipt followed by reconnect/scene replacement, exactly one follow-up
observation, terminal victory and no local profile writes. It exposed both the
missing post-receipt tool observation and Phaser's macOS Ctrl-click remapping.

The older checkpoint fixtures stop before terminal finish; the remote shifter
lesson includes it. Remote actual-input coverage does not yet include every lesson
or a multi-controller tutorial policy. Tutorials share lesson observations;
the future mode decides which participants receive tutorial control permissions.
The remaining gates are tracked in [multiplayer readiness](multiplayer-readiness.md).
