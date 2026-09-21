import Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES, palette } from "../config";
import type { Tower } from "../types";
import { gridCellKey } from "./targeting";
import { syncTowerFlyingVisual } from "./towers";
import { isParenthesisTower, syncTowerOccupancy, towerInPlacementLayer } from "./towerOccupancy";
import { planTowerMove, SHIFTER_BASE_COOLDOWN, type MoveTowersCommand, type TowerMove } from "./rules/towerMovement";

export type TowerShifterPointerResult = "selected" | "empty" | "invalid" | "moved" | "cooldown";

export interface TowerShifterMovePosition {
  tower: Tower;
  lane: number;
  column: number;
}

export interface TowerShifterMovePreview {
  valid: boolean;
  positions: TowerShifterMovePosition[];
}

export interface AppliedTowerMove extends TowerMove {
  tower: Tower;
}

export interface TowerShifterRuntime {
  scene: Phaser.Scene;
  towers: Tower[];
  occupied: Map<string, Tower>;
  cardTime: number;
  battleTime: number;
  isCellDeployable?: (lane: number, column: number) => boolean;
  onMoved: (moves: AppliedTowerMove[]) => void;
}

export class TowerShifterController {
  private active = false;
  private readyAt = 0;
  private cooldownStartedAt = 0;
  private cooldownDuration = SHIFTER_BASE_COOLDOWN;
  private selection: Tower[] = [];
  private readonly selectionSet = new Set<Tower>();
  private selectionMarks = new Map<Tower, Phaser.GameObjects.Graphics>();
  private readonly previewPositions: TowerShifterMovePosition[] = [];
  private readonly previewResult: TowerShifterMovePreview = { valid: false, positions: this.previewPositions };

  constructor(private readonly runtime: () => TowerShifterRuntime) {}

  snapshot() {
    return { readyAt: this.readyAt, cooldownStartedAt: this.cooldownStartedAt, cooldownDuration: this.cooldownDuration };
  }

  restore(state: ReturnType<TowerShifterController["snapshot"]>) {
    this.reset();
    this.readyAt = state.readyAt;
    this.cooldownStartedAt = state.cooldownStartedAt;
    this.cooldownDuration = state.cooldownDuration;
  }

  reset() {
    this.active = false;
    this.readyAt = 0;
    this.cooldownStartedAt = 0;
    this.cooldownDuration = SHIFTER_BASE_COOLDOWN;
    this.clearSelection();
  }

  isActive() {
    return this.active;
  }

  setActive(active: boolean) {
    this.active = active;
    if (!active) {
      this.clearSelection();
    }
  }

  deactivate() {
    this.setActive(false);
  }

  isReady() {
    return this.runtime().cardTime >= this.readyAt;
  }

  cooldownRatio() {
    const cardTime = this.runtime().cardTime;
    if (cardTime >= this.readyAt) {
      return 1;
    }

    return Phaser.Math.Clamp(
      (cardTime - this.cooldownStartedAt) / this.cooldownDuration,
      0,
      1
    );
  }

  hasSelection() {
    return this.liveSelection().length > 0;
  }

  selectedTowers() {
    return [...this.liveSelection()];
  }

  isMoveDestination(existingTower: Tower | undefined) {
    const first = this.liveSelection()[0];
    return !existingTower || !!first && isParenthesisTower(first) !== isParenthesisTower(existingTower);
  }

  handlePointer(lane: number, column: number, existingTower: Tower | undefined, additive: boolean): TowerShifterPointerResult {
    const runtime = this.runtime();
    if (runtime.cardTime < this.readyAt) {
      this.deactivate();
      return "cooldown";
    }

    if (existingTower && (additive || !this.hasSelection() || !this.isMoveDestination(existingTower))) {
      this.selectTower(existingTower, additive);
      return "selected";
    }

    if (this.liveSelection().length === 0) {
      return "empty";
    }

    return this.executeMove(this.createMoveCommand(lane, column));
  }

  createMoveCommand(lane: number, column: number): MoveTowersCommand {
    return {
      type: "moveTowers",
      sources: this.liveSelection().map((tower) => ({ towerId: tower.id, lane: tower.lane, column: tower.column })),
      destination: { lane, column }
    };
  }

  executeMove(command: MoveTowersCommand): "moved" | "invalid" | "cooldown" {
    const runtime = this.runtime();
    if (runtime.cardTime < this.readyAt) {
      this.deactivate();
      return "cooldown";
    }
    const towersById = new Map(runtime.towers.map((tower) => [tower.id, tower]));
    const plan = this.planMove(runtime, command, towersById);
    if (!plan.valid) {
      this.clearSelection();
      return "invalid";
    }

    const moves = plan.moves.map((move) => ({ ...move, tower: towersById.get(move.towerId)! }));
    this.applyMove(runtime, moves);
    this.cooldownStartedAt = runtime.cardTime;
    this.cooldownDuration = plan.cooldownMs;
    this.readyAt = runtime.cardTime + this.cooldownDuration;
    this.deactivate();
    runtime.onMoved(moves);
    return "moved";
  }

