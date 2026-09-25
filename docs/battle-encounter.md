# Encounter And Field Rules

## Actual Battle Path

`BattleEncounter` owns Boss initialization, endless succession, phase cleanup,
phase reset/stats/skills and ordinary enemy breaches. `GameScene` delegates to
this implementation; there is no second rule path for headless tests.
`BattlefieldCells` similarly owns permanent column seals, timed-cell operations
and tower erasure in a cell. Both use the existing world, factories and lifecycle
rules, with explicit observer and display ports.

`TowerStorageSimulation` and `TowerNullificationSimulation` now own the state and
timers behind their existing public controllers. The old classes only attach
live presentation. Their snapshot contracts are explicit data types, preserving
the old graph fields/references without changing the save version.

## Preserved Semantics

- Initial Boss creation preserves factory IDs, discovery observation, fixed home
  position, initial companions/bombs and unlimited-firepower scaling order.
- Endless replacement removes only the former Boss family's dependents. A new
  root of the next rank appears immediately at its normal home position. Other
  enemies and accumulated waves remain; records use the external profile port.
- Phase cleanup destroys stored enemies and contained passengers, detaches health
  links and clears the roster without triggering enemy death/split/reward events.
  Shrink/fade animation is presentation only. Boss reset removes copies and
  pending warnings while retaining the root entity ID and accumulated wave growth.
- Storage still releases once after five battle seconds at the carrier's current
  rear cell, even if the carrier was removed. Passenger coordinates and status
  expiry are simulation-owned, independent of body visibility/position updates.
- NUL is temporary absence, not removal. It suspends all tower placement layers,
  occupancy and their deadlines, defers queued actions and cargo release, and
  restores deployment order. Periodic NUL retains deployment-anchored cadence.
  Rules callbacks still update networks/skills; visual suppression does not omit
  those callbacks.
- Cell erasure resolves both tower layers through the actual lifecycle path,
  preserving mirror-removal callbacks. Already absent NUL towers are not erased.
  Permanent seals are idempotent; timed warning/activation/expiry deadlines remain
  world-owned and pause/save aware.
- Breaches preserve removal, integrity loss, flawless disqualification and
  terminal-result ordering; shake/audio are independent presentation.

## Verification

Eight new Node integrations compose real world/state factories, lifecycle,
storage, NUL, cells, action queue and graph restoration without engine/gameplay
mocks. Dependency guards prohibit transitive scene/render imports.

Five actual-browser scenarios compare displayed, display-disabled and restored
scenes for 1000 ticks each:

| Scenario | Checksum |
| --- | --- |
| 5-10 transitions to P4 | `a6bcdea2` |
| IF-BE-3 succession | `0607b24e` |
| IF-BE-4 succession | `125d69f6` |
| AE-10 NUL/storage recovery | `7b2e6c9f` |
| 5-9 column seal | `be9573cc` |

622 rules, audio tests, data validation and TypeScript/Vite build pass. Existing
deterministic replay, DEL format, terminal/profile isolation and paused-action
browser checks preserve their checksums. Real host plus two isolated browser
clients also retain synchronization/reconnect/content hashes.

## Remaining Work

Pipeline and targeted attachment rules were subsequently extracted; see
[pipeline simulation](pipeline-simulation.md). Deployment, copy/topology/mirror
and board refresh rules were also extracted; see [tower board simulation](tower-board.md).
Physical movement, generated placement and live callback composition still prevent
an entirely renderer-free host.
These tests prove the named systems, not complete headless battle execution.
Relationship wire records, per-player resource/ownership rules and production
multiplayer UI/transport lifetime handling remain open. No whole-battle FPS
improvement is claimed.
