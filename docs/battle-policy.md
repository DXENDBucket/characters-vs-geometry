# Captured Battle Policy

`game/battlePolicy.ts` defines the immutable per-battle access and local-modal
policy. The real single-player scene captures it once from progress when creating
a new battle. A trusted host can instead provide it explicitly; a client request
cannot change it. Policy schema version 1 is independent of rules version 7.

| Field | Meaning |
| --- | --- |
| `slotCount` | Maximum selectable card slots, 1-10 |
| `allowedCards` | Unique registered native card IDs |
| `reselectEnabled` | Whether reselection is available; tutorials still disallow it |
| `pauseOnLocalModal` | Whether this scene's local menu/reselection suspends the battle |

Imitator variants are derived from access to both `?` and its eligible target.
They are not separately enumerated in `allowedCards`. Copies are frozen and card
IDs are canonically ordered without locale-dependent sorting.

## Real Battle Integration

- Reselection execution reads slot/card access from the session, not local
  progress. Its floating card-selection view uses the same policy. Mid-battle
  progress changes no longer alter either the visible pool or command outcome.
- Reselection cooldown, whole-loadout validation and actor capability checks still
  apply at confirmation. If a peer already reselected while a local popup was
  open, stale confirmation cannot replace that loadout or update the remembered
  local card preference. The UI displays the rejection.
- New snapshots and recordings carry the policy. Playback and checkpoint restore
  use the recorded policy; a conflicting recording/checkpoint pair is rejected.
  Malformed policy is rejected before mutating the session.
- Resume preserves saved card identities and all saved slots, including imitator
  variants, rather than filtering them through the current profile's unlocks.
  Restart retains the configured policy and participants.

## Modal Pause Behavior

The default `pauseOnLocalModal: true` preserves single-player behavior: opening
the menu or reselection pauses the Phaser scene and battle advancement. Local save
restoration opens a menu, without changing the saved authoritative pause state.

With `false`, the menu, settings and reselection are local overlays. They still
block local board input, but the scene and fixed-step simulation continue. Closing
one does not cancel a participant's explicit authoritative pause control. Loading
a continuing host does not inject the single-player restore pause. Battle end or
scene shutdown disposes of owned overlays and prevents stale callbacks reopening
the menu.

This is a configurable modal policy, not a multiplayer pause-voting design. Manual
pause now belongs to the session and survives control snapshots. Deferred attacks
all use its saved data queue; scene-local paused closures no longer exist. Closing
a local menu does not mutate pause; explicit single-player Continue can issue an
authorized resume command. Network join synchronization is still unfinished.
Resources, cards and cooldowns also remain shared;
separate player wallets, ownership and participant-owned UI instances are not added
by this policy.

## Compatibility And Verification

Old recordings without policy retain the original permissive playback behavior.
Their historical unlock restrictions were never recorded and cannot be recovered.
Legacy saves adopt the current host policy once, then capture it on subsequent
saves/recordings. This does not discard their existing towers or selected cards.

New policies contribute to the combat checksum because they affect future command
outcomes. The replay regression suite compares an explicitly stripped diagnostic
`prePolicyHash` (also excluding the newly captured controls) to the historical
combat baselines and plays recordings without policy. That diagnostic is not the
synchronization checksum.

- `test-battle-policy.mjs`: bounded schemas, canonical immutable copies, imitation
  eligibility, snapshot/replay restoration, atomic rejection, legacy behavior and
  checksums. Included in the normal Node rule suite without Phaser.
- `test-battle-policy-browser.mjs`: live restricted/unlocked/fresh profiles through
  14,500 ticks, rejected and accepted reselections, 30/144 Hz playback, real survival
  resume including ten saved slots, continuing menu/settings/reselection, peer
  pause isolation, concurrent confirmation and overlay cleanup at battle end.
- Existing authority, operation, skill, controls, tutorial, loadout, seven-stage
  replay and high-DPI browser tests pass. The latter covers actual overlay input,
  WebGL/Canvas rendering and desktop/small-screen resizing.

See [multiplayer readiness](multiplayer-readiness.md) for the remaining simulation,
snapshot synchronization and transport work.