  previewMove(lane: number, column: number): TowerShifterMovePreview {
    return this.previewMoveWithRuntime(this.runtime(), lane, column);
  }

  private previewMoveWithRuntime(runtime: TowerShifterRuntime, lane: number, column: number): TowerShifterMovePreview {
    const positions = this.previewPositions;
    positions.length = 0;
    const command = this.createMoveCommand(lane, column);
    const towersById = new Map(this.liveSelection().map((tower) => [tower.id, tower]));
    const plan = this.planMove(runtime, command, towersById);
    if (!plan.valid) {
      return this.setPreviewResult(false);
    }
    for (const move of plan.moves) {
      positions.push({ tower: towersById.get(move.towerId)!, lane: move.toLane, column: move.toColumn });
    }

    return this.setPreviewResult(true);
  }

  private planMove(runtime: TowerShifterRuntime, command: MoveTowersCommand, towersById: Map<string, Tower>) {
    return planTowerMove(command, {
      lanes: LANES,
      columns: COLUMNS,
      layers: 2,
      getTower: (id) => towersById.get(id),
      occupantAt: (lane, column, movingId) => towerInPlacementLayer(runtime.occupied, lane, column, towersById.get(movingId!)!.type)?.id,
      isCellDeployable: (lane, column) => runtime.isCellDeployable?.(lane, column) ?? true
    });
  }

  syncSelectionVisuals() {
    if (this.selection.length === 0 && this.selectionMarks.size === 0) {
      return;
    }

    const runtime = this.runtime();
    const selection = this.liveSelection();
    for (const [tower, mark] of this.selectionMarks) {
      if (!this.selectionSet.has(tower)) {
        mark.destroy();
        this.selectionMarks.delete(tower);
      }
    }

    for (const tower of selection) {
      let mark = this.selectionMarks.get(tower);
      if (!mark) {
        mark = runtime.scene.add.graphics().setDepth(58);
        mark.lineStyle(2, palette.magic, 0.92);
        mark.strokeRect(-CELL_WIDTH / 2 + 7, -CELL_HEIGHT / 2 + 7, CELL_WIDTH - 14, CELL_HEIGHT - 14);
        this.selectionMarks.set(tower, mark);
      }
      mark.setPosition(tower.body.x, tower.body.y);
      mark.setAlpha(0.68 + Math.sin(runtime.battleTime / 95) * 0.18);
    }
  }

  clearSelection() {
    this.selection = [];
    this.selectionSet.clear();
    for (const mark of this.selectionMarks.values()) {
      mark.destroy();
    }
    this.selectionMarks.clear();
  }

  private selectTower(tower: Tower, additive: boolean) {
    if (!additive) {
      this.clearSelection();
      this.selection = [tower];
      this.selectionSet.add(tower);
      this.syncSelectionVisuals();
      return;
    }

    const selectedIndex = this.selection.indexOf(tower);
    if (selectedIndex >= 0) {
      this.selection.splice(selectedIndex, 1);
      this.selectionSet.delete(tower);
    } else {
      this.selection.push(tower);
      this.selectionSet.add(tower);
    }
    this.syncSelectionVisuals();
  }

  private applyMove(runtime: TowerShifterRuntime, positions: AppliedTowerMove[]) {
    for (const { tower } of positions) {
      runtime.occupied.delete(gridCellKey(tower.lane, tower.column));
    }

    for (const { tower, toLane: lane, toColumn: column } of positions) {
      tower.moveVisual = undefined;
      tower.lane = lane;
      tower.column = column;
      tower.x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
      tower.y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      tower.body.setDepth(20 + lane);
      syncTowerFlyingVisual(tower, runtime.battleTime);
      runtime.occupied.set(gridCellKey(lane, column), tower);
    }
    syncTowerOccupancy(runtime.towers, runtime.occupied);
  }

  private liveSelection() {
    let writeIndex = 0;
    let removedDeadTower = false;
    for (let readIndex = 0; readIndex < this.selection.length; readIndex += 1) {
      const tower = this.selection[readIndex];
      if (tower.inPlay) {
        this.selection[writeIndex] = tower;
        writeIndex += 1;
      } else {
        removedDeadTower = true;
      }
    }
    this.selection.length = writeIndex;
    if (removedDeadTower || this.selectionSet.size !== writeIndex) {
      this.rebuildSelectionSet();
    }
    return this.selection;
  }

  private rebuildSelectionSet() {
    this.selectionSet.clear();
    for (const tower of this.selection) {
      this.selectionSet.add(tower);
    }
  }

  private setPreviewResult(valid: boolean) {
    this.previewResult.valid = valid;
    return this.previewResult;
  }

}
