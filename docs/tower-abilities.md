# Tower Skill Definitions

The migrated scope is the seven SP skills on w, o, j, c, h, S and #. This is a
shared parameter catalog and charge model, not a general-purpose skill language.
One-shot triggers, auras, attacks and Boss skills retain their existing systems.

## Ownership

- `data/towerAbilities.ts` owns localized names, stable saved state keys, initial
  SP, maximum/cost, recovery, duration, upgrade reset policy, manual targeting and
  group activation flags, and skill range diagrams. Mortar volley parameters and
  guardian healing ratio live alongside their definitions.
- `game/towerSkillRules.ts` handles pure initialization, recovery, readiness,
  spending and upgrade charge resets. Neither it nor the catalog imports Phaser.
- `game/towerSkillRegistry.ts` binds all catalog entries to typed behavior
  handlers. Targeting and group flags derive from data; adding a catalog entry
  requires a behavior entry. Visual cleanup stays with each behavior.
- `game/towers.ts` and `game/towerCopy.ts` use the same initial-state factory.
  Copied skills do not inherit another tower's charge or effective level.
- `game/towerSkills.ts`, `orientation.ts`, `gathering.ts` and `pushSkill.ts` retain
  their targeting, effect, routing and visual behavior, using shared charge rules.
- `encyclopediaDetails.ts` reads charge fields and names from the catalog, and
  `data/towerRanges.ts` references its diagrams. The encyclopedia no longer
  imports the skill runtime to read constants. Existing config constants remain
  derived aliases, not a second set of balance values.

## Preserved Timing

SP remains an integer with a fractional buffer. Zero-initial-SP states remain
lazy; w still starts at 8 SP. Upgrade resets give zero SP, not initial SP. h keeps
its charge when upgraded; # clears charge but never used an active deadline.

Recovery boundaries intentionally preserve the previous rules: o/j charge only
the inactive portion of a tick crossing their active deadline; w/c/S charge a
whole tick once no longer active. S aiming is local display state only; it cannot
pause recovery if another actor casts the tower while the picker stays open.
Normal aiming starts at full SP; canceling aim costs no SP. h and # do not pause
recovery during their effects.

Charge helpers do not select targets, spend automatically or invoke effects.
Guardian waits at full SP for an injured target. ! can trigger ready untargeted
manual skills; S/# still require a selected location/direction. Pipeline routing
spends and reserves the source skill normally while suppressing its local effect;
numeric outlets finish routed skills but do not passively recharge them.

Existing state keys and snapshot shapes are unchanged. No replay rules version
change is needed for this refactor. Changes to charge arithmetic or actual timing
in future are balance/compatibility changes, not harmless metadata cleanup.

Manual player actions now execute through [semantic operations](battle-operations.md).
Read-only target queries and local picker setup are separate from explicit group
activation. The controller preflights all members before spending, including copied
behavior identity and SP readiness. Automatic activation and pipeline imitation
remain simulation actions rather than remote player commands.

## Extending And Checking

1. Add a catalog entry with an explicit recovery/reset policy and range.
2. Register its action handlers. Keep target validation, state changes and routing
   outside visual callbacks. Read numeric skill parameters from the catalog.
3. Add effect prose to the encyclopedia. Numeric SP fields use the shared rules;
   prose and specialized range rendering still need deliberate maintenance.
4. Test direct deployment, copied forms, effective levels, upgrade, no-target
   readiness, exact deadline ticks, continuous activation and pipeline routing.

`test-tower-skills.mjs` verifies engine-free data/encyclopedia loading, catalog
agreement, tick-for-tick comparisons against the previous rules and controller
behavior. It runs with `npm run test:rules`. Browser checks for copies, pipelines
and deterministic save/replay cover integration with real scene objects.

The action controller still owns Phaser visuals and runtime references. Explicit
snapshot DTOs, full simulation/render separation and common aura catalogs remain
separate work. Boss SP data now has its own catalog; see
[Boss Skill Definitions](boss-abilities.md).
