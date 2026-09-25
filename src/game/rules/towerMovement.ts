import * as battleMath from "../battleMath";
export interface GridPosition {
  lane: number;
  column: number;
}

export interface MoveTowerSource extends GridPosition {
  towerId: string;
}

// Source cells let an executor reject a request made before another move or removal.
export interface MoveTowersCommand {
  type: "moveTowers";
  sources: readonly MoveTowerSource[];
  destination: GridPosition;
}

export interface MovableTower extends GridPosition {
  id: string;
  inPlay: boolean;
}

export interface MovementBoard {
  lanes: number;
  columns: number;
  layers?: number;
  getTower: (id: string) => MovableTower | undefined;
  occupantAt: (lane: number, column: number, movingTowerId?: string) => string | undefined;
  isCellDeployable: (lane: number, column: number) => boolean;
}

export interface TowerMove {
  towerId: string;
  fromLane: number;
  fromColumn: number;
  toLane: number;
  toColumn: number;
}

export type TowerMovePlan =
  | { valid: true; moves: TowerMove[]; cooldownMs: number }
  | { valid: false; reason: "empty" | "invalid" | "stale" | "outside" | "sealed" | "occupied" };

export const SHIFTER_BASE_COOLDOWN = 15_000;

export function planTowerMove(command: MoveTowersCommand, board: MovementBoard): TowerMovePlan {
  if (command.sources.length === 0) {
    return { valid: false, reason: "empty" };
  }
  if (
    command.type !== "moveTowers" ||
    command.sources.length > board.lanes * board.columns * (board.layers ?? 1) ||
    !isGridPosition(command.destination)
  ) {
    return { valid: false, reason: "invalid" };
  }

  const selectedIds = new Set<string>();
  let anchor = command.sources[0];
  for (const source of command.sources) {
    if (!isGridPosition(source) || selectedIds.has(source.towerId)) {
      return { valid: false, reason: "invalid" };
    }
    selectedIds.add(source.towerId);
    const tower = board.getTower(source.towerId);
    if (
      !tower?.inPlay || tower.id !== source.towerId ||
      tower.lane !== source.lane || tower.column !== source.column ||
      board.occupantAt(source.lane, source.column, source.towerId) !== source.towerId
    ) {
      return { valid: false, reason: "stale" };
    }
    if (source.lane < anchor.lane || (source.lane === anchor.lane && source.column < anchor.column)) {
      anchor = source;
    }
  }

  const moves: TowerMove[] = [];
  for (const source of command.sources) {
    const toLane = command.destination.lane + source.lane - anchor.lane;
    const toColumn = command.destination.column + source.column - anchor.column;
    if (toLane < 0 || toLane >= board.lanes || toColumn < 0 || toColumn >= board.columns) {
      return { valid: false, reason: "outside" };
    }
    if (!board.isCellDeployable(toLane, toColumn)) {
      return { valid: false, reason: "sealed" };
    }
    const occupant = board.occupantAt(toLane, toColumn, source.towerId);
    if (occupant !== undefined && !selectedIds.has(occupant)) {
      return { valid: false, reason: "occupied" };
    }
    moves.push({ towerId: source.towerId, fromLane: source.lane, fromColumn: source.column, toLane, toColumn });
  }

  return { valid: true, moves, cooldownMs: SHIFTER_BASE_COOLDOWN * battleMath.pow(1.2, moves.length - 1) };
}

function isGridPosition(position: GridPosition) {
  return Number.isSafeInteger(position.lane) && Number.isSafeInteger(position.column);
}
