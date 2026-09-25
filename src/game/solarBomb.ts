import { palette } from "../config";
import { enemyMaximumHp } from "./enemyContainerRules";
import { syncSolarBombShape } from "../render/unitShapes";
import type { Enemy } from "../types";
import { enemyIsSolarBomb, solarBombIsDepleted, SOLAR_BOMB_ROTATION_SPEED, depleteSolarBomb as deplete } from "./solarBombRules";
export * from "./solarBombRules";
type RotatableShape = { rotation: number };
export function depleteSolarBomb(enemy: Enemy) { deplete(enemy); syncSolarBombVisual(enemy); }

export function rotateSolarBombVisual(enemy: Enemy, seconds: number) {
  if (!enemyIsSolarBomb(enemy)) {
    return;
  }

  (enemy.shape as unknown as RotatableShape).rotation += SOLAR_BOMB_ROTATION_SPEED * seconds;
}

export function syncSolarBombVisual(enemy: Enemy) {
  if (!enemyIsSolarBomb(enemy)) {
    return;
  }

  const color = solarBombIsDepleted(enemy)
    ? palette.gold
    : enemy.hp < enemyMaximumHp(enemy) * 0.5
      ? palette.magic
      : palette.white;
  syncSolarBombShape(enemy.shape, color);
  enemy.shape.setScale(1);
}
