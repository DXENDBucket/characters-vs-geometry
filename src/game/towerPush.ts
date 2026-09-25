import Phaser from "phaser";
import { parenthesisInner, syncTowerOccupancy } from "./towerOccupancy";
import { logicalTowerCell, physicalTowerCell, towerCell } from "./towerTopology";
import type { TowerActionListener } from "./towerActions";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES, palette } from "../config";
import type { Tower } from "../types";
import { gridCellKey } from "./targeting";
import { getTowerSkillState } from "./skillState";
import { spendTowerSkill } from "./towerSkillRules";
import { PUSH_DURATION, pushIsReady } from "./pushSkill";
import { planTowerPush } from "./rules/towerPush";
import type { TowerShifterRuntime } from "./towerShifter";
import { syncTowerFlyingVisual } from "./towers";

interface PushRuntime extends TowerShifterRuntime {
  onTowerAction?: TowerActionListener;
  eraseTower: (tower: Tower) => void;
}

export class TowerPushController {
  private source?: Tower;
  private marks?: Phaser.GameObjects.Graphics;
  private exits: Array<{ body: Phaser.GameObjects.Container; fromX: number; fromY: number; x: number; y: number; at: number }> = [];

  constructor(private readonly scene: Phaser.Scene, private readonly runtime: () => PushRuntime) {}

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
    for (const exit of this.exits) exit.body.destroy();
    this.exits = [];
  }

  update(time: number) {
    if (this.source) {
      if (!pushIsReady(this.source) || this.source.moveVisual) this.cancel();
      else this.drawSelection();
    }
    if (this.exits.length === 0) return;
    this.exits = this.exits.filter(exit => {
      if (!exit.body.scene) return false;
      const progress = Phaser.Math.Clamp((time - exit.at) / PUSH_DURATION, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      exit.body.setPosition(exit.fromX + (exit.x - exit.fromX) * eased, exit.fromY + (exit.y - exit.fromY) * eased);
      exit.body.setAlpha(1 - progress * progress);
      if (progress >= 1) { exit.body.destroy(); return false; }
      return true;
    });
  }

  plan(source: Tower, lane: number, column: number) {
    if (!source.inPlay || source.nullified || source.moveVisual) return null;
    const runtime = this.runtime();
    const byId = new Map(runtime.towers.map(tower => [tower.id, tower]));
    const origin = towerCell(source), target = logicalTowerCell(source, { lane, column });
    const logicalTowers = new Map(runtime.towers.map(tower => [tower.id, { ...tower, ...towerCell(tower) }]));
    const plan = planTowerPush({ ...source, ...origin }, target, {
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
      const companion = move.tower.parenthesisGuard ?? parenthesisInner(move.tower);
      if (companion && !moves.some(item => item.tower === companion)) moves.push({ ...move, towerId: companion.id, tower: companion });
    }
    if (moves.some(move => !move.tower.inPlay || move.tower.nullified || move.tower.moveVisual)) return null;
    return { moves, origin, target };
  }

  push(source: Tower, lane: number, column: number, free = false) {
    if (!source.inPlay || source.nullified || source.moveVisual || (!free && (!source.skills.push || !pushIsReady(source)))) return false;
    const plan = this.plan(source, lane, column);
    if (!plan) return false;
    const { moves, origin, target } = plan, runtime = this.runtime();
    if (!free) spendTowerSkill("#", getTowerSkillState(source, "push"));
    if (!free && runtime.onTowerAction?.(source, { kind: "skill", laneOffset: target.lane - origin.lane, columnOffset: target.column - origin.column })) return true;
    source.border.setAlpha(1);
    // Commit all cells before any removal callback can rebuild mirror/health networks.
    for (const move of moves) runtime.occupied.delete(gridCellKey(move.fromLane, move.fromColumn));
    for (const move of moves) {
      const tower = move.tower;
      tower.moveVisual = { fromX: tower.x, fromY: tower.y, startedAt: runtime.battleTime, duration: PUSH_DURATION };
      tower.lane = move.toLane;
      tower.column = move.toColumn;
      tower.x = BOARD_X + (tower.column + 0.5) * CELL_WIDTH;
      tower.y = BOARD_Y + (tower.lane + 0.5) * CELL_HEIGHT;
      tower.body.setDepth(20 + Phaser.Math.Clamp(tower.lane, 0, LANES - 1));
      if (!move.erased) runtime.occupied.set(gridCellKey(tower.lane, tower.column), tower);
    }
    for (const move of moves) {
      if (!move.erased) continue;
      const tower = move.tower;
      const { fromX, fromY } = tower.moveVisual!;
      runtime.eraseTower(tower);
      if (tower.body.scene) {
        this.scene.tweens.killTweensOf(tower.body);
        this.exits.push({ body: tower.body, fromX, fromY, x: tower.x, y: tower.y, at: runtime.battleTime });
      }
    }
    syncTowerOccupancy(runtime.towers, runtime.occupied);
    runtime.onMoved(moves);
    for (const { tower } of moves) if (tower.inPlay) syncTowerFlyingVisual(tower, runtime.battleTime);
    return true;
  }

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
