import type { GridPosition, MovableTower, MovementBoard, TowerMove } from "./towerMovement";

export interface TowerPushMove extends TowerMove {
  erased: boolean;
}

export function planTowerPush(source: MovableTower, target: GridPosition, board: MovementBoard): TowerPushMove[] | null {
  const dy = target.lane - source.lane;
  const dx = target.column - source.column;
  if (!source.inPlay || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1 ||
      board.occupantAt(source.lane, source.column) !== source.id) return null;
  const inside = (lane: number, column: number) => lane >= 0 && lane < board.lanes && column >= 0 && column < board.columns;
  let { lane, column } = target;
  const moves: TowerPushMove[] = [];
  while (inside(lane, column)) {
    if (!board.isCellDeployable(lane, column)) break;
    const id = board.occupantAt(lane, column);
    if (!id) break;
    const tower = board.getTower(id);
    if (!tower?.inPlay || tower.lane !== lane || tower.column !== column || id === source.id) return null;
    const toLane = lane + dy;
    const toColumn = column + dx;
    moves.push({ towerId: id, fromLane: lane, fromColumn: column, toLane, toColumn,
      erased: !inside(toLane, toColumn) || !board.isCellDeployable(toLane, toColumn) });
    lane = toLane;
    column = toColumn;
  }
  return moves.length ? moves : null;
}
