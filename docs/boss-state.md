# Boss State Boundary

`game/bossState.ts` defines logical Boss state and its pure constructor. It covers
rank scaling, panels, initial skills, hitboxes, facing, copies, delayed summons
and DEL transitions without Phaser, clocks or random draws. Both current Boss
spawning and snapshot restoration use this constructor through the live adapter.

`game/bossRules.ts` owns family queries, physical movement, advance spawn points
and base-stat synchronization. Reversal expires at the same simulation deadline;
it still affects horizontal facing only. Callers needing these queries no longer
import the Boss mesh renderer. `bossSkillRules.ts` accepts logical state directly.

`bosses/cubeBoss.ts` attaches display objects and cosmetic rotation. `CubeBoss`
extends `BossState` with live part references, rotation and Phaser objects. Cosmetic
rotation randomness remains separate from battle RNG, and pure state creation
does not generate or retain rotation. `BossRotationState` documents the legacy
save fields, not additional authoritative battle properties.

Snapshot capture now uses exhaustive, type-checked Boss fields, including optional
state. Legacy rotation is explicitly retained for existing saves. Capture preserves
the original object's field order and graph identity, and unknown render caches
cannot leak into the graph. The existing unsupported small-stellated Boss save
restriction has not changed. This refactor does not change rules version 6.

## Verification

`scripts/test-boss-state.mjs` checks all registered Boss kinds and dynamic ranks,
independent state, no render dependencies or random draws, exact reversal expiry,
base/final stats, spawn geometry, phase skills, legacy graph order, delayed copies,
DEL echoes and shared target references. Module-boundary tests protect the new
entries. Browser replay tests remain necessary for actual movement/render adapters,
multi-phase battles and restoration of live displays.

## Remaining Work

Boss attacks, damage and phase orchestration still use live runtime adapters.
Copies are object references, not stable network IDs. Rendering still occurs during
simulation updates. This completes the Boss data boundary, not a headless Boss
runtime or network authority implementation.
