import type { EnemyState as Enemy } from "./enemyState";
import { enemyFamily } from "../registry/enemies";
import { enemyFamilyProvidesSupport } from "../data/enemyAbilities";
import { enemyRosterRevision } from "./enemyRoster";

interface SupportIndex {
  revision: number;
  count: number;
  candidates: Enemy[];
}

const indices = new WeakMap<Enemy[], SupportIndex>();

/** Cache membership only. Position, rank, flight and alive state remain live at every hit. */
export function enemySupportCandidates(enemies: Enemy[]): readonly Enemy[] {
  const revision = enemyRosterRevision(enemies);
  const cached = indices.get(enemies);
  if (cached?.revision === revision && cached.count === enemies.length) return cached.candidates;
  const candidates: Enemy[] = [];
  const include = (enemy: Enemy) => {
    const family = enemyFamily(enemy.kind);
    if (enemyFamilyProvidesSupport(family)) {
      candidates.push(enemy);
    }
  };
  for (const enemy of enemies) {
    include(enemy);
    for (const passenger of enemy.parenthesisCargo ?? []) include(passenger);
  }
  indices.set(enemies, { revision, count: enemies.length, candidates });
  return candidates;
}
