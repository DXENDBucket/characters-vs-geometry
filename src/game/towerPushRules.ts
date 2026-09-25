import { parenthesisInner, syncTowerOccupancy } from "./towerOccupancy";
import { logicalTowerCell, physicalTowerCell, towerCell } from "./towerTopology";
import type { TowerActionDataEvent } from "./towerActions";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import type { TowerState as Tower } from "./towerState";
import { gridCellKey } from "./boardCells";
import { getTowerSkillState } from "./skillState";
import { spendTowerSkill } from "./towerSkillRules";
import { PUSH_DURATION, pushIsReady } from "./pushSkillRules";
import { planTowerPush } from "./rules/towerPush";
import type { TowerMovementRuntime } from "./towerShifterRules";
import { settleTowerMoveVisual } from "./towerRules";

export interface TowerPushRuntime<T extends Tower = Tower> extends TowerMovementRuntime<T> {
  onTowerAction?: (tower: T, event: TowerActionDataEvent) => boolean | void;
  eraseTower: (tower: T) => void;
}

export interface PushPresentation {
  started(tower: Tower): void;
  position(tower: Tower): void;
  erased(tower: Tower, fromX: number, fromY: number, time: number): void;
  settled(tower: Tower, time: number): void;
}
export const NO_PUSH_PRESENTATION: PushPresentation = Object.freeze({ started() {}, position() {}, erased() {}, settled() {} });

export class TowerPushSimulation<T extends Tower = Tower> {
  constructor(private readonly runtime: () => TowerPushRuntime<T>, public presentation: PushPresentation = NO_PUSH_PRESENTATION) {}

  plan(source: T, lane: number, column: number) {
    if (!source.inPlay || source.nullified || source.moveVisual) return null;
    const runtime = this.runtime();
    const byId = new Map(runtime.towers.map(tower => [tower.id, tower]));
    const origin = towerCell(source), target = logicalTowerCell(source, { lane, column });
    const logicalTowers = new Map(runtime.towers.map(tower => [tower.id, { id: tower.id, inPlay: tower.inPlay, ...towerCell(tower) }]));
    const plan = planTowerPush({ id: source.id, inPlay: source.inPlay, ...origin }, target, {
      lanes: LANES, columns: COLUMNS,
      getTower: id => logicalTowers.get(id),
      occupantAt: (row, col) => { const cell = physicalTowerCell(source, { lane: row, column: col }); return runtime.occupied.get(gridCellKey(cell.lane, cell.column))?.id; },
      isCellDeployable: (row, col) => { const cell = physicalTowerCell(source, { lane: row, column: col }); return runtime.isCellDeployable?.(cell.lane, cell.column) ?? true; }
    });
    if (!plan) return null;
    const moves = plan.map(move => {
      const from = physicalTowerCell(source, { lane: move.fromLane, column: move.fromColumn });
      const to = physicalTowerCell(source, { lane: move.toLane, column: move.toColumn });
      return { ...move, fromLane: from.lane, fromColumn: from.column, toLane: to.lane, toColumn: to.column, tower: byId.get(move.towerId)! };
    });
    for (const move of [...moves]) {
      const companion = (move.tower.parenthesisGuard ?? parenthesisInner(move.tower)) as T | undefined;
      if (companion && !moves.some(item => item.tower === companion)) moves.push({ ...move, towerId: companion.id, tower: companion });
    }
    if (moves.some(move => !move.tower.inPlay || move.tower.nullified || move.tower.moveVisual)) return null;
    return { moves, origin, target };
  }

  push(source: T, lane: number, column: number, free = false) {
    if (!source.inPlay || source.nullified || source.moveVisual || (!free && (!source.skills.push || !pushIsReady(source)))) return false;
    const plan = this.plan(source, lane, column);
    if (!plan) return false;
    const { moves, origin, target } = plan, runtime = this.runtime();
    if (!free) spendTowerSkill("#", getTowerSkillState(source, "push"));
    if (!free && runtime.onTowerAction?.(source, { kind: "skill", laneOffset: target.lane - origin.lane, columnOffset: target.column - origin.column })) return true;
    this.presentation.started(source);
    // Commit all cells before any removal callback can rebuild mirror/health networks.
    for (const move of moves) runtime.occupied.delete(gridCellKey(move.fromLane, move.fromColumn));
    for (const move of moves) {
      const tower = move.tower;
      tower.moveVisual = { fromX: tower.x, fromY: tower.y, startedAt: runtime.battleTime, duration: PUSH_DURATION };
      tower.lane = move.toLane;
      tower.column = move.toColumn;
      tower.x = BOARD_X + (tower.column + 0.5) * CELL_WIDTH;
      tower.y = BOARD_Y + (tower.lane + 0.5) * CELL_HEIGHT;
      this.presentation.position(tower);
      if (!move.erased) runtime.occupied.set(gridCellKey(tower.lane, tower.column), tower);
    }
    for (const move of moves) {
      if (!move.erased) continue;
      const tower = move.tower;
      const { fromX, fromY } = tower.moveVisual!;
      runtime.eraseTower(tower);
      this.presentation.erased(tower, fromX, fromY, runtime.battleTime);
    }
    syncTowerOccupancy(runtime.towers, runtime.occupied);
    runtime.onMoved(moves);
    for (const { tower } of moves) if (tower.inPlay) {
      settleTowerMoveVisual(tower, runtime.battleTime);
      this.presentation.settled(tower, runtime.battleTime);
    }
    return true;
  }

}
