import type Phaser from "phaser";
import type { Enemy } from "../types";

const LINK_STROKES = [[12, 0.04], [9, 0.07], [6, 0.13], [3, 0.26], [1.5, 0.8]] as const;

export function drawEnemyHealthLinks(graphics: Phaser.GameObjects.Graphics, enemies: readonly Enemy[], time: number) {
  graphics.clear();
  const pulse = 0.7 + 0.3 * Math.sin(time * Math.PI / 1400);
  for (const owner of enemies) {
    const pool = owner.healthPool;
    if (!owner.inPlay || !pool || pool.owner !== owner) continue;
    for (const target of pool.members) {
      if (target === owner || !target.inPlay) continue;
      // Layered strokes fade across the line's width, with a solid green core.
      for (const [width, alpha] of LINK_STROKES) {
        graphics.lineStyle(width, 0x75ee9b, alpha * pulse);
        graphics.lineBetween(owner.body.x, owner.body.y, target.body.x, target.body.y);
      }
    }
  }
}
