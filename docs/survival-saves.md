# Survival Battle Saves

- Supported operations: regular endless IF-1 through IF-12 and Boss Endless IF-BE-1 through IF-BE-4.
- Storage: one versioned `charset-survival-v1:<levelId>` localStorage entry per operation, separate from best-wave progress.
- Save points: the pause menu's exit command, and browser `pagehide` (including a normal reload). No offline simulation or wall-clock catch-up.
- Continue skips card selection, restores the saved difficulty and loadout, and opens the pause menu. Restart begins a new run and clears that operation's save. Defeat also clears it; neither clears the best-wave record.
- A failed write leaves the previous localStorage entry intact and prevents leaving the live battlefield. Unsupported/corrupt saves are not silently deleted. Resetting progress removes survival saves too.

## Data Boundaries

`BattleSaveState` is the session data contract. `saveGraph` encodes references and non-finite timer sentinels; `captureBattleSnapshot` captures data without loading Phaser, while `battleSnapshot` recreates Phaser units and connects the data graph. No display objects, callbacks or controller instances are serialized. Projectile data now has explicit snapshot fields; see [Projectile State Boundary](projectile-state.md) for compatibility and remaining live-entity dependencies.

The graph preserves shared health pools, mirror group IDs, projectile targets and sources, removed attack sources, and enemies held by small q. Supported Boss nodes preserve rank, HP, status effects, SP, position and rotation, including projectile references to defeated Bosses. Tetrahedron also retains threshold triggers, pending critical summons, Charge and invincibility/haste deadlines. Controllers expose narrow state export/restore methods for cooldowns, extraction, storage and skill flights.

Boss Endless keeps its highest defeated rank separately from best-wave records. A defeat records the current rank, then spawns the next Boss; ordinary wave progress is not reset. Saved active Bosses must be alive and have a valid rank, skill state and same-rank Advance summon.

`BattleActionQueue` stores pending tower and enemy volleys, shock pulses, targeted-effect cards, Boss reinforcements and S launches. All game modes use this battle-clock queue instead of closure-based timers. S flights retain their simulation-owned progress along the original easing curve; impact damage no longer depends on tween callbacks.

New snapshots also contain the fixed simulation tick, residual frame time, gameplay random state, rules version and next mirror-group ID. Old snapshots without these fields remain loadable; deterministic continuation starts from the migrated checkpoint. See `multiplayer-preparation.md` for replay APIs and version compatibility.

Visual-only particles, active pointer selection, drag previews and unconfirmed targeting are not restored. Their underlying health, skills, resources and damage state are preserved. New gameplay timers added to regular endless must use serializable actions (or include an explicit state restore path).
