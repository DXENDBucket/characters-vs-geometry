import type Phaser from "phaser";

type Stroke = readonly (readonly [number, number])[];
const ZERO: Stroke = Array.from({ length: 25 }, (_, i) => {
  const angle = i * Math.PI / 12;
  return [Math.cos(angle) * .32, Math.sin(angle) * .5] as const;
});
const ONE: Stroke = [[-.22, -.28], [0, -.5], [0, .5], [-.25, .5], [.25, .5]];
const LETTERS: readonly (readonly Stroke[])[] = [
  [[[-.35, -.5], [.12, -.5], [.35, -.28], [.35, .28], [.12, .5], [-.35, .5], [-.35, -.5]]],
  [[[.35, -.5], [-.35, -.5], [-.35, .5], [.35, .5]], [[-.35, 0], [.22, 0]]],
  [[[-.35, -.5], [-.35, .5], [.35, .5]]]
];

function stroke(graphics: Phaser.GameObjects.Graphics, points: Stroke, x: number, y: number, size: number, angle = 0) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  graphics.beginPath();
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    const sx = x + (px * cos - py * sin) * size, sy = y + (px * sin + py * cos) * size;
    if (i === 0) graphics.moveTo(sx, sy);
    else graphics.lineTo(sx, sy);
  }
  graphics.strokePath();
}

// Animated 2D glyph orbits: one graphics object, no per-frame Text objects or gameplay RNG.
export function drawDelBoss(graphics: Phaser.GameObjects.Graphics, radius: number, time: number, invincible = false) {
  graphics.clear();
  const seconds = time / 1000;
  const color = invincible ? 0xffd75a : 0xf5f5f5;
  const count = radius < 40 ? 32 : 56;
  const digitSize = radius * .09;
  const glitchPhase = (time % 4100 + 4100) % 4100;
  const glitch = glitchPhase >= 3300 && glitchPhase < 3430;
  const offset = glitch ? Math.sin(Math.floor(time / 28) * 2.1) * radius * .045 : 0;

  const glyphs: { path: Stroke; x: number; y: number; size: number; tangent: number; depth: number }[] = [];
  for (let ring = 0; ring < 2; ring++) {
    const r = radius * (ring === 0 ? .81 : 1);
    const tilt = (ring === 0 ? -.6 : .85) + Math.sin(seconds * .53 + ring * 2) * .48;
    const pitch = 1.15 + seconds * .71 + ring * 2.4;
    const squash = Math.cos(pitch);
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    const spin = seconds * (ring === 0 ? 2.9 : -2.3);
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count + spin;
      const depth = Math.sin(angle) * Math.sin(pitch) * r / radius;
      const px = Math.cos(angle) * r, py = Math.sin(angle) * r * squash;
      const x = px * cos - py * sin, y = px * sin + py * cos;
      const tangent = Math.atan2(Math.cos(angle) * squash, -Math.sin(angle)) + tilt;
      glyphs.push({ path: i % 2 ? ONE : ZERO, x, y, size: digitSize * (1 + depth * .12), tangent, depth });
    }
  }
  glyphs.sort((a, b) => a.depth - b.depth);
  // Opaque stroke underlays hide rear ink locally, without a rectangular label backdrop.
  const rings = (front: boolean) => {
    for (const glyph of glyphs) {
      if ((glyph.depth >= 0) !== front) continue;
      const width = Math.max(.7, radius * .011);
      graphics.lineStyle(width + Math.max(1.2, radius * .018), 0x050505, 1);
      stroke(graphics, glyph.path, glyph.x, glyph.y, glyph.size, glyph.tangent);
      graphics.lineStyle(width, color, .48 + (glyph.depth + 1) * .25);
      stroke(graphics, glyph.path, glyph.x, glyph.y, glyph.size, glyph.tangent);
    }
  };
  rings(false);
  const drawName = (xOffset: number, yOffset: number, nameColor: number, alpha: number) => {
    for (const underlay of [true, false]) {
      graphics.lineStyle(Math.max(1.5, radius * .034) + (underlay ? Math.max(1.5, radius * .022) : 0),
        underlay ? 0x050505 : nameColor, underlay ? 1 : alpha);
      for (let i = 0; i < LETTERS.length; i++) {
        for (const path of LETTERS[i]) stroke(graphics, path, (i - 1) * radius * .32 + xOffset, yOffset, radius * .34);
      }
    }
  };
  if (glitch) {
    drawName(-offset, -radius * .022, 0x9fdcff, .65);
    drawName(offset, radius * .022, 0xff6464, .5);
  }
  drawName(offset, 0, color, 1);
  if (glitch) {
    graphics.lineStyle(Math.max(1, radius * .015), 0x9fdcff, .9);
    for (let i = 0; i < 3; i++) {
      const y = (i - 1) * radius * .14;
      graphics.lineBetween(-radius * .55 + offset * i, y, radius * .48 - offset * i, y);
    }
  }
  rings(true);
}

export function createDelIcon(scene: Phaser.Scene, radius = 27) {
  const icon = scene.add.graphics();
  drawDelBoss(icon, radius, 1200);
  return icon;
}
