# Dynamic Enemy Ranks

Ordinary enemies and leaders are defined by a family and a positive integer rank.
Each family has one entry in `src/data/enemyArchetypes.ts`: its base panel,
additive per-rank growth, attack mode and common metadata. A rank does not need
its own definition, registration, translation, or TypeScript union member.

## Usage

```ts
import { enemyKindAtRank, getEnemyDefinition } from "../registry/enemies";

const kind = enemyKindAtRank("triangle", 100);
const stats = getEnemyDefinition(kind);
// Pass kind to spawnEnemyAt, createEnemy, or a LevelConfig.enemyKinds pool.
```

Serialized IDs stay compatible: rank 1 is `triangle`, rank 2 is `triangle2`,
rank 100 is `triangle100`. Use `enemyKindAtRank` instead of concatenating strings.
`isEnemyKind` validates saved or external IDs. Zero, fractional, unsafe integer,
unknown-family and noncanonical IDs such as `triangle01` are rejected.

## Growth And Behavior

- Panel values follow `base + growth * (rank - 1)`; omitted growth is zero.
- Existing I/II/III panels, weights and behavior registrations are unchanged.
- Existing rank-dependent attacks, volleys, auras and cargo capacity use the
  resolved rank. Angel initial SP is capped at its actual skill maximum.
- Circles split into the preceding rank. Rams and maces release their own rank
  of the appropriate minion families, without a rank-three cap.
- Boss promotion skills retain their existing rank-three promotion ceiling.
- Existing damage floors and volley multi-hit rules are unchanged. High-rank
  balance, total enemy counts and endless-wave budgets still belong to the mode.

## Catalog, Display And Storage

`catalogRanks` controls only the finite existing catalog, not the maximum runtime
rank. `allEnemyDefinitions` and `allEnemyRegistrations` enumerate that catalog;
runtime code must use the resolver functions. Wave generation accepts a resolver
so it can budget unregistered ranks without expanding a table.

Endless pools use `LevelConfig.unlimitedRankFamilies`. The sampler counts
affordable ranks arithmetically and respects an optional archetype `spawnRankCap`.
Circle currently has a rank-IV spawning cap; the resolver still accepts higher
legacy ranks, so loading older data is not destructive.

High-rank discoveries survive local-save reloads and reveal their family entry
in the encyclopedia. Dynamic names use one translation per family. Numerals
above 3999 use decimal notation; unit labels shrink to fit the shape.

Dynamic registrations are cached with a 512-entry limit. Rank lookup does not
enumerate or allocate every preceding rank.

Boss companions and the unranked Solar Bomb are not extended in this abstraction.
Cube and Tetrahedron Bosses use a separate explicit rank in `bossRanks.ts`.
Cube has linear HP/armor, same-rank Square summons and rank-aware Promotion.
Tetrahedron retains its identical I/II base panels, summons same-rank Inverted/Shooting
Triangles and gains 0.5 additional Charge speed multiplier per rank. Other Boss families remain fixed.
Endless battle persistence is documented in `survival-saves.md`.

## Verification

`npm run test:rules` includes a frozen snapshot of all 66 pre-refactor enemy
definitions and registrations, plus dynamic-rank, wave, skill and save tests.
`npm run validate` resolves enemy IDs instead of assuming a finite kind union.
