# Battle Economy

`BattlePolicy.walletMode` selects `shared` (the existing default) or `individual`.
Individual wallets require `towerAccess: "owner"`. This is an optional host rule,
not a finalized multiplayer mode or a new single-player setting.

## Account Rules

- The immutable participants with `build` permission receive accounts. Spectators
  and debug-only participants do not. Individual mode requires at least one builder.
- Initial level currency, natural production and unowned production are divided
  equally among those accounts. Their raw total is not multiplied by player count.
  Accounts use sorted actor IDs, independent of connection order.
- A tower's attack, regular or on-hit production belongs to its owner. A copied
  behavior retains the copying tower's owner. Stored pipeline actions produce for
  the executing outlet's owner, not the original source or the latest input actor.
- Each wallet applies the existing currency softcap independently. Deployments,
  upgrades, targeted cards and edge connectors spend only the authenticated actor's
  effective currency. Debug currency also credits only its caller.
- Automatic upgrades visit accounts in sorted actor order and consider only that
  account's owned towers/edges. Unowned scripted towers have no automatic payer;
  a player can still manually upgrade one using their own balance.
- Shared mode keeps the original currency behavior and does not add wallet data
  to snapshots. `world.chars` is a compatibility aggregate in individual mode;
  modifying it directly is refused. Use `effectiveChars(actorId)` for a player's
  balance, and the explicit account-aware gain/spend methods for authoritative rules.

## Persistence And Authority

Snapshots contain a bounded, canonical list of `{ actorId, chars }` wallets only
in individual mode. Import validates exact builder membership, finite nonnegative
balances, unique/canonical order and agreement with the aggregate raw currency.
Owned towers and historical attack sources must also belong to a wallet holder.
Clients cannot name a payer or credit amount in a semantic deployment command.

Wallets participate in checksums, local and ID-wire snapshots, replay and durable
host recovery. Restore replaces balances rather than redistributing them from the
aggregate. A retried acknowledged or unacknowledged deployment uses the authority's
persisted receipt, without spending again.

## Verification

- `npm run test:economy`: twelve tests cover isolated spending, production,
  automatic upgrades, spectators, malformed saves, per-account softcaps, NUL,
  ID-wire continuation and full 30/144 Hz semantic playback.
- `test-headless-host-browser.mjs --economy`: independent Node authority and real
  Firefox/WebKit GameScene replicas cover IF-1, 5-10, AE-EX-2 and AE-10, including
  lost receipts/reconnect, active NUL and per-account divergence repair.
- The durable-host suite checks distinct balances across host replacement and
  retransmission without double charging.
- Default shared-mode rules, browser replay and host/client synchronization remain
  regression gates. No default-mode expected hash is replaced for this option.

## Remaining Boundaries

Wallet-only mode still shares card cooldowns and can let an earlier account consume
the opportunity to upgrade. Optional [individual player resources](battle-player-resources.md)
now isolate loadouts/clocks, tool cooldowns, extraction and automatic-upgrade settings.
Participant-aware UI/input and transport lifecycle are still unfinished.
Neither this module nor passing transport tests constitute a playable multiplayer mode.
