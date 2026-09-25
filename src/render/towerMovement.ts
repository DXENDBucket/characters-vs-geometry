import Phaser from "phaser";
import { LANES } from "../config";
import type { Tower } from "../types";
import type { ShifterPresentation } from "../game/towerShifterRules";
import type { PushPresentation } from "../game/towerPushRules";
import type { TowerState } from "../game/towerState";
import { PUSH_DURATION } from "../game/pushSkillRules";
import { syncTowerFlyingVisual } from "../game/towers";

export const shifterPresentation: ShifterPresentation = {
  position(state, time) {
    const tower = state as Tower;
    tower.body.setDepth(20 + tower.lane);
    syncTowerFlyingVisual(tower, time);
  }
};

export class TowerPushPresentation implements PushPresentation {
  private exits: Array<{ body: Phaser.GameObjects.Container; fromX: number; fromY: number; x: number; y: number; at: number }> = [];

  constructor(private readonly scene: Phaser.Scene) {}
  started(tower: TowerState) { (tower as Tower).border.setAlpha(1); }
  position(tower: TowerState) { (tower as Tower).body.setDepth(20 + Phaser.Math.Clamp(tower.lane, 0, LANES - 1)); }
  settled(tower: TowerState, time: number) { syncTowerFlyingVisual(tower as Tower, time); }

  erased(state: TowerState, fromX: number, fromY: number, time: number) {
    const tower = state as Tower;
    if (!tower.body.scene) return;
    this.scene.tweens.killTweensOf(tower.body);
    this.exits.push({ body: tower.body, fromX, fromY, x: tower.x, y: tower.y, at: time });
  }

  update(time: number) {
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

  destroy() {
    for (const exit of this.exits) exit.body.destroy();
    this.exits = [];
  }
}
