import Phaser from "phaser";
import { physicalTowerCell, towerCell } from "./towerTopology";
import type { TowerActionListener } from "./towerActions";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, palette } from "../config";
import type { Tower } from "../types";
import { gridCellKey } from "./targeting";
import { pushIsReady } from "./pushSkillRules";
import { TowerPushSimulation, type TowerPushRuntime } from "./towerPushRules";
import type { TowerActionEvent } from "./towerActions";
import { TowerPushPresentation } from "../render/towerMovement";
import type { TowerShifterRuntime } from "./towerShifter";

interface PushRuntime extends TowerShifterRuntime {
  onTowerAction?: TowerActionListener;
  eraseTower: (tower: Tower) => void;
}

export class TowerPushController {
  private source?: Tower;
  private marks?: Phaser.GameObjects.Graphics;
  readonly simulation: TowerPushSimulation<Tower>;
  private readonly presentation: TowerPushPresentation;

  constructor(private readonly scene: Phaser.Scene, private readonly runtime: () => PushRuntime) {
    this.presentation = new TowerPushPresentation(scene);
    const rules: TowerPushRuntime<Tower> = {
      get towers() { return runtime().towers; }, get occupied() { return runtime().occupied; },
      get battleTime() { return runtime().battleTime; }, get isCellDeployable() { return runtime().isCellDeployable; },
      onMoved: moves => runtime().onMoved(moves), eraseTower: tower => runtime().eraseTower(tower),
      onTowerAction: (tower, event) => runtime().onTowerAction?.(tower, event as TowerActionEvent)
    };
    this.simulation = new TowerPushSimulation(() => rules, this.presentation);
  }

  isTargeting() { return Boolean(this.source); }
  selectedSource() { return this.source; }

  begin(tower: Tower) {
    if (!pushIsReady(tower) || tower.moveVisual) return false;
    this.source = tower;
    this.marks ??= this.scene.add.graphics().setDepth(59);
    this.drawSelection();
    return true;
  }

  cancel() {
    this.source = undefined;
    this.marks?.clear();
  }

  destroy() {
    this.cancel();
    this.marks?.destroy();
    this.presentation.destroy();
  }

  update(time: number) {
    if (this.source) {
      if (!pushIsReady(this.source) || this.source.moveVisual) this.cancel();
      else this.drawSelection();
    }
    this.presentation.update(time);
  }

  plan(source: Tower, lane: number, column: number) { return this.simulation.plan(source, lane, column); }
  push(source: Tower, lane: number, column: number, free = false) { return this.simulation.push(source, lane, column, free); }

  private drawSelection() {
    const source = this.source;
    if (!source || !this.marks) return;
    const runtime = this.runtime();
    this.marks.clear().lineStyle(3, palette.green, 0.95);
    const origin = towerCell(source);
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const { lane, column } = physicalTowerCell(source, { lane: origin.lane + dy, column: origin.column + dx });
      if (!runtime.occupied.get(gridCellKey(lane, column))?.inPlay) continue;
      this.marks.strokeRect(BOARD_X + column * CELL_WIDTH + 4, BOARD_Y + lane * CELL_HEIGHT + 4, CELL_WIDTH - 8, CELL_HEIGHT - 8);
    }
    this.marks.lineStyle(2, palette.white, 1).strokeCircle(source.x, source.y, 32);
  }
}
