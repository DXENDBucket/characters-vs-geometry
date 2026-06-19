import Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES, palette } from "../config";
import type { Tower } from "../types";
import { gridCellKey } from "./targeting";
import { syncTowerFlyingVisual } from "./towers";

const SHIFTER_BASE_COOLDOWN = 15_000;
const SHIFTER_EXTRA_COOLDOWN_MULTIPLIER = 1.2;

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

export interface TowerShifterRuntime {
  scene: Phaser.Scene;
  towers: Tower[];
  occupied: Map<string, Tower>;
  cardTime: number;
  battleTime: number;
  isCellDeployable?: (lane: number, column: number) => boolean;
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

  handlePointer(lane: number, column: number, existingTower: Tower | undefined, additive: boolean): TowerShifterPointerResult {
    const runtime = this.runtime();
    if (runtime.cardTime < this.readyAt) {
      this.deactivate();
      return "cooldown";
    }

    if (existingTower) {
      this.selectTower(existingTower, additive);
      return "selected";
    }

    if (this.selection.length === 0) {
      return "empty";
    }

    const move = this.previewMoveWithRuntime(runtime, lane, column);
    if (!move.valid) {
      this.clearSelection();
      return "invalid";
    }

    this.applyMove(runtime, move.positions);
    this.cooldownStartedAt = runtime.cardTime;
    this.cooldownDuration = shifterCooldownForCount(move.positions.length);
    this.readyAt = runtime.cardTime + this.cooldownDuration;
    this.deactivate();
    return "moved";
  }

  previewMove(lane: number, column: number): TowerShifterMovePreview {
    return this.previewMoveWithRuntime(this.runtime(), lane, column);
  }

  private previewMoveWithRuntime(runtime: TowerShifterRuntime, lane: number, column: number): TowerShifterMovePreview {
    const selection = this.liveSelection();
    const positions = this.previewPositions;
    positions.length = 0;
    if (selection.length === 0) {
      return this.setPreviewResult(false);
    }

    let anchor = selection[0];
    for (let index = 1; index < selection.length; index += 1) {
      const tower = selection[index];
      if (tower.lane < anchor.lane || (tower.lane === anchor.lane && tower.column < anchor.column)) {
        anchor = tower;
      }
    }

    for (const tower of selection) {
      positions.push({
        tower,
        lane: lane + tower.lane - anchor.lane,
        column: column + tower.column - anchor.column
      });
    }

    for (const position of positions) {
      if (position.lane < 0 || position.lane >= LANES || position.column < 0 || position.column >= COLUMNS) {
        return this.setPreviewResult(false);
      }
      if (!this.isCellDeployable(runtime, position.lane, position.column)) {
        return this.setPreviewResult(false);
      }

      const key = gridCellKey(position.lane, position.column);
      const occupant = runtime.occupied.get(key);
      if (occupant && !this.selectionSet.has(occupant)) {
        return this.setPreviewResult(false);
      }
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

  private applyMove(runtime: TowerShifterRuntime, positions: TowerShifterMovePosition[]) {
    for (const { tower } of positions) {
      runtime.occupied.delete(gridCellKey(tower.lane, tower.column));
    }

    for (const { tower, lane, column } of positions) {
      tower.lane = lane;
      tower.column = column;
      tower.x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
      tower.y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      tower.body.setDepth(20 + lane);
      syncTowerFlyingVisual(tower, runtime.battleTime);
      runtime.occupied.set(gridCellKey(lane, column), tower);
    }
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

  private isCellDeployable(runtime: TowerShifterRuntime, lane: number, column: number) {
    return runtime.isCellDeployable?.(lane, column) ?? true;
  }
}

function shifterCooldownForCount(count: number) {
  return SHIFTER_BASE_COOLDOWN * SHIFTER_EXTRA_COOLDOWN_MULTIPLIER ** Math.max(0, count - 1);
}
