import Phaser from "phaser";
import type { CubeBoss, Tower } from "../types";
import { CELL_WIDTH, CELL_HEIGHT } from "../config";
import { bossBounds, towerBounds } from "./unitGeometry";

export * from "./towerTargeting";

export function bossRect(boss: CubeBoss) {
  const bounds = bossBounds(boss);
  return new Phaser.Geom.Rectangle(
    bounds.left,
    bounds.top,
    bounds.right - bounds.left,
    bounds.bottom - bounds.top
  );
}

export function towerRect(tower: Tower) {
  const bounds = towerBounds(tower);
  return new Phaser.Geom.Rectangle(bounds.left, bounds.top, CELL_WIDTH, CELL_HEIGHT);
}
