import type Phaser from "phaser";
import { palette } from "../config";
import type { CubeBoss, PendingBossCopy } from "../types";

interface WarningVisual {
  frame: Phaser.GameObjects.Graphics;
  countdown: Phaser.GameObjects.Text;
}

const visuals = new WeakMap<CubeBoss, Map<PendingBossCopy, WarningVisual>>();

export function clearBossCopyWarnings(boss: CubeBoss) {
  for (const visual of visuals.get(boss)?.values() ?? []) {
    visual.frame.destroy();
    visual.countdown.destroy();
  }
  visuals.delete(boss);
}

export function syncBossCopyWarnings(boss: CubeBoss, time: number) {
  const pending = boss.pendingCopies ?? [];
  if (!pending.length) {
    clearBossCopyWarnings(boss);
    return;
  }
  let entries = visuals.get(boss);
  if (!entries) { entries = new Map(); visuals.set(boss, entries); }
  for (const [spawn, visual] of entries) {
    if (pending.includes(spawn)) continue;
    visual.frame.destroy(); visual.countdown.destroy(); entries.delete(spawn);
  }
  for (const spawn of pending) {
    let visual = entries.get(spawn);
    if (!visual) {
      const scene = boss.body.scene;
      const frame = scene.add.graphics().setName("boss-copy-warning");
      const countdown = scene.add.text(0, 0, "", {
        fontFamily: "monospace", fontSize: "26px", fontStyle: "700", color: `#${palette.enemyShot.toString(16)}`
      }).setOrigin(0.5).setName("boss-copy-countdown");
      boss.body.add([frame, countdown]);
      visual = { frame, countdown }; entries.set(spawn, visual);
    }
    // Attach to the boss for cleanup, but keep the telegraph fixed at its world-space destination.
    const x = spawn.x - boss.x, y = spawn.y - boss.y;
    const w = boss.hitboxWidth, h = boss.hitboxHeight;
    const pulse = 0.6 + 0.3 * Math.sin((time - spawn.startedAt) / 160);
    const progress = Math.max(0, Math.min(1, (time - spawn.startedAt) / (spawn.readyAt - spawn.startedAt)));
    visual.frame.setPosition(x, y).clear();
    visual.frame.fillStyle(palette.enemyShot, 0.06 + pulse * 0.06).fillRect(-w / 2, -h / 2, w, h);
    visual.frame.lineStyle(3, palette.enemyShot, pulse).strokeRect(-w / 2, -h / 2, w, h);
    visual.frame.fillStyle(palette.enemyShot, 0.9).fillRect(-w / 2, h / 2 - 5, w * progress, 5);
    visual.countdown.setPosition(x, y).setText(String(Math.max(1, Math.ceil((spawn.readyAt - time) / 1000))));
  }
}
