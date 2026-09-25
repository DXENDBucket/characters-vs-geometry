# Semantic Battle Operations

The first seven board mutations use one semantic operation gate in the actual
game, both from pointer handling and from `GameScene.submitPlayerOperation`:

- `deploy`: card ID, cell, expected tower reference or explicit empty cell.
- `effect`: card ID, cell, explicit recipient reference (or no primary recipient
  for column-wide effects in unlimited firepower).
- `edgeCard`: card ID, internal edge position, expected connector or empty edge.
- `erase`: explicit tower or edge reference.
- `autoUpgrade`: explicit target list and desired enabled state, not a toggle.
- `edgeMode`: explicit connector and desired direction.
- `move`: tower references with expected source cells and the anchor destination.

References use stable `entityId` values, never the legacy tower placement `id`.
Commands cannot contain client-computed damage, prices, cooldowns, levels or live
objects. The schema requires exact keys, bounded lists/strings, valid kinds and
integer grid coordinates. It rejects duplicate targets, sparse arrays, invalid
positions and unknown command fields.

## Validation And Execution

`battleOperations.ts` is renderer-free. It resolves a host-supplied actor, checks
build/edit/move capability, available cards, active targets and stale-placement
preconditions, then calls the host authorization policy before applying anything.
NUL, removed and transient towers cannot be direct operation targets. The live
adapter's affected-target query includes unlimited-firepower recipients and mirror
upgrade members, so an ownership policy can reject before any resource is spent.
Natural consequences such as mirror disappearance still belong to combat rules;
this query is not a complete prediction of every downstream combat event.

`battleOperationRuntime.ts` adapts the existing live controllers to that gate.
They remain responsible for actual costs, cooldowns, placement layers, seals,
mirrors, extraction, topology and movement validation. Execution does not inspect
the currently selected card/tool. An explicit move does not clear local shifter
selection; the pointer adapter separately handles its own selection feedback.
No full projectile-graph scan is performed for a board operation.

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
would apply the mutation twice. Old recordings remain supported and their full
checksums remain unchanged. New operation recordings coexist with those commands.

Gate 3 remains open: remaining skill targeting, global configuration/debug/tutorial
actions, pause/speed policy, and complete separation of UI selection/focus from
authoritative state and recording still need work. The legacy selected-card
preference remains in snapshots/checksums. This pass does not claim that two
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
- The existing seven-stage replay suite, including all 5-10 phases and
  reselection/push/move/erase, preserves its full identity-inclusive hashes.

See [multiplayer readiness](multiplayer-readiness.md) for the complete goal. This
is a shared operation boundary, not an authority server or network protocol.
