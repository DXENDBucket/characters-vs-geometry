# Tower State Boundary

`game/towerState.ts` owns the tower data contract, base-panel projection and pure
initial-state factory. `Tower` in `types.ts` extends that contract with its display
objects. `game/towers.ts` attaches the visuals and remains the existing live API.
The base-panel function is re-exported by `unitStats.ts` for copied/action panels.

Initialization keeps the original object field order, IDs, lazy skill states,
arming/production deadlines and non-finite timer sentinels. Imitator source-card
identity is kept separate from the deployed behavior. Each tower owns independent
panels, skill objects and effects. Definitions are never mutated.

## Pure Queries

`game/towerRules.ts` contains facing, effective level, production, trigger scaling,
arming, automatic-upgrade selection, damage-type and flying-state rules. These
operate on `TowerState` without loading Phaser. The old exports from `towers.ts`
remain available, but battle callers import pure queries directly.

`render/towerFacing.ts` contains only facing visual synchronization. Status effects
use it directly instead of importing the entire tower factory and rendering module.
This removes the tower rendering module from the core runtime dependency cycle.

Preserve these distinctions when extending rules:

- Action contexts override the actor's behavior/level/damage type for that action.
- Reversal depends on the active effect list; effect expiry belongs to its update.
- Flying is represented by a positive `flyingUntil`; its controller clears it.
- Ordinary trigger durations use effective-upgrade scaling, but reversal duration
  uses the raw effective tower level. Small l has only one trigger.
- Auto-upgrade ties prefer earlier placement, and imitator card identity resolves
  to the original tower type. Numeric eligibility is unchanged.

## Snapshots

`captureBattleSnapshot.ts` includes an explicit record covering every `TowerState`
key, including optional and inherited numeric fields. New data fields require an
update there at compile time. Display fields and newly attached visual caches are
excluded without maintaining a list of their names.

The graph encoder still walks included properties in the original order. It keeps
shared health pools, parentheses, pipeline packets, mirror metadata, NUL towers and
removed action sources connected by reference. Old snapshot layout, restore
validation, migrations and battle rules version are unchanged.

`moveVisual` intentionally remains checkpoint data for now: existing replay hashes
and interrupted push animations depend on it. Removing it requires a separate
compatibility decision, not merely renaming it as visual state.

## Verification And Remaining Work

`scripts/test-tower-state.mjs` checks all card definitions and eligible imitator
variants against pre-refactor initialization; pure queries, action overrides,
automatic-upgrade ordering, visual exclusion and cyclic legacy snapshots are also
covered. Browser tests cover copies, parentheses, pipelines, NUL and deterministic
save continuation with actual display objects.

This is not yet a renderer-free battle engine. Pool/shell/projectile references
still use live entity types; health updates still synchronize bars, and deployment,
copy switching and upgrades still have visual effects. Enemy/Boss state contracts,
stable entity IDs and a scene-independent battle session remain future work.
