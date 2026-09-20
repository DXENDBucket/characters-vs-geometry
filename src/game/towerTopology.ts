import { COLUMNS, LANES } from "../config";
import type { Tower } from "../types";

export interface TowerCell { lane: number; column: number }
interface Topology { logical: TowerCell[]; physical: TowerCell[]; signature: string }
const contexts = new WeakMap<object, Topology>();
const boards = new WeakMap<Tower[], Topology>();
const index = (cell: TowerCell) => cell.lane * COLUMNS + cell.column;
const cells = () => Array.from({ length: LANES * COLUMNS }, (_, i) => ({ lane: Math.floor(i / COLUMNS), column: i % COLUMNS }));
export function validTowerCell(cell: TowerCell) {
  return Number.isInteger(cell.lane) && Number.isInteger(cell.column) && cell.lane >= 0 && cell.lane < LANES && cell.column >= 0 && cell.column < COLUMNS;
}

export function syncTowerTopology(towers: Tower[]) {
  const swaps = towers.filter(t => t.inPlay && t.type === "&" && t.topologyTarget && validTowerCell(t) && validTowerCell(t.topologyTarget))
    .sort((a, b) => (a.topologyOrder ?? a.placedOrder) - (b.topologyOrder ?? b.placedOrder) || a.placedOrder - b.placedOrder);
  const signature = swaps.map(t => `${t.id}:${index(t)}:${index(t.topologyTarget!)}`).join("|");
  let topology = boards.get(towers);
  const changed = topology?.signature !== signature;
  if (changed) {
    const physical = cells(), logical = cells();
    for (const tower of swaps) {
      const a = index(tower), b = index(tower.topologyTarget!);
      [physical[a], physical[b]] = [physical[b], physical[a]];
    }
    for (let i = 0; i < physical.length; i++) logical[index(physical[i])] = { lane: Math.floor(i / COLUMNS), column: i % COLUMNS };
    topology = { physical, logical, signature }; boards.set(towers, topology);
  }
  for (const tower of towers) contexts.set(tower, topology!);
  return changed;
}

export function towerCell(tower: Tower): TowerCell {
  return validTowerCell(tower) ? contexts.get(tower)?.logical[index(tower)] ?? tower : tower;
}
export function physicalTowerCell(anchor: Tower, cell: TowerCell): TowerCell {
  return validTowerCell(cell) ? contexts.get(anchor)?.physical[index(cell)] ?? cell : cell;
}
export function logicalTowerCell(anchor: Tower, cell: TowerCell): TowerCell {
  return validTowerCell(cell) ? contexts.get(anchor)?.logical[index(cell)] ?? cell : cell;
}
export function towerAtCell(occupied: Map<string, Tower>, anchor: Tower, lane: number, column: number) {
  const cell = physicalTowerCell(anchor, { lane, column });
  return occupied.get(`${cell.lane}:${cell.column}`);
}
export function towerCellDelta(a: Tower, b: Tower) {
  const first = towerCell(a), second = towerCell(b);
  return { lane: second.lane - first.lane, column: second.column - first.column };
}
export function inFriendlyRange(source: Tower, target: Tower, radius: number, omitCorners = false) {
  const delta = towerCellDelta(source, target), dl = Math.abs(delta.lane), dc = Math.abs(delta.column);
  return dl <= radius && dc <= radius && !(omitCorners && dl === radius && dc === radius);
}
export function topologyKey(tower: Tower) { return contexts.get(tower)?.signature ?? ""; }
export function inheritTowerTopology(source: Tower, view: Tower) {
  const context = contexts.get(source);
  if (context) contexts.set(view, context);
}
