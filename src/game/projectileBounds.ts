import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y } from "../config";
import type { EnemyProjectileState, ProjectileState } from "./projectileState";

export function isTowerProjectileOutOfBounds(projectile: ProjectileState, reachedLimitX: boolean) {
  return reachedLimitX || projectile.x < BOARD_X - 60 || projectile.x > BOARD_X + BOARD_WIDTH + 52 ||
    projectile.y < BOARD_Y - 60 || projectile.y > BOARD_Y + BOARD_HEIGHT + 60;
}

export function isEnemyProjectileOutOfBounds(projectile: EnemyProjectileState) {
  return projectile.x < BOARD_X - 60 || projectile.x > BOARD_X + BOARD_WIDTH + 60;
}
