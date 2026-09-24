# Enemy Ability Definitions

The migrated scope is five non-Boss SP skills (Heal, Wings, Ascension, Lead and
Incitement), three support auras, and Archangel entry flight. This is not yet a
universal ability interpreter for every tower and Boss.

## Ownership

- `src/data/enemyAbilities.ts` owns skill IDs, source families, localized names,
  SP values, rank growth, active durations, recovery policy and range diagrams.
  Aura source families, bonuses and growth also live here. Incitement's existing
  effect configuration stays in `data/incitement.ts`, referenced by the catalog.
- `game/enemySkillRules.ts` resolves initial/rank-dependent charge data and
  advances SP. It has no Phaser dependency. `game/enemyCombatRules.ts` similarly
  owns attack-speed queries used by gameplay and encyclopedia previews.
- `game/enemySkillRegistry.ts` binds catalog IDs to required typed action handlers.
  It derives family registration from the catalog rather than maintaining a
  second list of family-to-skill associations.
- `game/enemySkills.ts` performs targeting and effect execution. Lead collects
  ready casters and plans their targets from a shared position snapshot. Dispatch
  recognizes Lead by skill ID, so it does not suppress other skills added to the
  same family in the future.
- `game/enemySupport.ts` evaluates continuous support and its icons, separately
  from SP skills. The support candidate index reads source families from the aura
  catalog; candidate order and live checks remain unchanged.
- `render/enemySkillEffects.ts` contains the flight pulse animation. No visual
  callback changes skill charge, target selection or effect deadlines.
- `enemyEncyclopediaDetails.ts` reads the catalog and pure rules for SP fields,
  names, growth, durations and ranges. It no longer imports enemy factories,
  behavior/render helpers or the support runtime just to inspect these values.

## Preserved Rules

Initial SP is capped at maximum SP after additive per-rank growth. Recovery uses
the skill's base rate multiplied by its rank multiplier. The state retains its
fractional SP buffer; do not replace this with a floating SP counter without a
rules-version change. Reaching full SP alone does not spend it: the action handler
must find an eligible target when the skill requires one.

Active duration and granted-effect duration are distinct. Wings and Ascension
pause recovery until their active deadline. Incitement is an instant action that
grants timed buffs while continuing to recover SP.

Default zero-SP states remain lazy. Existing state keys (`heal`, `wings`,
`ascension`, `lead`, `incitement`) and saved `regenMultiplier` semantics are
unchanged, preserving save layout and deterministic replay checksums.

Ranges are authored in cells. Runtime handlers preserve existing coordinate
semantics: circular distances use `CELL_WIDTH`, rectangular ranges use both cell
dimensions, and Lead includes the caster's whole column plus the configured
columns behind it. Its vertical limits include half a cell beyond the row centers.
No targeting boundary was intentionally changed in this migration.

## Extending

1. Add or edit the relevant catalog entry. Adding a skill ID requires supplying
   its handler to `createEnemySkillRegistry`; TypeScript checks completeness.
2. Implement only the new targeting/effect behavior in the runtime. Use
   `chargeEnemySkill` for normal SP updates and explicitly spend SP after target
   validation. Keep simultaneous targeting rules outside visual callbacks.
3. Add the behavior description and trigger condition to the encyclopedia section.
   Numeric charge fields and range diagrams come from the catalog. New behaviors
   still need descriptions and executable code; metadata is not an implementation.
4. For an aura, implement its aggregation/eligibility rules too. Merely adding a
   source family makes it indexed, but does not invent a new bonus calculation.
5. Test rank I/II/III and a high endless rank, no-target readiness, freeze/flight,
   exact duration boundaries, passengers, simultaneous casters, and save/replay.

`test-enemy-skills.mjs` loads the pure modules without a Phaser mock, checks
catalog/registry/encyclopedia consistency, compares charge state tick-by-tick with
the pre-migration rules, and exercises the actual skill handlers. The browser
determinism and Incitement checks cover scene integration and saved battles.

Legacy catalog summary prose, Boss phases and several triggered enemy mechanics
remain outside this migration. The seven tower SP skills use a separate catalog;
see [Tower Skill Definitions](tower-abilities.md).
