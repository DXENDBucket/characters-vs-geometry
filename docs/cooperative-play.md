# Direct Cooperative Play

This is a two-player browser prototype using the existing authoritative battle
core and snapshot-capable clients. No Steam, matchmaking, NAT traversal, host
migration or persistent multiplayer saves are included.

## Run

On the host machine, run `npm run coop`. This builds the client and headless room
module, then serves both the game and HTTP room API on TCP port 5180. To change
the port use `npm run coop -- --port=5181`. The process prints local/LAN URLs.
Keep the process running for the battle. Allow the port through the firewall;
public reachability/port forwarding is the host's responsibility.

Both players open the host's URL in a browser, enter Multiplayer, and use the
same server address. The host creates a room and shares its room code. The guest
joins by code. The host selects a completed level and difficulty, each player
selects cards and readies, then the host starts. Changing level/difficulty clears
both ready flags. Leaving a room/battle closes it for both players.

Browser saves belong to their origin. If your progress lives at another address
or in Electron, export/import it through the existing Saves menu first. The room
uses the save from the browser in which you open the game, not a filesystem scan
of another installation. The Electron renderer has not been granted arbitrary
HTTP connections by this prototype; use the browser URL for this version.

## Rules

- Host level choices are restricted to its captured completed, non-endless levels.
- Each player supplies its own unlocked cards, slot count and reselection unlock.
  The room checks selection against that captured policy, including imitation.
- Funds, card/tool cooldowns, reserves and auto-upgrade settings are independent.
  Existing individual-economy rules split initial funds and unowned/common income.
  Production attributed to an owner stays with that owner. Enemy strength is unchanged.
- Editing, moving, upgrading and erasing are owner-only. Existing cross-tower
  healing/support interactions remain shared. The base and outcome are shared.
- Only the host controls pause/speed/tutorial advancement. Opening a local menu
  or card-reselection panel does not pause the other player's battle.
- Battle advancement waits for both connections. Missing sessions are detached
  after inactivity; live clients use the existing reconnect/snapshot mechanism.
- Remote results do not modify single-player completion/flawless records or saves.

## Boundaries

The room trusts local unlock claims; local saves are not an anti-cheat authority.
Tokens bind HTTP sessions to server-assigned actors. Room state never returns
other players' tokens. Replacing a battle link fences old poll/send/disconnect
requests. Queue/body/room limits and idle cleanup bound retained resources.
Plain HTTP is suitable for trusted direct testing; it provides no encryption.
Do not expose this prototype as an untrusted public hosting service.

`BattlePolicy.players` captures per-player card restrictions for deterministic
reselection, replica reconstruction and UI. Policies without it keep their
existing behavior. Old snapshots do not acquire restrictions from current saves.

## Verification

`scripts/test-coop-room.mjs` exercises room permissions, independent resources,
two-replica agreement and terminal synchronization using the real battle core.
`scripts/test-coop-browser.mjs` exercises two separate browser profiles, real room
and card-selection UI, deployment, snapshot agreement and exit on the direct API.
It expects the Vite dev server and `npm run coop` server, with the usual
`--playwright`, `--browser`, `--url` and `--server` overrides. It uses isolated
profiles, not the player's local save. This is functional coverage, not a load test.
