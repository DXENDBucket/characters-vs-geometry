import type { EnemyKind } from "../types";

const observers = new WeakMap<object, (kind: EnemyKind) => void>();

export function setBattleDiscoveryObserver(owner: object, observer?: (kind: EnemyKind) => void) {
  if (observer) observers.set(owner, observer);
  else observers.delete(owner);
}

export function observeBattleEnemy(owner: object, kind: EnemyKind) {
  observers.get(owner)?.(kind);
}
