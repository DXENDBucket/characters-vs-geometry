# Boss Simulation

## Actual Battle Path

`GameScene` still calls the public `bossRuntime.ts` facade, but its four entry
points delegate to `bossSimulation.ts`. The latter advances the actual Boss
rules using `BossState`, `EnemyState`, `TowerState` and explicit factory,
damage, delayed-action, cell-seal and presentation ports. It does not import
Phaser, rendering or scenes, transitively enforced by dependency tests.

This includes promotion and advance, tetrahedron skills and critical summons,
octahedron shields/copies/reinforcements, all four icosahedron skill groups,
companion formation/actions/death responses, DEL stack/format/sweeps and Boss
contact damage. `enemyPromotionRules.ts` also owns promotion targeting and
state mutation; its seeded RNG and discovery observer are explicit ports.
The original public promotion API delegates to the same rule implementation.

## Boundaries

- `render/bossSimulation.ts` caches one live adapter per Boss runtime. Getters
  forward current rosters, clocks and phase state instead of retaining stale
  arrays or timestamps. Live factories retain entity allocation, enemy health
  links and environment HP scaling.
- Position integration remains authoritative. `syncCubeBossMotionVisual` only
  updates display position and cosmetic rotation; the legacy movement wrapper
  remains available without causing double movement on the actual battle path.
- Companion positions and action deadlines advance even with presentation
  disabled. Rotation used to draw their polyhedra is read only by the renderer.
- Companion, contact-target and laser scratch buffers belong to each runtime.
  Nested calls into another battlefield cannot overwrite their results.
- Delayed attacks retain the existing saved action queue and entity references.
  Multihit attacks still perform separate damage judgments. Old-root Boss
  actions are ignored after that root has been replaced.
- Warning deadlines, immediate octahedron shields, independent part effects,
  shared HP and final-phase lethal locks retain their existing ordering.
- The legacy haste-cue deadline remains simulation-owned because existing
  snapshots/checksums include it; suppressing the cue does not change its timing.

## Verification

Ten new Node integration tests use actual factories, the action queue, seeded
RNG, damage rules and graph snapshots without engine or gameplay-module mocks.
They cover promotion, summon footprints/ranks, copy warnings, fatal locks,
companions, separate multihits, protected cells, cross-world scratch buffers,
DEL delayed targeting/format/sweeps and restored continuation for six Boss kinds.

Seven real-browser scenarios compare displayed, presentation-disabled and
snapshot-restored scenes. All combat presentation ports are disabled together
in the detached scenes. Each scenario advances 900 ticks:

| Scenario | Checksum |
| --- | --- |
| 1-10 promotion | `4d1ef8d9` |
| 2-10 critical summons | `ec772913` |
| 5-5 companions | `4bffa632` |
| 5-8 copies | `526b1965` |
| 5-10 P3 companions | `96339952` |
| 5-10 P4 copies/lethal lock | `aaa91938` |
| AE-10 DEL | `a827b13a` |

614 rule tests, 7 audio tests, data validation and TypeScript/Vite build pass.
The existing deterministic multi-level/phase browser suite, Boss-copy warnings
and DEL behavior regressions pass. The real host plus two isolated browser
clients preserve joining, running, recovery, terminal and content checksums.

## Still Open

This does not make the complete battle headless. Phase-transition cleanup,
storage/pipeline orchestration, targeted attachments, deployment and other
live callbacks still need data-only ownership. The browser comparison removes
presentation callbacks, not all live factories; the Node tests establish the
Boss runtime's bodyless boundary separately. Stable-ID relationship records,
participant resources/ownership and production multiplayer UI/transport lifetime
handling also remain open. No whole-battle FPS improvement is claimed.
