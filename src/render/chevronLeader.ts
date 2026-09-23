import type Phaser from "phaser";
import { CHEVRON_LEADER } from "../data/chevronLeader";
import { enemyFamily } from "../registry/enemies";
import type { Enemy } from "../types";
import { enemyFacingDirection } from "../game/rules/reversal";

export function drawChevronFrame(frame: Phaser.GameObjects.Graphics, assault = false) {
  const direction = assault ? -1 : 1;
  frame.clear().lineStyle(3, 0xf5f5f5, 1);
  frame.beginPath().moveTo(-22 * direction, -25).lineTo(18 * direction, 0).lineTo(-22 * direction, 25).strokePath();
}

export function drawIonOrb(graphics: Phaser.GameObjects.Graphics, radius = 9, alpha = 1) {
  const color = CHEVRON_LEADER.color;
  graphics.fillStyle(color, alpha * .06).fillCircle(0, 0, radius * 1.75);
  graphics.fillStyle(color, alpha * .14).fillCircle(0, 0, radius * 1.25);
  graphics.lineStyle(1.4, color, alpha).strokeCircle(0, 0, radius);
  graphics.fillStyle(0xeefff5, alpha).fillCircle(0, 0, radius * .35);
}

export function syncChevronVisual(enemy: Enemy) {
  if (enemyFamily(enemy.kind) !== "chevronLeader") return;
  const frame = enemy.shape.getData("chevronFrame") as Phaser.GameObjects.Graphics | undefined;
  const charge = enemy.shape.getData("ionCharge") as Phaser.GameObjects.Graphics | undefined;
  if (!frame || !charge) return;
  charge.setX(enemyFacingDirection(enemy) > 0 ? 12 : -12);
  if (frame.getData("assault") !== !!enemy.chevronAssault) {
    drawChevronFrame(frame, enemy.chevronAssault);
    frame.setData("assault", !!enemy.chevronAssault);
  }
  const elapsed = enemy.ionChargeMs ?? 0;
  // Quantize only drawing, never the combat timer. No per-frame particles or tweens.
  const tick = enemy.chevronAssault ? -1 : Math.floor(elapsed / 33);
  if (charge.getData("tick") === tick) return;
  charge.setData("tick", tick).clear();
  if (enemy.chevronAssault || elapsed <= 0) return;
  const progress = Math.min(1, elapsed / CHEVRON_LEADER.chargeMs);
  const angle = elapsed * .002;
  const radius = 18 - progress * 5;
  drawIonOrb(charge, 2 + progress * 7, .25 + progress * .75);
  charge.lineStyle(1, CHEVRON_LEADER.color, .3 + progress * .6);
  for (let i = 0; i < 3; i++) {
    const start = angle + i * Math.PI * 2 / 3;
    charge.beginPath().arc(0, 0, radius, start, start + 1.05).strokePath();
    const orbit = radius + (1 - progress) * 7;
    const x = Math.cos(-start) * orbit, y = Math.sin(-start) * orbit;
    charge.fillStyle(CHEVRON_LEADER.color, .7).fillRect(x - 1, y - 1, 2, 2);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const r = radius + 3;
    charge.lineStyle(1, CHEVRON_LEADER.color, i / 8 < progress ? .9 : .15);
    charge.lineBetween(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a) * (r + 3), Math.sin(a) * (r + 3));
  }
  if (progress > .85) {
    charge.lineStyle(1, 0xeefff5, .3 + .5 * Math.sin(progress * 120) ** 2);
    charge.lineBetween(-22, 0, -12, 0);
    charge.lineBetween(0, -13, 0, -20);
    charge.lineBetween(0, 13, 0, 20);
  }
}
