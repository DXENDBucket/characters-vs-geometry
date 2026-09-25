# Tower Board Simulation

## Ownership

`TowerDeploymentSimulation` owns payment/cooldown checks, extraction batches,
single-cell and unlimited-column deployment, mirror-group upgrades and automatic
upgrade selection. Factories, skill resets and board refresh are explicit rule
ports. The existing live controller attaches construction and display callbacks.

`TowerMirrorSimulation` owns group IDs, creation eligibility, axis connections,
effective-level bonuses, grouped events, removal suppression and rebuilding after
movement. The actual single-player controller delegates to it. Mirror animations,
labels and health rendering are observers, not rule dependencies.

`TowerBoardSimulation` owns the refresh order formerly implemented in `GameScene`:
occupancy, logical topology, copied forms, level bonuses, final stats, shared-health
networks, health-depletion settlement and circuit refresh. Its comparison caches
and scratch arrays belong to one board. The live runtime retains stable getters
so repeated property queries do not allocate callback objects.

`towerUpgradeRules.ts` is shared by ordinary, mirrored, copied and pending
attachment upgrades. `towerCopy.ts` is now renderer-free. Topology connection
validation/commit is in `connectTowerTopology`; the live topology controller only
adds local picking and marks around that command.

## Preserved Behavior

- Resource checks, card clocks, batch consumption, reserve limits and operation
  results keep their original order. Unlimited columns pay once and upgrade an
  existing mirror group once. Protective shells retain their separate layer.
- Level changes retain effective-upgrade scaling and maximum-health growth rules.
  Skills reset through the same implementation; G and copied G restart arming.
- Mirrored towers inherit level/facing but not arbitrary transient state. Grouped
  one-shot/attachment resolution still suppresses cascading removal while each
  member acts, and performs one post-event mirror refresh.
- Moving a supported mirror component preserves its internal relationship and
  removes unsupported former members. This rule is data-only; executing the
  physical shifter/push movement itself still has a live adapter to extract.
- U eligibility, m bonuses and u shared-health arithmetic are unchanged. Board
  refresh retains health-settlement recursion and its circuit-update order.
- Copies observe the same physical target obtained from logical topology, retain
  health proportion, refresh base/final stats and restart skills/attack clocks.
  Completing an expired move during form change is now explicit data work; it
  previously happened inside the live form-render callback. Display-disabled
  copies therefore settle that state too.
- Topology swaps remain ordered and local to the roster. They do not move bodies
  or change physical projectile/blocking geometry. The picker is local UI state.

## Evidence

- Ten Node integrations use actual data factories, deployment, mirrors, board
  refresh, attachment queues, skills, lifecycle and graph restore without Phaser.
  They exercise layers, costs, copied traps, unlimited columns, mirror removal,
  pending effects, topology/copy health ratios, movement aftermath and interleaved
  restore/auto-upgrade. These fixtures do not implement a complete battle host.
- `test-tower-board-browser.mjs` compares three actual battles with displayed,
  disabled and restored deployment/mirror/board presentation. All agree after
  900 ticks at `41d0e2f0`, including mirror shifts, copied forms, shell layers,
  pending mirrored attachments and NUL recovery.
- 640 rules, seven audio checks, validation and build pass. Existing deterministic
  replay, semantic operations/skills, parenthesis towers, pipeline actions and
  tutorial checkpoints pass with unchanged recorded baselines.
- The connected host/two-browser test adds AE-4: a remote actor connects an & by
  entity ID, causing @ to copy a distant w; a client then resynchronizes that form.
  All agree after 600 further ticks (`77b5e210`). Prior connected-content and
  pipeline hashes are unchanged; this is selected-content, not all-mode coverage.

## Remaining Work

Physical shifter/push execution, generated-tower placement and remaining live
command/runtime composition must be extracted before assembling the complete
renderer-free host. ID-based relationship serialization, per-player resources and
ownership, durable host recovery and production UI/transport remain open. No
whole-battle FPS gain is claimed by this refactor.
