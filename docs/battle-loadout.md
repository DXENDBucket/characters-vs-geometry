# Battle Loadout State

`BattleWorld.loadout` now owns the actual selected slots, indexed card states,
cooldown deadlines and `LoadoutReselection` memory. `BattleCardState` contains only
the card definition and `readyAt`; it has no display objects or display clock.
The scene's compatibility getters point at this model, not a second copy.

## Execution And Presentation

- Construction establishes slot order before a card list is created. Slot order
  still determines automatic-upgrade spending order.
- Deployment, targeted attachments, edge upgrades and operation validation consume
  pure card states. Normal and imitator slots have separate deadlines.
- `battleCardTime` selects the authoritative clock: regular cards use the
  accelerated card clock, except c and its imitated form. Other cards use battle
  time. This preserves the previous eligibility rules; c is currently too costly
  to be chosen as an imitation target.
- Reselection validates slot identity/uniqueness/capacity before consuming its
  cooldown, remembers removed cards and reestablishes deadlines without consulting
  card widgets. Host unlock/capability policy remains in the control gate.
- Imitator memory retains remaining cooldown in battle-time coordinates when
  changing target, including a change of clock domain. Native deadlines retain
  their original clock domain while absent from the loadout.
- `CardView` references a read-only card state and owns only presentation objects
  and its last displayed clock. Destroying, rebuilding or adding a second view
  cannot reset cooldowns. Rendering still happens through `BattleCardList` and
  `createCardViews` / `updateCardViews` / `destroyCardViews`.
- Tutorials obtain card views only for highlighting; deployment readiness and
  lesson combat state do not use those views.

`registry/cardDefinitions.ts` provides data lookup, imitation eligibility,
categories and synthetic imitation definitions without importing attack execution
or Phaser. `registry/cards.ts` remains the live behavior registry and reexports
the data API for existing callers. Data-only consumers import the pure module.

## Persistence And Verification

The existing ordered `cardDeadlines` and `reselection` snapshot fields are
unchanged. Restore writes deadlines into model slots, not UI objects. Saved
loadout IDs still come from the surrounding save/replay envelope. This change
did not add a new snapshot or rules version.

- `test-battle-loadout.mjs` loads the real world, loadout and definition registry in
  Node without Phaser overrides. It covers isolation, ordering, clock eligibility,
  atomic rejection, cooldown memory, imitator target changes and JSON restoration.
- `test-battle-loadout-browser.mjs` runs two actual worlds, with one card view
  absent and its renderer factory suppressed. Through 14,742 ticks it compares
  real clock skills, tower/edge auto-upgrades, attachments, reselection, retained
  cooldowns and deployment. Rebuilt/secondary views, checkpoints and 30/144 Hz
  replay preserve the complete battle checksum.
- The seven-level browser replay baselines are unchanged. Imitator, card scrolling,
  tutorial, control and battlefield input regressions exercise the live adapters.
- Dependency tests prevent the model and definition registry from acquiring a
  runtime rendering dependency.

The [independent runtime](independent-battle.md) now uses these same card models
without display objects. Optional [player resources](battle-player-resources.md)
give each builder distinct initial/current decks and cooldown history, with
wire/replay and host-restart verification. Participant-aware views and actual
peer-input routing remain part of the unfinished [multiplayer readiness](multiplayer-readiness.md) goal.
