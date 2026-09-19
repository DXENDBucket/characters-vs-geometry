# Survival Battle Saves

- Supported operations: regular endless IF-1 through IF-12 and Cube Boss Endless IF-BE-1. Other Boss families are not enabled for battlefield saves.
- Storage: one versioned `charset-survival-v1:<levelId>` localStorage entry per operation, separate from best-wave progress.
- Save points: the pause menu's exit command, and browser `pagehide` (including a normal reload). No offline simulation or wall-clock catch-up.
- Continue skips card selection, restores the saved difficulty and loadout, and opens the pause menu. Restart begins a new run and clears that operation's save. Defeat also clears it; neither clears the best-wave record.
- A failed write leaves the previous localStorage entry intact and prevents leaving the live battlefield. Unsupported/corrupt saves are not silently deleted. Resetting progress removes survival saves too.

## Data Boundaries

`BattleSaveState` is the session data contract. `saveGraph` encodes references and non-finite timer sentinels; `battleSnapshot` recreates Phaser units and connects the data graph. No display objects, callbacks or controller instances are serialized.

The graph preserves shared health pools, mirror group IDs, projectile targets and sources, removed attack sources, and enemies held by small q. Cube Boss nodes preserve rank, HP, status effects, SP, position and rotation, including projectile references to defeated Bosses. Controllers expose narrow state export/restore methods for cooldowns, extraction, storage and skill flights.

Boss Endless keeps its highest defeated rank separately from best-wave records. A defeat records the current rank, then spawns the next Boss; ordinary wave progress is not reset. Saved active Bosses must be alive and have a valid rank, skill state and same-rank Advance summon.

`BattleActionQueue` stores pending tower and enemy volleys, shock pulses, targeted-effect cards and S launches. Regular endless uses this battle-clock queue instead of closure-based timers. S flights retain their elapsed progress along the original easing curve. Other modes keep their existing scheduling.

Visual-only particles, active pointer selection, drag previews and unconfirmed targeting are not restored. Their underlying health, skills, resources and damage state are preserved. New gameplay timers added to regular endless must use serializable actions (or include an explicit state restore path).
