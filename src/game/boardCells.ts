import { COLUMNS, LANES } from "../config";

const GRID_CELL_KEYS: string[][] = [];
for (let lane = 0; lane < LANES; lane += 1) {
  const row: string[] = [];
  for (let column = 0; column < COLUMNS; column += 1) {
    row.push(`${lane}:${column}`);
  }
  GRID_CELL_KEYS.push(row);
}

export function gridCellKey(lane: number, column: number) {
  return GRID_CELL_KEYS[lane]?.[column] ?? `${lane}:${column}`;
}
