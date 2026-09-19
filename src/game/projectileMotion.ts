import type { Enemy, Projectile } from "../types";

// Relative movement reduces two moving points to a segment against a circle.
export function segmentCircleHitTime(x: number, y: number, endX: number, endY: number, radius: number) {
  if (Math.min(x, endX) > radius || Math.max(x, endX) < -radius ||
      Math.min(y, endY) > radius || Math.max(y, endY) < -radius) return Infinity;
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const dx = endX - x, dy = endY - y;
  const a = dx * dx + dy * dy;
  const b = x * dx + y * dy;
  if (a === 0 || b >= 0) return Infinity;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return Infinity;
  const t = c / (-b + Math.sqrt(discriminant));
  return t <= 1 ? t : Infinity;
}

interface Movement {
  frame: number;
  x: number;
  y: number;
  endX: number;
  endY: number;
}

export class ProjectileMotionFrame {
  private frame = 0;
  private active = false;
  private readonly movements = new WeakMap<Enemy, Movement>();
  private readonly projectiles = new WeakMap<Projectile, number>();
  private readonly exits: Array<{ enemy: Enemy; action: () => boolean | void }> = [];

  begin(projectiles: Projectile[]) {
    this.frame += 1;
    this.active = projectiles.length > 0;
    this.exits.length = 0;
    for (const projectile of projectiles) this.projectiles.set(projectile, this.frame);
  }

  record(enemy: Enemy, x: number, y: number, endX: number, endY: number) {
    if (!this.active || (x === endX && y === endY)) return;
    let movement = this.movements.get(enemy);
    if (!movement) {
      movement = { frame: 0, x: 0, y: 0, endX: 0, endY: 0 };
      this.movements.set(enemy, movement);
    }
    movement.frame = this.frame;
    movement.x = x;
    movement.y = y;
    movement.endX = endX;
    movement.endY = endY;
  }

  hitTime(enemy: Enemy, projectile: Projectile, x: number, y: number, radius: number) {
    const movement = this.movements.get(enemy);
    // Newly fired shots cannot hit the enemy's past; teleports invalidate its recorded path.
    const swept = this.active && this.projectiles.get(projectile) === this.frame &&
      movement?.frame === this.frame && enemy.x === movement.endX && enemy.y === movement.endY;
    return segmentCircleHitTime(
      x - (swept ? movement.x : enemy.x), y - (swept ? movement.y : enemy.y),
      projectile.x - enemy.x, projectile.y - enemy.y, radius
    );
  }

  deferExit(enemy: Enemy, action: () => boolean | void) {
    if (!this.active) return action();
    this.exits.push({ enemy, action });
    return false;
  }

  finish() {
    this.active = false;
    // Shots crossed before the exit get a chance to kill the enemy before it damages the base.
    for (const { enemy, action } of this.exits) {
      if (enemy.inPlay && action()) break;
    }
    this.exits.length = 0;
  }
}
