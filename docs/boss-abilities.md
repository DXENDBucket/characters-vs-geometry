# Boss Skill Definitions

This pass covers numeric charge metadata for all 13 named Boss SP skills. It does
not replace Boss combat kits, HP-threshold events, companions, spawn formations,
movement, visuals or the phase-transition lifecycle with an ability interpreter.

## Ownership

- `data/bossAbilities.ts` owns localized names, initial/max/cost SP, base recovery,
  displayed effect durations, HP recovery thresholds, critical recovery multipliers
  and cross-skill SP grants. DEL's existing configuration remains authoritative for
  its values and is referenced here, not duplicated.
- `ICOSAHEDRON_PHASE_SKILL_SP` specifies exactly which skills reset on phase entry.
  The same table supplies initial SP to the encyclopedia. It does not reset waves,
  weight growth, HP, enemies or other phase state.
- `game/bossSkillRules.ts` creates independent state, handles charging, spending,
  grants and phase SP initialization without Phaser. Persisted maximum/cost fields
  remain on each skill. Runtime charge uses these values rather than replacing a
  loaded state's limits with new metadata.
- `game/bossSkillRegistry.ts` depends only on pure rules and types. It retains the
  three-pass ordering: charge every registered skill, collect eligible skills,
  spend all selected costs, then execute effects in registration order. It only
  allocates a ready-skill list when a skill will actually execute.
- `game/bossRuntime.ts` still controls kit selection, target eligibility, actions,
  summons and visual effects. Endless Wings stays in the companion lifecycle: no
  recovery while a companion lives, and no SP cost without an eligible target.
- `bosses/cubeBoss.ts` still constructs and draws models, but delegates skill state
  initialization to the pure factory. Its old charge helper exports and config
  constants are compatibility aliases, not duplicate implementations.
- `bossEncyclopediaDetails.ts` reads names and charge fields from the catalog. Its
  range diagrams, phase descriptions and event prose remain specialized.

## Compatibility Rules

Keep the integer SP/fractional buffer model. Cross-skill grants cap the integer
counter without clearing its buffer. A grant that fills another skill does not
add an extra cast during that same dispatcher call. Costs are paid for the whole
ready group before any of its effects can grant SP.

Last Stand recovers at or below half HP. Delete: Format recovers strictly below
half HP. Only the four tetrahedron skills double natural recovery after the
critical event. Leap does not acquire this multiplier in Icosahedron P2.

An effect's displayed duration is not automatically an SP pause. For example,
Charge continues charging during its haste effect, and DEL charges during its
warning/effect while its handler enforces the next activation deadline. These
behaviors must not be inferred from a generic `activeUntil` check.

Factories preserve existing keys and property order, including inactive cube
skills present on other Boss kinds. Icosahedron construction and phase entry are
separate operations. P2 resets only Charge/Impact/Suppression/Last Stand/Leap;
P3 resets only Endless Wings. No new persistent fields or replay version are
introduced by this refactor.

## Checks And Extension

`test-boss-skills.mjs` loads the catalog, rules, dispatcher and encyclopedia with
no Phaser stub. It tests every Boss kind's state layout, localized previews,
phase isolation, exact HP boundaries, SP buffers, simultaneous casts, no-target
readiness and tick-for-tick compatibility with the old algorithms. It runs in
`npm run test:rules`; data validation also checks skill keys, grants and phase SP.

When adding a skill, extend `BossSkillName`, supply metadata, initialize the state
for the appropriate Boss kinds, register the action/eligibility handlers and add
an encyclopedia section. Metadata does not supply an executable effect. Add
coverage for simultaneous readiness and save/replay as well as the effect itself.

Browser determinism tests cover cube, tetrahedron, dodecahedron, octahedron and all
four Icosahedron phases. DEL browser tests separately cover pending warnings,
timed seals, NUL, sweep events and snapshot migration. Continue those checks when
moving more responsibilities out of the model or scene modules.
