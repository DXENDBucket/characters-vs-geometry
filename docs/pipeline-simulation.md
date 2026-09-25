# Pipeline And Attachment Simulation

## Actual Battle Path

`ProjectileCircuitSimulation` owns routing, edge throughput, ammunition queues,
action capture, interception, shielding and healing consumption. The existing
`ProjectileCircuitController` delegates to it and attaches display callbacks.
`pipelineActionRules.ts` executes stored attacks through the same pure tower,
trigger and skill implementations as ordinary combat. Projectile creation and
output geometry are no longer implemented in `GameScene`.

`TargetedEffectSimulation` owns b/t/!/y deployment, pending upgrades, mirror-group
dispatch, application, extraction and cooldown refunds. Its factory and removal
ports are explicit. The live controller attaches tower construction and display;
turning, attachment state, true-damage deadlines and spending do not depend on it.
Normal and routed true-damage attachments share `towerAttachmentRules.ts`.

Stored payload sources and events use data-state contracts, including targets and
reflections. Local saves retain their graph format; synchronization now encodes
entity relationships using the [ID-based wire format](battle-wire-state.md).

## Preserved Semantics

- Empty/unrelated cells remain transparent; logical topology still determines
  routes and friendly coverage. Physical outlet position/facing determines firing.
- Routing fairness, edge credits, node capacity and once-per-tick forwarding retain
  their previous order. Caches and adapters are local to each circuit/runtime.
- A buffer stops scanning for this tick once all reachable receivers lack capacity
  or all routes lack flow credit. The next node/tick retries normally. A payload
  with zero damage rejected by a damage outlet does **not** stop later damaging
  ammunition. This avoids repeated full-network scans without changing routing.
- Per-hit damage, partial judgments, original budget and source attribution survive
  capture/output. Interception spends five reserve damage per canceled damage;
  matching shields spend three per prevented damage. Armor thresholds are not
  replaced by one summed hit. Projectile scaling is presentation only.
- Healing still consumes a payload only after a successful heal, with the existing
  5:1 conversion and processing limit. Health-pool notifications are explicit.
- Captured one-shot sources still disappear once. Their stored effects survive
  source removal and execute from the outlet without consuming that outlet.
  Storage/relocation self-cost is paid at the source, one hit at a time, not twice.
- Attachments still use pending data actions, spend once for unlimited columns,
  inherit mirror levels/facing and refund only eligible original cards. Disabling
  their presentation does not suppress mirror dispatch or aura refresh callbacks.
- `GameScene` now retains its circuit/action runtime adapters rather than allocating
  new closures for every capture/output. This is not a measured battle FPS gain.

## Verification

- Node integrations use actual state factories, queues, damage, skills,
  storage, snapshots and circuit rules without rendering objects. They cover
  partial judgments, attachment upgrades/refunds, removed-source effects,
  interception/shields/healing, routed skills/reflection, self-cost and interleaved
  worlds with logical topology. Mirror dispatch is supplied as an explicit group
  callback; these are not tests of a complete headless mirror controller.
- `test-pipeline-simulation-browser.mjs` advances three actual battles: displayed,
  presentation-disabled and restored with a pending attachment. The extraction-time
  900-tick result was `730761f0`, with observed multihit shots, stored explosions, flight,
  attachments, healing, interception and shielding.
- At the original extraction, existing circuit and 19 action-browser checks passed. Deterministic replay retained
  its prior checksums. The extraction-time check covered 630 rule tests, seven
  audio tests, validation and build; those counts/hashes are historical.
- The real-host/two-browser HTTP-relay test also joins with a removed one-shot
  source in storage, accepts an attachment over the network, reconnects while it
  is pending, and opens the outlet with ID-addressed commands. The resulting
  extraction-time 600-tick continuation agreed at `b2d37fe6`.
- After blocked-route optimization, 773 rule tests pass. The displayed/silent/
  restored integration agrees at `d3d4da6b` after 900 ticks. The current rules-9
  Chromium/Firefox/WebKit relay pipeline continuation remains `94cd927e`, with
  topology and movement fixture hashes unchanged. See the pressure measurements
  below for saturation and longer deterministic continuation, not browser FPS.

## Remaining Boundary

Deployment, copy/mirror/topology and board refresh rules have since been extracted;
see [tower board simulation](tower-board.md). Physical shifter/push execution,
generated placement and command application now also use pure rules; see
[tower movement](tower-movement.md). The [independent battle](independent-battle.md)
now runs the complete runtime without a renderer. Per-player ownership/resources,
ID-based wire relationships, durable recovery and remote scene input are implemented.
Production multiplayer transport and load readiness remain open. Saturated-bank
and live-mortar recovery measurements are recorded in
[performance](performance.md#pipeline-and-mortar-pressure); this is not a guarantee
of browser FPS or long-running service capacity. See
[multiplayer readiness](multiplayer-readiness.md).
