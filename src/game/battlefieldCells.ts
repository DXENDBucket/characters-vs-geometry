import { LANES } from "../config";
import { gridCellKey } from "./boardCells";
import type { TowerState } from "./towerState";
import type { TimedCellSeals } from "./timedCellSeals";

export interface BattlefieldCellPresentation {
  erase(tower: TowerState): void;
  permanentSeal(lane: number, column: number): void;
  timedSeals(): void;
  changed(): void;
}
export const NO_BATTLEFIELD_CELL_PRESENTATION: BattlefieldCellPresentation = Object.freeze({
  erase() {}, permanentSeal() {}, timedSeals() {}, changed() {}
});
export interface BattlefieldCellRuntime<T extends TowerState = TowerState> {
  world: { towers: T[]; sealedCells: Set<string>; timedCellSeals: TimedCellSeals; battleTime: number };
  removeTower(tower: T): void;
  updateLevelAuras(): void;
}

export class BattlefieldCells<T extends TowerState = TowerState> {
  constructor(private readonly runtime: BattlefieldCellRuntime<T>,
    public presentation: BattlefieldCellPresentation = NO_BATTLEFIELD_CELL_PRESENTATION) {}

  eraseCell(lane: number, column: number) {
    let removed = false;
    for (const tower of this.runtime.world.towers.filter(tower => tower.lane === lane && tower.column === column)) {
      if (!tower.inPlay) continue;
      this.presentation.erase(tower);
      this.runtime.removeTower(tower);
      removed = true;
    }
    return removed;
  }

  sealColumn(column: number) {
    let removed = false;
    for (let lane = 0; lane < LANES; lane++) {
      removed = this.eraseCell(lane, column) || removed;
      this.sealCell(lane, column);
    }
    if (removed) this.runtime.updateLevelAuras();
    this.presentation.changed();
  }

  sealCell(lane: number, column: number) {
    const key = gridCellKey(lane, column), { sealedCells } = this.runtime.world;
    if (sealedCells.has(key)) return;
    sealedCells.add(key);
    this.presentation.permanentSeal(lane, column);
  }

  sealTimedCell(lane: number, column: number, durationMs: number) {
    const { timedCellSeals, battleTime } = this.runtime.world;
    timedCellSeals.seal(lane, column, battleTime, durationMs, (row, col) => {
      if (this.eraseCell(row, col)) this.runtime.updateLevelAuras();
    });
    this.presentation.timedSeals();
    this.presentation.changed();
  }

  warnCell(lane: number, column: number, warningMs: number, durationMs: number, leadInMs: number) {
    const { timedCellSeals, battleTime } = this.runtime.world;
    timedCellSeals.warn(lane, column, battleTime, warningMs, durationMs, leadInMs);
    this.presentation.timedSeals();
  }
}
