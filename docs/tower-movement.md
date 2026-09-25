# Tower Movement And Command Execution

## Shared Rules

- `TowerShifterSimulation` owns movement planning/commit, readiness and cooldown
  snapshots. Local selection, Ctrl picking, previews and marks stay in its live
  controller. Explicit commands never require or clear a local selection.
- `TowerPushSimulation` plans through logical topology, includes protective shells
  and inner towers, spends SP and routes skill actions before committing positions.
  Every destination is committed before erasure callbacks rebuild mirror/health
  networks. Blocked/outside destinations use the normal removal lifecycle.
- Push interpolation deadlines are authoritative state. Skill updates settle them
  without display callbacks. Exit fading, body depth and screen positioning are
  observers in `render/towerMovement.ts`.
- Generated towers now use `TowerDeploymentSimulation.spawnGeneratedTower`: same
  cell/layer checks, source level/facing, factory/ID allocation, roster insertion
  and board refresh. They do not consume card resources or cooldowns.
- `battleOperationRuntime.ts` applies the actual semantic operations through
  data-only ports. Deployment, attachments, edges, upgrades, skills, triggers,
  topology, push, movement and erasure share the existing actor/schema/preflight
  gate. Auto-upgrade display is an optional callback; its flag is simulation data.
  Edge controls now depend only on pure circuit rules.

The live scene uses these implementations. Its push runtime is retained rather
than recreated per property query. Push planning copies only the grid fields it
uses, not whole towers/display objects. No full-battle FPS gain is claimed.

## Layered Mirror Fix And Compatibility

Support-edge rebuilding used to inspect only the ordinary occupant at each side
of m. Moving a complete mirror component with both inner towers and their shells
therefore erased the supported shell network. Rebuilding now checks both layers
independently, matching mirror creation. The moved component survives; unsupported
members left behind still disappear.

A failing Node regression reproduced this before the fix. Actual browser and
connected-client tests now cover this exact case. Because this corrects behavior,
battle rules advance from 7 to 8. Versions 1-7 of saved checkpoints remain
loadable under current rules; old replay versions are deliberately rejected.
Protocol and save-graph schemas are unchanged.

## Verification

- Eleven Node integrations use real factories, deployment, command application,
  movement, mirrors, topology, skills, lifecycle and pipeline routing without
  Phaser. They cover group/stale/permission rejection, layered occupancy, cooldown
  restore, NUL, moving members, sealed/outside erasure, callback order, routed
  push restore and actual s-generated towers.
- `test-tower-movement-browser.mjs` compares three actual battles with displayed,
  disabled movement/deployment presentation and restored in-flight state. They
  match after 1500 ticks (`96cce19b`), including generated towers, shell erasure,
  routed push and the layered mirror fix.
- The authenticated relay test submits remote pushes and moves, rejects a peer
  lacking move permission and a stale repeat, resynchronizes mid-push, then runs
  600 ticks. The host and two isolated browser contexts agree at `c1bccd60`.
- The seven-level deterministic suite still matches historical combat hashes
  after normalizing only version metadata for those fixtures, which contain no
  mirrored shells. Current-version replay, frame-rate comparisons, saved
  continuation, operation/UI flows, board tools, parentheses, pipeline actions,
  board refresh and tutorial checkpoints pass.
- 651 rule tests, seven audio tests, data validation and TypeScript/Vite build
  pass. The existing large-bundle build warning remains.

## Remaining Boundary

Factories and cross-system callbacks now assemble in the shared
[BattleRuntime](battle-runtime.md), used by the real scene and independent Node
tests. Complete standalone host integration still needs independent control
ingress, canonical relationship wire records/checksums, numeric guarantees,
configurable participant resources/ownership and transport/player-UI lifetime
integration. See
[multiplayer readiness](multiplayer-readiness.md).
