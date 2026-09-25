import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import type { TowerState as Tower } from "./towerState";
import { gridCellKey } from "./boardCells";
import { syncTowerOccupancy, towerInPlacementLayer } from "./towerOccupancy";
import { planTowerMove, SHIFTER_BASE_COOLDOWN, type MoveTowersCommand, type TowerMove } from "./rules/towerMovement";

export interface AppliedTowerMove<T extends Tower = Tower> extends TowerMove { tower: T }

export interface TowerMovementRuntime<T extends Tower = Tower> {
  towers: T[];
  occupied: Map<string, T>;
  battleTime: number;
  isCellDeployable?: (lane: number, column: number) => boolean;
  onMoved: (moves: AppliedTowerMove<T>[]) => void;
}

export interface TowerShifterRuntime<T extends Tower = Tower> extends TowerMovementRuntime<T> {
  cardTime: number;
}

export interface ShifterPresentation { position(tower: Tower, time: number): void }
export const NO_SHIFTER_PRESENTATION: ShifterPresentation = Object.freeze({ position() {} });

export class TowerShifterSimulation<T extends Tower = Tower> {
  private readyAt = 0;
  private cooldownStartedAt = 0;
  private cooldownDuration = SHIFTER_BASE_COOLDOWN;

  constructor(private readonly runtime: () => TowerShifterRuntime<T>, public presentation: ShifterPresentation = NO_SHIFTER_PRESENTATION) {}

  snapshot() {
    return { readyAt: this.readyAt, cooldownStartedAt: this.cooldownStartedAt, cooldownDuration: this.cooldownDuration };
  }

  restore(state: ReturnType<TowerShifterSimulation["snapshot"]>) {
    this.readyAt = state.readyAt;
    this.cooldownStartedAt = state.cooldownStartedAt;
    this.cooldownDuration = state.cooldownDuration;
  }

  reset() {
    this.readyAt = this.cooldownStartedAt = 0;
    this.cooldownDuration = SHIFTER_BASE_COOLDOWN;
  }

  isReady() { return this.runtime().cardTime >= this.readyAt; }

  cooldownRatio() {
    const time = this.runtime().cardTime;
    return time >= this.readyAt ? 1 : Math.max(0, Math.min(1, (time - this.cooldownStartedAt) / this.cooldownDuration));
  }

  plan(command: MoveTowersCommand, towersById = new Map(this.runtime().towers.map(tower => [tower.id, tower]))) {
    const runtime = this.runtime();
    return planTowerMove(command, {
      lanes: LANES, columns: COLUMNS, layers: 2,
      getTower: id => towersById.get(id),
      occupantAt: (lane, column, movingId) => towerInPlacementLayer(runtime.occupied, lane, column, towersById.get(movingId!)!.type)?.id,
      isCellDeployable: (lane, column) => runtime.isCellDeployable?.(lane, column) ?? true
    });
  }

  executeMove(command: MoveTowersCommand): "moved" | "invalid" | "cooldown" {
    const runtime = this.runtime();
    if (runtime.cardTime < this.readyAt) return "cooldown";
    const towersById = new Map(runtime.towers.map(tower => [tower.id, tower]));
    const plan = this.plan(command, towersById);
    if (!plan.valid) return "invalid";
    const moves = plan.moves.map(move => ({ ...move, tower: towersById.get(move.towerId)! }));
    for (const { tower } of moves) runtime.occupied.delete(gridCellKey(tower.lane, tower.column));
    for (const { tower, toLane: lane, toColumn: column } of moves) {
      tower.moveVisual = undefined;
      tower.lane = lane;
      tower.column = column;
      tower.x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
      tower.y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      this.presentation.position(tower, runtime.battleTime);
      runtime.occupied.set(gridCellKey(lane, column), tower);
    }
    syncTowerOccupancy(runtime.towers, runtime.occupied);
    this.cooldownStartedAt = runtime.cardTime;
    this.cooldownDuration = plan.cooldownMs;
    this.readyAt = runtime.cardTime + this.cooldownDuration;
    runtime.onMoved(moves);
    return "moved";
  }
}
