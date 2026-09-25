import Phaser from "phaser";
import type { Tower } from "../types";
import { isParenthesisTower } from "./towerOccupancy";
import type { MoveTowersCommand } from "./rules/towerMovement";
import { TowerShifterSimulation, type AppliedTowerMove as DataTowerMove, type TowerShifterRuntime as SimulationRuntime } from "./towerShifterRules";
import { shifterPresentation } from "../render/towerMovement";
import { drawTowerSelection } from "../render/boardToolPreview";

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

export type AppliedTowerMove = DataTowerMove<Tower>;

export interface TowerShifterRuntime extends SimulationRuntime<Tower> { scene: Phaser.Scene }

export class TowerShifterController {
  private active = false;
  readonly simulation: TowerShifterSimulation<Tower>;
  private selection: Tower[] = [];
  private readonly selectionSet = new Set<Tower>();
  private selectionMarks = new Map<Tower, Phaser.GameObjects.Graphics>();
  private readonly previewPositions: TowerShifterMovePosition[] = [];
  private readonly previewResult: TowerShifterMovePreview = { valid: false, positions: this.previewPositions };

  constructor(private readonly runtime: () => TowerShifterRuntime, simulation?: TowerShifterSimulation<Tower>) {
    this.simulation = simulation ?? new TowerShifterSimulation(runtime);
    this.simulation.presentation = shifterPresentation;
  }

  snapshot() { return this.simulation.snapshot(); }
  restore(state: ReturnType<TowerShifterController["snapshot"]>) {
    this.reset();
    this.simulation.restore(state);
  }

  reset() {
    this.active = false;
    this.simulation.reset();
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

  isReady() { return this.simulation.isReady(); }
  cooldownRatio() { return this.simulation.cooldownRatio(); }

  hasSelection() {
    return this.liveSelection().length > 0;
  }

  selectedTowers() {
    return [...this.liveSelection()];
  }

  isSelected(tower: Tower) { return this.selectionSet.has(tower); }

  pointerAction(lane: number, column: number, existingTower: Tower | undefined, additive: boolean, explicitSelection = false) {
    if (!this.isReady()) return "cooldown";
    // Match the movement planner's top-left anchor, independent of Ctrl selection order.
    // Prefer the inner layer when both layers occupy that anchor cell.
    let anchor: Tower | undefined;
    for (const tower of this.liveSelection()) {
      if (!anchor || tower.lane < anchor.lane || tower.lane === anchor.lane && (tower.column < anchor.column ||
        tower.column === anchor.column && isParenthesisTower(anchor) && !isParenthesisTower(tower))) anchor = tower;
    }
    if (existingTower && (additive || explicitSelection || !anchor ||
      lane === anchor.lane && column === anchor.column || isParenthesisTower(anchor) === isParenthesisTower(existingTower))) return "select";
    return anchor ? "move" : "empty";
  }

  handlePointer(lane: number, column: number, existingTower: Tower | undefined, additive: boolean, explicitSelection = false): TowerShifterPointerResult {
    const action = this.pointerAction(lane, column, existingTower, additive, explicitSelection);
    if (action === "cooldown") {
      this.deactivate();
      return "cooldown";
    }

    if (action === "select" && existingTower) {
      this.selectTower(existingTower, additive);
      return "selected";
    }

    if (action === "empty") {
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

  executeMove(command: MoveTowersCommand, updateSelection = true): "moved" | "invalid" | "cooldown" {
    const result = this.simulation.executeMove(command);
    if (updateSelection) {
      if (result === "invalid") this.clearSelection();
      else this.deactivate();
    }
    return result;
  }

  previewMove(lane: number, column: number): TowerShifterMovePreview {
    return this.previewMoveSelection(lane, column);
  }

  private previewMoveSelection(lane: number, column: number): TowerShifterMovePreview {
    const positions = this.previewPositions;
    positions.length = 0;
    const command = this.createMoveCommand(lane, column);
    const towersById = new Map(this.liveSelection().map((tower) => [tower.id, tower]));
    const plan = this.simulation.plan(command, towersById);
    if (!plan.valid) {
      return this.setPreviewResult(false);
    }
    for (const move of plan.moves) {
      positions.push({ tower: towersById.get(move.towerId)!, lane: move.toLane, column: move.toColumn });
    }

    return this.setPreviewResult(true);
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
        drawTowerSelection(mark, tower.type);
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
