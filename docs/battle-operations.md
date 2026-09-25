# Semantic Battle Operations

Board mutations and manual skill execution use one semantic operation gate in the actual
game, both from pointer handling and from `GameScene.submitPlayerOperation`:

- `deploy`: card ID, cell, expected tower reference or explicit empty cell.
- `effect`: card ID, cell, explicit recipient reference (or no primary recipient
  for column-wide effects in unlimited firepower).
- `edgeCard`: card ID, internal edge position, expected connector or empty edge.
- `erase`: explicit tower or edge reference.
- `autoUpgrade`: explicit target list and desired enabled state, not a toggle.
- `edgeMode`: explicit connector and desired direction.
- `move`: tower references with expected source cells and the anchor destination.
- `skill`: an explicit skill identity, tower reference list, and either a bounded
  world-space point (S) or null (untargeted skills). No implicit Shift/group query.
- `trigger`: an explicit tower reference and expected behavior, including copied
  one-shot towers. Its mirror group is resolved by the host.
- `push`: a # source reference and the clicked destination cell; adjacency and the
  complete push chain are resolved against the host's current topology.
- `topology`: an & source reference and a destination cell; an established swap
  cannot be silently replaced.

References use stable `entityId` values, never the legacy tower placement `id`.
Commands cannot contain client-computed damage, prices, cooldowns, levels or live
objects. The schema requires exact keys, bounded lists/strings, valid kinds and
integer grid coordinates. It rejects duplicate targets, sparse arrays, invalid
positions and unknown command fields.

## Validation And Execution

`battleOperations.ts` is renderer-free. It resolves a host-supplied actor, checks
build/edit/move/skill capability, available cards, active targets and stale-placement
preconditions, then calls the host authorization policy before applying anything.
NUL, removed and transient towers cannot be direct operation targets. The live
adapter's affected-target query includes unlimited-firepower recipients and mirror
upgrade members, so an ownership policy can reject before any resource is spent.
For skills, the entire explicit group is authorized before any SP is spent. Push
preflight includes all pushed towers and their same-cell shells/contents; trigger
preflight includes active mirror members; topology includes both cells' occupants.
The skill capability covers activation, push and one-shot triggers; topology uses
edit. These capabilities are policy inputs, not a finalized multiplayer rule set.
Natural consequences such as mirror disappearance still belong to combat rules;
this query is not a complete prediction of every downstream combat event.

`battleOperationRuntime.ts` adapts the existing live controllers to that gate.
They remain responsible for actual costs, cooldowns, placement layers, seals,
mirrors, extraction, topology and movement validation. Execution does not inspect
the currently selected card/tool. An explicit move does not clear local shifter
selection; the pointer adapter separately handles its own selection feedback.
No full projectile-graph scan is performed for a board operation.

Skill execution checks behavior identity (including @ changes), group support,
target shape and every member's readiness before activating. Rejected readiness
queries do not create lazy SP state. Entering/canceling a target picker is separate
from execution: remote-style commands neither require nor clear a local picker.
S aiming affects border display only and cannot suspend authoritative SP recovery.
Normal full-SP aiming, skill costs, charge timing and delayed volleys are preserved.
Automatic ! activation, collision triggers and routed skill effects remain combat
rules, not player requests requiring a new command or permission check each tick.

The current scene registers only the trusted single-player `local` participant
with shared cards/currency. Unknown actors are rejected. The pure gate supports
injected participant and authorization policies; a multiplayer participant
registry, ownership state and per-player resource model are **not** implemented
yet. Passing an actor string is not authentication and this API must not be
exposed directly to an untrusted transport.

## Replay And Remaining Work

Explicit calls are recorded as `{ type: "operation", actorId, operation }` through
the real `BattleSession`. JSON cloning, tick order, checkpoint references and
playback use the existing session. Failed but well-formed attempts may appear in
trusted recordings; the future authority protocol must validate, bound and
acknowledge requests before accepting remote traffic.

The current mouse adapter still records legacy pointer/card/tool intent and calls
the same gate during its execution. It does not record a second operation that
would apply the mutation twice. Legacy command forms coexist with explicit
operations within current-version recordings. Rules version 7 rejects older
recordings; version 1-6 saves still restore under the current rules. See
[control compatibility](battle-controls.md) for the changed input/checksum semantics.

Global configuration/debug/tutorial actions now use a separate
[control gate](battle-controls.md), including explicit pause/speed settings.
Gate 3 remains open: multiplayer policies and complete separation of local UI
from recording still need work. Selected-card preferences remain in local saves
but no longer in combat checksums. This pass does not claim that two
players can yet use independent UI state in the complete battle.

## Checks

- `test-battle-operations.mjs` covers JSON/schema bounds, actor capabilities,
  ownership-policy rejection, complete group preflight, moved/replaced/removed
  targets, cards, identity builders and actual session recording/playback.
- `test-battle-operations-browser.mjs` compares all seven operations against real
  mouse flows, including same-cell parentheses, mirror upgrades/removal, attached
  effects, edge modes, group auto-upgrades and moves. It verifies failure causes
  no currency/cooldown mutation, different-frame-rate operation replay, and using
  the same stable target after save/restore. Live adapter policy tests reject
  mirror and unlimited-column changes before partial execution, and explicit
  moves preserve an unrelated local selection.
- `test-battle-skill-operations-browser.mjs` compares S/c/w/o/j, copied skills,
  topology, pushes and mirrored one-shot triggers against real mouse flows. It
  checks authorization before partial group/shell movement or SP spending, NUL
  rejection, remote activation while locally aiming, saved in-flight volleys,
  stable targets after restore, and complete 30/144 Hz command playback.
- `test-pipeline-actions-browser.mjs` covers consumption/routing, saved attacks
  after source removal, routed SP skills and different-frame-rate continuation.
  Its synthetic edge fixtures use the world's allocator just like live edges.
- The existing seven-stage replay suite also covers all 5-10 phases and
  reselection/push/move/erase. Its seven combat fixtures match the preceding
  baselines when normalized to the previous checksum format.

See [multiplayer readiness](multiplayer-readiness.md) for the complete goal. This
is a shared operation boundary, not an authority server or network protocol.
