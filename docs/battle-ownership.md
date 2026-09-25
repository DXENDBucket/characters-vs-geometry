# Battle Ownership

Captured `BattlePolicy.towerAccess` now selects `shared` (default) or `owner`.
This is configurable host policy, not a chosen cooperative/competitive game mode.
It does not by itself split resources. Optional [individual wallets](battle-economy.md)
now isolate currency; loadouts, card cooldowns, shifter/reselection cooldowns,
extraction pools and automatic-upgrade settings are still shared.

## Rules

- In owner mode, successful player deployments assign the authenticated actor's
  ID to the created tower or edge. Requests cannot supply an owner field.
- Operations on another actor's entities are rejected before currency, cooldown,
  skill-point, level or selection changes. Mixed-target requests fail as a whole.
- Upgrade, erase, auto-upgrade designation, connector modes, skills, triggers,
  pushes, targeted cards and moves use the same preflight as the actual scene.
  Unlimited-firepower column operations check every affected recipient.
- Automatic column upgrades share that preflight and assign the marked tower's
  owner to newly filled cells, independent of any surrounding player command.
- Unowned scenario/generated units remain public and can be operated by any
  participant who has the corresponding capability. Upgrading does not claim them.
- `s` generation (including copied and piped behavior) inherits the acting source
  or outlet's owner. Copies retain their own owner, not the copied neighbor's.
- Mirror creation inherits the source's owner. Owner mode only mirrors across
  an anchor/source/recipient with equal owners. Foreign anchors cannot form,
  support or erase another player's mirror network. Saved networks spanning
  owners are rejected. Existing shared mode retains historical mirror behavior.
- Pending one-shot attachments are included in preflight, preventing two actors
  from upgrading the same transient effect on an unowned public tower.
- Push checks cover both protective shells and their inner towers, including
  free/pipeline-driven pushes. Chained topology preflight projects the resulting
  logical cells without modifying live caches. Connecting, moving, extracting or
  erasing `&` cannot directly remap another owner's tower.
- Ownership does not isolate combat, auras, healing, shared-health damage, pipeline
  transport or enemy/environment removal. These are battlefield mechanics, not
  player edit permissions. A manually authorized delayed effect can still run
  after battlefield changes, like other already-issued attacks/skills.

Automatic upgrades still use the shared loadout and settings; the owner grants
participation by marking their tower. Individual-wallet mode visits builders in
canonical order and spends only their own currency. Players with the global
settings capability still control its shared reserve and enablement. Independent
loadouts/cooldowns/settings remain the next boundary.

## State And Validation

`ownerId` is an optional authoritative tower/edge field, included in local and
ID-wire snapshots and checksums. It is not inferred from the current selection,
display object, latest command or browser profile. NUL suspension and historical
attack sources retain it. Restore rejects unknown actors and cross-owner mirror
groups in owner mode. The policy is immutable captured session data, and a replay
cannot substitute another access mode.

Default shared battles do not add owner fields, preserving existing state hashes
and save compatibility. These optional policy/data fields do not change the
default combat rules or require regenerating historical golden fixtures.

## Verification

- `npm run test:ownership`: fifteen real-runtime tests cover the policy/schema,
  whole-operation preflight, shared compatibility, edges, skills, one-shots,
  unlimited columns, mirrors, generation/copy/pipeline inheritance, shells,
  chained topology, public targets, removed sources, NUL, wire restore and full
  semantic replay at 30/144 Hz.
- `test-headless-host-browser.mjs --ownership`: a Node authority and independent
  Firefox/WebKit GameScene replicas verify denied cross-owner operations, owned
  deployments, lost receipts/reconnect, NUL and divergence repair across IF-1,
  5-10, AE-EX-2 and AE-10. Profiles remain untouched.
- The durable-host suite restores an owned tower after host replacement and
  rejects an upgrade by another participant who otherwise has build permission.
- Existing default-mode rules, rendering-independent boundaries and exact browser
  replay checks remain required. No owner-mode-only expected hash replaces a
  previously passing shared-mode baseline.

The UI still needs participant-aware selection/ownership hints and remote-input
routing. This boundary is necessary groundwork, not a playable multiplayer mode.
