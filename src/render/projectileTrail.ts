import type Phaser from "phaser";

const SAMPLE_COUNT = 16;
const SAMPLE_INTERVAL = 16;
const TRAIL_DURATION = 220;
interface Trail {
  graphics: Phaser.GameObjects.Graphics;
  color: number;
  xs: Float64Array;
  ys: Float64Array;
  times: Float64Array;
  count: number;
  next: number;
  lastTime: number;
  cleanup: () => void;
}
const trails = new WeakMap<Phaser.GameObjects.GameObject, Trail>();

export function attachProjectileTrail(scene: Phaser.Scene, body: Phaser.GameObjects.GameObject, color: number, depth: number) {
  removeProjectileTrail(body);
  const cleanup = () => removeProjectileTrail(body);
  trails.set(body, {
    graphics: scene.add.graphics().setDepth(depth).setName("projectile-trail"), color,
    xs: new Float64Array(SAMPLE_COUNT), ys: new Float64Array(SAMPLE_COUNT), times: new Float64Array(SAMPLE_COUNT),
    count: 0, next: 0, lastTime: -Infinity, cleanup
  });
  body.once("destroy", cleanup);
}

export function removeProjectileTrail(body: Phaser.GameObjects.GameObject) {
  const trail = trails.get(body);
  if (!trail) return;
  trails.delete(body);
  body.off("destroy", trail.cleanup);
  trail.graphics.destroy();
}

// A fixed ring buffer bounds work and memory per projectile, independent of flight duration.
export function updateProjectileTrail(body: Phaser.GameObjects.GameObject, x: number, y: number, time: number) {
  const trail = trails.get(body);
  if (!trail) return;
  if (time < trail.lastTime) { trail.count = 0; trail.lastTime = -Infinity; }
  if (time - trail.lastTime >= SAMPLE_INTERVAL) {
    const index = trail.next;
    trail.xs[index] = x; trail.ys[index] = y; trail.times[index] = time;
    trail.next = (index + 1) % SAMPLE_COUNT;
    trail.count = Math.min(SAMPLE_COUNT, trail.count + 1);
    trail.lastTime = time;
  }
  const graphics = trail.graphics.clear();
  let previousX = x, previousY = y;
  for (let age = 0; age < trail.count; age++) {
    const index = (trail.next - 1 - age + SAMPLE_COUNT) % SAMPLE_COUNT;
    const strength = 1 - (time - trail.times[index]) / TRAIL_DURATION;
    if (strength <= 0) break;
    graphics.lineStyle(1 + 4 * strength, trail.color, 0.65 * strength * strength);
    graphics.lineBetween(previousX, previousY, trail.xs[index], trail.ys[index]);
    previousX = trail.xs[index]; previousY = trail.ys[index];
  }
}
