import type { CardId, Tower } from "../types";

const key = (lane: number, column: number) => `${lane}:${column}`;
export const isParenthesisTower = (tower: Pick<Tower, "type">) => tower.type === "()";
const sameCell = (a: Tower, b: Tower) => a.lane === b.lane && a.column === b.column;

export function towerDamageReceiver(tower: Tower): Tower {
  const guard = tower.parenthesisGuard;
  return guard?.inPlay && sameCell(tower, guard) ? guard : tower;
}

export function parenthesisInner(tower: Tower) {
  const inner = tower.parenthesisInner;
  return inner?.inPlay && sameCell(tower, inner) ? inner : undefined;
}

export function towerCellMembers(tower: Tower | undefined): Tower[] {
  if (!tower) return [];
  const inner = parenthesisInner(tower), guard = towerDamageReceiver(tower);
  return inner ? [inner, tower] : guard !== tower ? [tower, guard] : [tower];
}

// Keep the ordinary tower as the cell representative so skills, pipes and friendly
// adjacency continue to find it. The protective layer redirects damage separately.
export function syncTowerOccupancy(towers: Tower[], occupied: Map<string, Tower>) {
  occupied.clear();
  const guards = new Map<string, Tower>();
  for (const tower of towers) {
    delete tower.parenthesisGuard; delete tower.parenthesisInner;
    if (!tower.inPlay || tower.transient) continue;
    if (isParenthesisTower(tower)) guards.set(key(tower.lane, tower.column), tower);
    else occupied.set(key(tower.lane, tower.column), tower);
  }
  for (const [cell, guard] of guards) {
    const inner = occupied.get(cell);
    if (inner) { inner.parenthesisGuard = guard; guard.parenthesisInner = inner; }
    else occupied.set(cell, guard);
  }
}

export function towerInPlacementLayer(occupied: Map<string, Tower>, lane: number, column: number, type: CardId) {
  const tower = occupied.get(key(lane, column));
  if (!tower) return undefined;
  return type === "()" ? (isParenthesisTower(tower) ? tower : tower.parenthesisGuard)
    : isParenthesisTower(tower) ? parenthesisInner(tower) : tower;
}

// Resolve before dealing any damage: breaking a shell must not add a second hit
// on its former occupant to the same area attack.
export function towerAreaTargets(towers: readonly Tower[]) {
  return towers.filter(tower => tower.inPlay && !parenthesisInner(tower));
}

export function parenthesisAtPoint(tower: Tower | undefined, x: number, y: number) {
  if (!tower) return undefined;
  const guard = isParenthesisTower(tower) ? tower : tower.parenthesisGuard;
  if (!guard?.inPlay) return undefined;
  const dx = Math.abs(x - guard.x), dy = Math.abs(y - guard.y);
  return dx >= 25 && dx <= 36 && dy <= 27 ? guard : undefined;
}
