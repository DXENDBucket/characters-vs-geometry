import type Phaser from "phaser";
import { BOARD_X, BOARD_Y, BOARD_WIDTH, CELL_HEIGHT, LANES, palette } from "../config";
import { DEL_SWEEP, delLaneSweepConfig } from "../data/delBoss";
import type { CubeBoss } from "../types";

const warnings = new WeakMap<CubeBoss, Phaser.GameObjects.Graphics>();

export function syncDelSweepWarning(boss: CubeBoss, time: number) {
  const laneSweep = boss.delLaneSweep?.phase === "warning";
  const config = delLaneSweepConfig(boss.delLaneSweep?.stage);
  const state = laneSweep ? boss.delLaneSweep : boss.delSweep;
  const warningMs = laneSweep ? config.warningMs : DEL_SWEEP.warningMs;
  if (state?.phase !== "warning" || time >= state.startedAt + warningMs) {
    warnings.get(boss)?.destroy(); warnings.delete(boss); return;
  }
  let graphic = warnings.get(boss);
  if (!graphic) {
    graphic = boss.body.scene.add.graphics().setName("del-sweep-warning");
    boss.body.addAt(graphic, 0); warnings.set(boss, graphic);
  }
  graphic.clear().setPosition(BOARD_X - boss.x, BOARD_Y - boss.y);
  const progress = Math.max(0, Math.min(1, (time - state.startedAt) / warningMs));
  const pulse = .6 + .3 * Math.sin((time - state.startedAt) / 110);
  const center = Math.floor(((boss.delSweep?.homeY ?? boss.y) - BOARD_Y) / CELL_HEIGHT);
  const lanes = laneSweep ? config.lanes : [center - 1, center, center + 1].filter(lane => lane >= 0 && lane < LANES);
  drawLaneWarnings(graphic, lanes, progress, pulse);
}

const environmentalWarnings = new WeakMap<Phaser.Scene, Phaser.GameObjects.Graphics>();

export function syncEnvironmentalDelWarning(scene: Phaser.Scene, lanes: readonly number[], progress: number, elapsed: number) {
  let graphic = environmentalWarnings.get(scene);
  if (!lanes.length) { graphic?.destroy(); environmentalWarnings.delete(scene); return; }
  if (!graphic || !graphic.scene) {
    graphic = scene.add.graphics().setName("del-environment-warning").setDepth(85).setPosition(BOARD_X, BOARD_Y);
    environmentalWarnings.set(scene, graphic);
  }
  graphic.clear();
  drawLaneWarnings(graphic, lanes, progress, .6 + .3 * Math.sin(elapsed / 110));
}

function drawLaneWarnings(graphic: Phaser.GameObjects.Graphics, lanes: readonly number[], progress: number, pulse: number) {
  for (const lane of lanes) {
    const y = lane * CELL_HEIGHT;
    graphic.fillStyle(palette.enemyShot, .06 + pulse * .06).fillRect(0, y, BOARD_WIDTH, CELL_HEIGHT);
    graphic.lineStyle(2, palette.enemyShot, pulse).strokeRect(1, y + 1, BOARD_WIDTH - 2, CELL_HEIGHT - 2);
    graphic.fillStyle(palette.enemyShot, .8).fillRect(0, y + CELL_HEIGHT - 4, BOARD_WIDTH * progress, 3);
    for (let x = 30; x < BOARD_WIDTH; x += CELL_HEIGHT * 2) {
      graphic.lineBetween(x + 12, y + CELL_HEIGHT / 2 - 12, x, y + CELL_HEIGHT / 2);
      graphic.lineBetween(x, y + CELL_HEIGHT / 2, x + 12, y + CELL_HEIGHT / 2 + 12);
    }
  }
}
