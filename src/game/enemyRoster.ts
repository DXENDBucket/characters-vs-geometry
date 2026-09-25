import type { EnemyState as Enemy } from "./enemyState";

const revisions = new WeakMap<Enemy[], number>();

export function enemyRosterRevision(enemies: Enemy[]) {
  return revisions.get(enemies) ?? 0;
}

/** Also call after changing an enemy's family without adding/removing it. */
export function invalidateEnemyRoster(enemies: Enemy[]) {
  revisions.set(enemies, enemyRosterRevision(enemies) + 1);
}

export function addEnemyToField<E extends Enemy>(enemies: E[], enemy: E) {
  enemies.push(enemy);
  invalidateEnemyRoster(enemies);
}

export function removeEnemyFromField(enemies: Enemy[], enemy: Enemy) {
  removeEnemyAt(enemies, enemies.indexOf(enemy));
}

export function removeEnemyAt(enemies: Enemy[], index: number) {
  if (index < 0 || index >= enemies.length) return;
  enemies.splice(index, 1);
  invalidateEnemyRoster(enemies);
}

export function clearEnemyField(enemies: Enemy[]) {
  enemies.length = 0;
  invalidateEnemyRoster(enemies);
}
