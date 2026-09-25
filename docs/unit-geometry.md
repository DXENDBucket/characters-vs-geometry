# Unit Geometry Boundary

`game/unitGeometry.ts` owns physical tower/Boss bounds, point and rectangle
intersection, nearest-hitbox distance, clamped impact coordinates and Boss-part
traversal. It imports only configuration values and types, not Phaser, rendering,
combat stats or target ranking.

Single-body geometry accepts positions and optional hitbox dimensions. Multi-part
queries still use live Boss references; this is not yet an entity-ID abstraction.
Tower topology swaps do not change these physical hitboxes.

## Preserved Semantics

- Points, rectangles and radii include touching edges. Zero dimensions are valid;
  only absent dimensions use legacy Boss defaults.
- Radius queries measure the nearest hitbox surface, not distance to its center.
  Point, distance and overlap tests retain scalar calculations without creating
  rectangles per candidate. Explicit bounds queries still return a fresh object.
- Boss-part iteration visits the root first, then its immediate secondary parts
  in stored order. It neither sorts by distance nor recurses into copies.
- DEL echo arrays take precedence over octahedron copies, including empty arrays.
- Geometry does not decide alive, invincible or targetable state. Callers retain
  their existing eligibility/damage rules and first-match behavior.
- Defense support measures the individual Boss part supplied by its caller,
  rather than applying a nearby copy's armor bonus to every part.

The old exports from `targeting.ts` remain available for compatibility. Its
`bossRect` and `towerRect` wrappers still construct Phaser rectangles. Runtime
geometry consumers now import the lower-level module directly. Cube summons use
plain bounds instead of allocating a Phaser rectangle only to read its left edge.

This removes the last dependency cycle:
`combatStats -> enemySupport -> targeting -> combatStats`.
Support no longer imports target selection merely to obtain a distance helper.
The source runtime import graph is now acyclic.

## Checks And Extension Rules

`scripts/test-unit-geometry.mjs` checks boundary contact, default and zero sizes,
off-board/fractional hitboxes, first-match traversal, DEL echo precedence and
inset row coverage. It and the support-index tests run without engine stubs.
Browser checks cover actual Boss collisions, targeting and deterministic replay.

`scripts/test-module-boundaries.mjs` inspects emitted TypeScript imports,
re-exports and literal dynamic imports. It ignores erased type-only references,
rejects runtime module cycles and ensures data/geometry/query entry points cannot
transitively import Phaser, render modules or scenes. These checks run through
`npm run test:rules`, including the existing publishing workflow.

New shared geometry belongs below target selection and stat evaluation. Do not
add damage eligibility, visual effects or simulation mutations to this module.
Keep existing edge inclusivity, traversal order and arithmetic order unless a
separate gameplay change explicitly calls for changing them.

An acyclic module graph does not make the battle engine renderer-independent:
combat stat queries still synchronize live effects, targeting still owns mixed
selection/blocking/healing rules, and Boss data still contains display references.
Further separation should preserve those side effects until they have explicit
simulation/render ownership. No full-battle FPS gain is claimed for this pass.
