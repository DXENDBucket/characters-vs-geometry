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
reflections. The existing save fields and reference order are unchanged. This is
not yet an ID-based wire format.

## Preserved Semantics

- Empty/unrelated cells remain transparent; logical topology still determines
  routes and friendly coverage. Physical outlet position/facing determines firing.
- Routing fairness, edge credits, node capacity and once-per-tick forwarding retain
  their previous order. Caches and adapters are local to each circuit/runtime.
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

- Eight new Node integrations use actual state factories, queues, damage, skills,
  storage, snapshots and circuit rules without rendering objects. They cover
  partial judgments, attachment upgrades/refunds, removed-source effects,
  interception/shields/healing, routed skills/reflection, self-cost and interleaved
  worlds with logical topology. Mirror dispatch is supplied as an explicit group
  callback; these are not tests of a complete headless mirror controller.
- `test-pipeline-simulation-browser.mjs` advances three actual battles: displayed,
  presentation-disabled and restored with a pending attachment. At 900 ticks all
  match `730761f0`, with observed multihit shots, stored explosions, flight,
  attachments, healing, interception and shielding.
- Existing circuit and 19 action-browser checks pass. Deterministic replay retains
  its prior checksums. 630 rule tests, seven audio tests, validation and build pass.
- The real-host/two-browser HTTP-relay test now also joins with a removed one-shot
  source in storage, accepts an attachment over the network, reconnects while it
  is pending, and opens the outlet with ID-addressed commands. The resulting
  600-tick continuation agrees at `b2d37fe6`; prior network hashes are unchanged.

## Remaining Boundary

Deployment, copy/mirror/topology orchestration and some live callback composition
still prevent a complete renderer-free battle host. Entity relationships still
use graph references. Per-player resources/ownership, durable host recovery and
production multiplayer UI/transport remain open. See
[multiplayer readiness](multiplayer-readiness.md).
