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
  cooldown?: TowerShifterCooldown;
}

export interface TowerShifterCooldown { readyAt: number; cooldownStartedAt: number; cooldownDuration: number }
export function createTowerShifterCooldown(): TowerShifterCooldown {
  return { readyAt: 0, cooldownStartedAt: 0, cooldownDuration: SHIFTER_BASE_COOLDOWN };
}

export interface ShifterPresentation { position(tower: Tower, time: number): void }
export const NO_SHIFTER_PRESENTATION: ShifterPresentation = Object.freeze({ position() {} });

export class TowerShifterSimulation<T extends Tower = Tower> {
  private readonly localCooldown = createTowerShifterCooldown();
  private get cooldown() { return this.runtime().cooldown ?? this.localCooldown; }

  constructor(private readonly runtime: () => TowerShifterRuntime<T>, public presentation: ShifterPresentation = NO_SHIFTER_PRESENTATION) {}

  snapshot() {
    const state = this.cooldown;
    return { readyAt: state.readyAt, cooldownStartedAt: state.cooldownStartedAt, cooldownDuration: state.cooldownDuration };
  }

  restore(state: ReturnType<TowerShifterSimulation["snapshot"]>) {
    const target = this.cooldown;
    target.readyAt = state.readyAt; target.cooldownStartedAt = state.cooldownStartedAt; target.cooldownDuration = state.cooldownDuration;
  }

  reset() {
    Object.assign(this.cooldown, createTowerShifterCooldown());
  }

  isReady() { return this.runtime().cardTime >= this.cooldown.readyAt; }

  cooldownRatio() {
    const time = this.runtime().cardTime;
    const state = this.cooldown;
    return time >= state.readyAt ? 1 : Math.max(0, Math.min(1, (time - state.cooldownStartedAt) / state.cooldownDuration));
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
    const state = this.cooldown;
    if (runtime.cardTime < state.readyAt) return "cooldown";
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
    state.cooldownStartedAt = runtime.cardTime;
    state.cooldownDuration = plan.cooldownMs;
    state.readyAt = runtime.cardTime + state.cooldownDuration;
    runtime.onMoved(moves);
    return "moved";
  }
}
