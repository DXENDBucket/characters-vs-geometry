import type Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } from "../config";
import type { Tower } from "../types";
import { syncTowerTopology, validTowerCell } from "./towerTopology";

interface TopologyRuntime { towers: Tower[]; battleTime: number; onChanged: () => void }
export class TowerTopologyController {
  private source?: Tower;
  private marks?: Phaser.GameObjects.Graphics;
  private visualKey = "";
  constructor(private scene: Phaser.Scene, private runtime: () => TopologyRuntime) {}
  isTargeting() { return !!this.source?.inPlay; }
  selectedSource() { return this.source; }
  begin(tower: Tower) {
    if (!tower.inPlay || tower.type !== "&" || tower.topologyTarget) return false;
    this.source = tower; this.update(); return true;
  }
  cancel() { this.source = undefined; this.update(); }
  connect(tower: Tower, lane: number, column: number) {
    const target = { lane, column };
    if (!tower.inPlay || tower.transient || tower.nullified || tower.type !== "&" || tower.topologyTarget ||
        !validTowerCell(target) || (tower.lane === lane && tower.column === column)) return false;
    tower.topologyTarget = target;
    tower.topologyOrder = this.runtime().battleTime;
    syncTowerTopology(this.runtime().towers);
    this.runtime().onChanged(); this.update(); return true;
  }
  update() {
    if (!this.source?.inPlay) this.source = undefined;
    const towers = this.runtime().towers.filter(t => t.inPlay && t.type === "&");
    const key = `${this.source?.id ?? ""}|${towers.map(t => `${t.id}:${t.lane}:${t.column}:${t.topologyTarget?.lane}:${t.topologyTarget?.column}`).join("|")}`;
    if (key === this.visualKey) return;
    this.visualKey = key;
    this.marks ??= this.scene.add.graphics().setDepth(19);
    this.marks.clear();
    const rect = (lane: number, column: number, color: number, width: number) => {
      this.marks!.lineStyle(width, color, 0.85).strokeRect(BOARD_X + column * CELL_WIDTH + 3,
        BOARD_Y + lane * CELL_HEIGHT + 3, CELL_WIDTH - 6, CELL_HEIGHT - 6);
    };
    for (const tower of towers) {
      if (tower.topologyTarget) {
        rect(tower.lane, tower.column, 0x83dbe8, 1);
        rect(tower.topologyTarget.lane, tower.topologyTarget.column, 0x83dbe8, 2);
      } else if (tower === this.source) rect(tower.lane, tower.column, 0xffdb69, 3);
    }
  }
  destroy() { this.marks?.destroy(); this.marks = undefined; this.source = undefined; }
}
