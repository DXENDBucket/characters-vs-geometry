import Phaser from "phaser";
import type { Enemy } from "../types";
import { enemyFacingDirection } from "../game/rules/reversal";
import { setScaleIfChanged } from "../game/visualGuards";
import { syncChevronVisual } from "./chevronLeader";

export function syncEnemyFacingVisual(enemy: Enemy) {
  const facingScale = enemyFacingDirection(enemy) > 0 ? -1 : 1;
  const shape = enemy.shape as Phaser.GameObjects.GameObject & { list?: Phaser.GameObjects.GameObject[] };
  for (const child of shape.list ?? []) {
    if (child instanceof Phaser.GameObjects.Text || child.getData("enemyRankLabel") === true) {
      const label = child as Phaser.GameObjects.Text | Phaser.GameObjects.Image;
      const baseX = label.getData("facingBaseX") as number | undefined;
      const x = baseX ?? label.x;
      if (baseX === undefined) {
        label.setData("facingBaseX", x);
      }
      label.setX(x * facingScale);
      continue;
    }

    const scalable = child as Phaser.GameObjects.GameObject & {
      scaleX?: number;
      scaleY?: number;
      setScale?: (x: number, y?: number) => unknown;
      getData?: (key: string) => unknown;
      setData?: (key: string, value: unknown) => unknown;
    };
    if (!scalable.setScale) {
      continue;
    }

    const baseScaleX = (scalable.getData?.("facingBaseScaleX") as number | undefined) ?? scalable.scaleX ?? 1;
    const baseScaleY = (scalable.getData?.("facingBaseScaleY") as number | undefined) ?? scalable.scaleY ?? 1;
    if (scalable.getData?.("facingBaseScaleX") === undefined) {
      scalable.setData?.("facingBaseScaleX", baseScaleX);
      scalable.setData?.("facingBaseScaleY", baseScaleY);
    }
    setScaleIfChanged(scalable, baseScaleX * facingScale, baseScaleY);
  }
  syncChevronVisual(enemy);
}
