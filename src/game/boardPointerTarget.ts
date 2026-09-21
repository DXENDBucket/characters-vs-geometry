import { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT, COLUMNS, LANES } from "../config";
import type { EdgeTower, Tower } from "../types";
import { edgeAtPoint, edgeKey } from "./projectileCircuit";
import { parenthesisAtPoint } from "./towerOccupancy";

/** Bracket strokes take precedence over nearby connectors; the cell center targets its occupant. */
export function boardPointerTarget(occupied: Map<string, Tower>, edges: EdgeTower[], x: number, y: number) {
  const column = Math.floor((x - BOARD_X) / CELL_WIDTH), lane = Math.floor((y - BOARD_Y) / CELL_HEIGHT);
  if (column < 0 || column >= COLUMNS || lane < 0 || lane >= LANES) return;
  const cellTower = occupied.get(`${lane}:${column}`);
  const pointedParenthesis = parenthesisAtPoint(cellTower, x, y);
  const position = !pointedParenthesis && edgeAtPoint(x, y);
  const edge = position ? edges.find(edge => edgeKey(edge) === edgeKey(position)) : undefined;
  return { lane, column, cellTower, pointedParenthesis, tower: pointedParenthesis ?? cellTower, edge };
}
