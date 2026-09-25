# Player Resources

`BattlePolicy.resourceMode: "individual"` isolates loadouts, card clocks and
deadlines, reselection history/cooldown, shifter cooldown, extraction pools and
automatic-upgrade enablement/reserve. It requires `towerAccess: "owner"`, but can
use either shared or individual wallets. All omitted options retain shared
single-player behavior and the existing snapshot/checksum shape.

## Configuration

Builders are the immutable participants with `build` permission. Each receives a
resource state, ordered by actor ID. Other participants cannot modify player
resources or perform board operations in this mode; their granted global controls
(for example time controls) still work.

An optional `playerLoadouts` session/replay field specifies different initial
decks: `[{ actorId: "a", cards: ["A", "X"] }, { actorId: "b", cards: ["B", "X"] }]`.
It must contain every builder exactly once in sorted actor order. Cards must be
allowed by the captured policy, respect slot capacity, and have unique cooldown
identities (including the imitator). Without this field, each builder starts with
an independent copy of `selectedCards`. Caller changes cannot mutate the captured
configuration.

`BattleRuntime.players.get(actorId)` exposes a builder's live resource state to
trusted host/UI adapters. `players.has(actorId)` checks membership; undefined or
unknown IDs return the legacy shared view, never another player's state. Semantic
authorization rejects nonmembers before effects, payment or cooldown changes.
The shared view is not implicitly the first connected player. Participant-aware
UI must select an explicit actor instead of using this compatibility view.

## Execution

- Commands select their authenticated actor's resource state within a scoped
  context. Completion or exceptions restore the previous context. The board is
  shared and is never temporarily swapped to simulate a player.
- Card definitions, deployment, attachments and edge controls read that player's
  slots and clocks. Two players can deploy the same card in the same tick.
- Reselection keeps each player's own removed-card cooldown history. It never
  changes another player's slots. The imitator retains the existing clock-domain
  conversion and automatic-upgrade interoperability with its original card.
- Automatic upgrades run in canonical actor order, applying each player's own
  settings, pool and deck to their owned units. Shared-wallet mode intentionally
  shares payment, but not the card cooldowns.
- Delayed targeted effects explicitly restore the effect tower's owner context.
  Extraction and level-based cooldown refunds do not use the last input actor.
  Pipeline effect execution uses the outlet's owner.
- Clock acceleration follows the active clock source's owner. Unowned scripted
  sources benefit all builders. Skill/pipeline contexts retain the existing
  behavior and eligibility rules; this does not make expensive c copyable by @.
- Time, pause, wave progress, integrity and global debug mode remain shared. Debug
  card resets affect only the caller's deck. Normal combat auras remain shared
  battlefield mechanics, not player resource settings.

## Restore And Verification

Individual snapshots contain `playerResources` with current decks, deadlines,
clock values, reselection memory, shifter state, extraction and auto settings.
They are validated against the current participant roster/policy before hydration.
Missing/duplicate/foreign entries, invalid cards, negative/nonfinite values and
malformed cooldown states are rejected. Restore uses the saved current decks,
not the initial-deck header; a reselected deck survives reconnect and host restart.

- `npm run test:player-resources`: sixteen core tests include initial decks,
  same-tick deployment, imitators, both wallet policies, separate automatic
  upgrades, movement/reselection, pending extraction/refunds, clock ownership,
  spectator rejection and malformed snapshots. Real NUL battles preserve exact
  30/144 Hz semantic replay and ID-wire continuation.
- `test-headless-host-browser.mjs --resources` uses different initial decks in
  independent Node, Firefox and WebKit processes, with real GameScene replicas.
  It covers IF-1, 5-10, AE-EX-2 and AE-10, reselection, lost receipts/reconnect,
  suspended towers and divergence repair, without modifying local profiles.
- The durable-host suite restores per-player decks/cooldowns/settings and checks
  retried deployment does not spend currency or reset deadlines a second time.
- Default shared-mode rules and browser replay/synchronization remain regression
  gates. No default expected hash was replaced by an individual-mode baseline.

## Participant Views And Input

`BattlePlayerView` binds a registered actor to the HUD's wallet, deck, card clocks,
extraction pool, reselection and tool settings. Its getters resolve the current
resources after every restore; it does not change the runtime's command context.
Automatic-upgrade borders use each entity owner's settings, not the viewing
player's. Shared-mode behavior remains the default.

`GameScene` accepts `viewActorId` (default `local`). A replica may additionally
receive an `input` port implementing `BattleInputPort`; `BattleSyncClient` is one
implementation. The authenticated transport must bind that same actor at the
host. The view ID is not sent as authentication and cannot override host identity.
Without a port replicas stay read-only. With one, existing mouse and keyboard
handlers produce the same semantic intents as single player. Only received host
frames mutate the replica. Deployment, movement and targeted-tool completion wait
for receipts rather than treating successful transmission as successful gameplay.

Disconnected, resynchronizing or pending-request clients reject new local input.
The client retains the original request and completion across reconnect, so a
lost receipt can be retried without a second deployment. Scene shutdown invalidates
its UI callbacks; old receipts cannot act on a replacement or destroyed scene.
Reselection by a replica does not write the local profile. Checkpoint headers keep
the common deck instead of accidentally capturing one player's visible deck.

`test-headless-host-browser.mjs --input` runs the real render/input loop in Firefox
and WebKit against an independent authenticated Node host. Playwright clicks the
cards, board, shifter, eraser, auto switch and reselection overlay, and uses Escape
to open/close the menu. It checks distinct decks/wallets/cooldowns, no speculative
placement, forbidden foreign erase, blocked input during disconnect/pending
receipt, lost-receipt reconnect, current cooldowns after restore, separate
reselection and unchanged local profiles. Screenshots are written under `logs/`.

This is an input/presentation adapter, not a finished multiplayer mode. The
application uses [RemoteBattleSession](battle-connection.md) for connection/scene
lifetime and connection status. Broader skill/tutorial and crowded-battle transport
tests, plus outer join navigation and a concrete production transport, remain open.
