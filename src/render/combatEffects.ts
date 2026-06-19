import Phaser from "phaser";
import {
  DODECAHEDRON_EDGES,
  DODECAHEDRON_UNIT_VERTICES,
  OCTAHEDRON_EDGES,
  OCTAHEDRON_UNIT_VERTICES,
  SMALL_STELLATED_DODECAHEDRON_SPIKES
} from "../bosses/cubeBoss";
import { BOSS_HITBOX_HEIGHT, BOSS_HITBOX_WIDTH, CELL_HEIGHT, palette } from "../config";
import { EFFECT_SYMBOLS } from "../i18n";
import type { DamageType, Enemy, Tower } from "../types";

interface CollapseRotation {
  x: number;
  y: number;
  z: number;
}

const ICOSAHEDRON_PHI = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON_UNIT_VERTICES: Array<[number, number, number]> = [
  [0, 1, ICOSAHEDRON_PHI],
  [0, -1, ICOSAHEDRON_PHI],
  [0, 1, -ICOSAHEDRON_PHI],
  [0, -1, -ICOSAHEDRON_PHI],
  [1, ICOSAHEDRON_PHI, 0],
  [-1, ICOSAHEDRON_PHI, 0],
  [1, -ICOSAHEDRON_PHI, 0],
  [-1, -ICOSAHEDRON_PHI, 0],
  [ICOSAHEDRON_PHI, 0, 1],
  [ICOSAHEDRON_PHI, 0, -1],
  [-ICOSAHEDRON_PHI, 0, 1],
  [-ICOSAHEDRON_PHI, 0, -1]
];
const ICOSAHEDRON_EDGES = icosahedronEdges();
const EFFECT_GRAPHICS_POOL_LIMIT = 64;
const EFFECT_RECTANGLE_POOL_LIMIT = 256;
const EFFECT_CIRCLE_POOL_LIMIT = 128;
const effectGraphicsPools = new WeakMap<Phaser.Scene, Phaser.GameObjects.Graphics[]>();
const effectRectanglePools = new WeakMap<Phaser.Scene, Phaser.GameObjects.Rectangle[]>();
const effectCirclePools = new WeakMap<Phaser.Scene, Phaser.GameObjects.Arc[]>();

function acquireEffectGraphics(scene: Phaser.Scene, depth: number) {
  const pool = effectGraphicsPools.get(scene);
  const graphics = pool?.pop() ?? scene.add.graphics();
  scene.tweens.killTweensOf(graphics);
  graphics.clear();
  graphics.setPosition(0, 0);
  graphics.setScale(1, 1);
  graphics.setRotation(0);
  graphics.setAlpha(1);
  graphics.setVisible(true);
  graphics.setActive(true);
  graphics.setDepth(depth);
  return graphics;
}

function releaseEffectGraphics(scene: Phaser.Scene, graphics: Phaser.GameObjects.Graphics) {
  graphics.clear();
  graphics.setPosition(0, 0);
  graphics.setScale(1, 1);
  graphics.setRotation(0);
  graphics.setAlpha(1);
  graphics.setVisible(false);
  graphics.setActive(false);

  let pool = effectGraphicsPools.get(scene);
  if (!pool) {
    pool = [];
    effectGraphicsPools.set(scene, pool);
  }

  if (pool.length < EFFECT_GRAPHICS_POOL_LIMIT) {
    pool.push(graphics);
  } else {
    graphics.destroy();
  }
}

function acquireEffectRectangle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha: number,
  depth: number,
  stroke?: { width: number; color: number; alpha: number }
) {
  const pool = effectRectanglePools.get(scene);
  const rectangle = pool?.pop() ?? scene.add.rectangle(0, 0, width, height, color, alpha);
  scene.tweens.killTweensOf(rectangle);
  rectangle.setPosition(x, y);
  rectangle.setSize(width, height);
  rectangle.setFillStyle(color, alpha);
  if (stroke) {
    rectangle.setStrokeStyle(stroke.width, stroke.color, stroke.alpha);
  } else {
    rectangle.setStrokeStyle();
  }
  rectangle.setScale(1, 1);
  rectangle.setRotation(0);
  rectangle.setAlpha(1);
  rectangle.setVisible(true);
  rectangle.setActive(true);
  rectangle.setDepth(depth);
  return rectangle;
}

function releaseEffectRectangle(scene: Phaser.Scene, rectangle: Phaser.GameObjects.Rectangle) {
  rectangle.setPosition(0, 0);
  rectangle.setScale(1, 1);
  rectangle.setRotation(0);
  rectangle.setAlpha(1);
  rectangle.setStrokeStyle();
  rectangle.setVisible(false);
  rectangle.setActive(false);

  let pool = effectRectanglePools.get(scene);
  if (!pool) {
    pool = [];
    effectRectanglePools.set(scene, pool);
  }

  if (pool.length < EFFECT_RECTANGLE_POOL_LIMIT) {
    pool.push(rectangle);
  } else {
    rectangle.destroy();
  }
}

function acquireEffectCircle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  fillColor: number,
  fillAlpha: number,
  strokeWidth: number,
  strokeColor: number,
  strokeAlpha: number,
  depth: number
) {
  const pool = effectCirclePools.get(scene);
  const circle = pool?.pop() ?? scene.add.circle(0, 0, radius, fillColor, fillAlpha);
  scene.tweens.killTweensOf(circle);
  circle.setPosition(x, y);
  circle.setRadius(radius);
  circle.setFillStyle(fillColor, fillAlpha);
  circle.setStrokeStyle(strokeWidth, strokeColor, strokeAlpha);
  circle.setScale(1, 1);
  circle.setRotation(0);
  circle.setAlpha(1);
  circle.setVisible(true);
  circle.setActive(true);
  circle.setDepth(depth);
  return circle;
}

function releaseEffectCircle(scene: Phaser.Scene, circle: Phaser.GameObjects.Arc) {
  circle.setPosition(0, 0);
  circle.setScale(1, 1);
  circle.setRotation(0);
  circle.setAlpha(1);
  circle.setVisible(false);
  circle.setActive(false);

  let pool = effectCirclePools.get(scene);
  if (!pool) {
    pool = [];
    effectCirclePools.set(scene, pool);
  }

  if (pool.length < EFFECT_CIRCLE_POOL_LIMIT) {
    pool.push(circle);
  } else {
    circle.destroy();
  }
}

export function damageEffectColor(damageType: DamageType) {
  return damageType === "magic" ? palette.magic : palette.white;
}

export function damageEffectTextColor(damageType: DamageType) {
  return damageType === "magic" ? "#9fdcff" : "#f5f5f5";
}

export function makeHitShards(scene: Phaser.Scene, x: number, y: number, damageType: DamageType) {
  const shardColor = damageEffectColor(damageType);
  for (let index = 0; index < 7; index += 1) {
    const angle = Phaser.Math.FloatBetween(-Math.PI * 0.8, Math.PI * 0.8);
    const distance = Phaser.Math.Between(12, 30);
    const shard = acquireEffectRectangle(scene, x, y, Phaser.Math.Between(4, 9), 2, shardColor, 1, 110);
    shard.rotation = angle;
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => releaseEffectRectangle(scene, shard)
    });
  }
}

export function makeEnemyHitShards(scene: Phaser.Scene, x: number, y: number) {
  for (let index = 0; index < 7; index += 1) {
    const angle = Phaser.Math.FloatBetween(Math.PI * 0.2, Math.PI * 1.2);
    const distance = Phaser.Math.Between(10, 26);
    const shard = acquireEffectRectangle(scene, x, y, Phaser.Math.Between(4, 8), 2, palette.enemyShot, 1, 110);
    shard.rotation = angle;
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      duration: 240,
      ease: "Quad.easeOut",
      onComplete: () => releaseEffectRectangle(scene, shard)
    });
  }
}

export function makeSolarBombCollisionEffect(scene: Phaser.Scene, x: number, y: number) {
  const ring = acquireEffectCircle(scene, x, y, 9, palette.black, 0, 2, palette.gold, 0.95, 112);
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6 + Phaser.Math.FloatBetween(-0.18, 0.18);
    const distance = Phaser.Math.Between(10, 22);
    const shard = acquireEffectRectangle(scene, x, y, Phaser.Math.Between(3, 7), 2, palette.gold, 1, 113);
    shard.rotation = angle;
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => releaseEffectRectangle(scene, shard)
    });
  }

  scene.tweens.add({
    targets: ring,
    scale: 1.8,
    alpha: 0,
    duration: 160,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, ring)
  });
}

export function makeEnemyLaserEffect(scene: Phaser.Scene, fromX: number, y: number, toX: number) {
  const beam = acquireEffectGraphics(scene, 109);
  beam.lineStyle(11, palette.enemyShot, 0.18);
  beam.lineBetween(fromX, y, toX, y);
  beam.lineStyle(6, palette.enemyShot, 0.72);
  beam.lineBetween(fromX, y, toX, y);
  beam.lineStyle(2, palette.white, 0.9);
  beam.lineBetween(fromX, y, toX, y);

  const emitter = acquireEffectCircle(scene, fromX, y, 8, palette.black, 0, 3, palette.enemyShot, 0.92, 110);
  const endpoint = acquireEffectCircle(scene, toX, y, 10, palette.black, 0, 2, palette.enemyShot, 0.72, 110);

  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration: 120,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectGraphics(scene, beam)
  });
  scene.tweens.add({
    targets: [emitter, endpoint],
    scale: 1.8,
    alpha: 0,
    duration: 160,
    ease: "Quad.easeOut",
    onComplete: () => {
      releaseEffectCircle(scene, emitter);
      releaseEffectCircle(scene, endpoint);
    }
  });
}

export function makeTowerLaserEffect(scene: Phaser.Scene, fromX: number, y: number, toX: number) {
  const beam = acquireEffectGraphics(scene, 109);
  beam.lineStyle(11, palette.magic, 0.16);
  beam.lineBetween(fromX, y, toX, y);
  beam.lineStyle(6, palette.magic, 0.72);
  beam.lineBetween(fromX, y, toX, y);
  beam.lineStyle(2, palette.white, 0.9);
  beam.lineBetween(fromX, y, toX, y);

  const emitter = acquireEffectCircle(scene, fromX, y, 8, palette.black, 0, 3, palette.magic, 0.92, 110);
  const endpoint = acquireEffectCircle(scene, toX, y, 10, palette.black, 0, 2, palette.magic, 0.72, 110);

  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration: 120,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectGraphics(scene, beam)
  });
  scene.tweens.add({
    targets: [emitter, endpoint],
    scale: 1.8,
    alpha: 0,
    duration: 160,
    ease: "Quad.easeOut",
    onComplete: () => {
      releaseEffectCircle(scene, emitter);
      releaseEffectCircle(scene, endpoint);
    }
  });
}

export function makeShellBurst(scene: Phaser.Scene, x: number, y: number, radius: number, damageType: DamageType) {
  const ring = acquireEffectCircle(scene, x, y, radius / 5, palette.black, 0, 2, damageEffectColor(damageType), 0.9, 105);
  scene.tweens.add({
    targets: ring,
    scale: 5,
    alpha: 0,
    duration: 280,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, ring)
  });
}

export function makeSpellMortarShot(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  onImpact: () => void,
  onComplete?: () => void
) {
  const projectile = scene.add
    .text(fromX, fromY, "S", {
      color: "#9fdcff",
      fontFamily: "monospace",
      fontSize: "24px",
      fontStyle: "700"
    })
    .setOrigin(0.5)
    .setDepth(120);
  const distance = Math.hypot(targetX - fromX, targetY - fromY);
  const controlX = (fromX + targetX) / 2;
  const controlY = Math.min(fromY, targetY) - 420 - distance * 0.4;

  return scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 3240,
    ease: "Sine.easeInOut",
    onUpdate: (tween) => {
      const progress = tween.getValue();
      if (typeof progress !== "number") {
        return;
      }

      const inverse = 1 - progress;
      projectile.x = inverse * inverse * fromX + 2 * inverse * progress * controlX + progress * progress * targetX;
      projectile.y = inverse * inverse * fromY + 2 * inverse * progress * controlY + progress * progress * targetY;
      projectile.rotation = progress * Math.PI * 1.4;
      projectile.setScale(1 + Math.sin(progress * Math.PI) * 0.26);
    },
    onComplete: () => {
      projectile.destroy();
      onImpact();
      onComplete?.();
    }
  });
}

interface MortarImpactStyle {
  color?: number;
  marker?: "text" | "shell";
  markerText?: string;
  markerTextColor?: string;
  shape?: "rectangle" | "circle";
}

export function makeSpellMortarImpact(
  scene: Phaser.Scene,
  x: number,
  y: number,
  rangeX: number,
  rangeY: number,
  style: MortarImpactStyle = {}
) {
  const color = style.color ?? palette.magic;
  const blast =
    style.shape === "circle"
      ? acquireEffectCircle(scene, x, y, rangeX, palette.black, 0, 3, color, 0.92, 112)
      : acquireEffectRectangle(scene, x, y, rangeX * 2, rangeY * 2, palette.black, 0, 112, {
          width: 3,
          color,
          alpha: 0.92
        });
  const marker =
    style.marker === "shell"
      ? acquireEffectCircle(scene, x, y, 9, palette.black, 1, 3, color, 0.96, 113)
      : scene.add
          .text(x, y - 1, style.markerText ?? "S", {
            color: style.markerTextColor ?? "#9fdcff",
            fontFamily: "monospace",
            fontSize: "26px",
            fontStyle: "700"
          })
          .setOrigin(0.5)
          .setDepth(113);

  scene.tweens.add({
    targets: blast,
    scale: 1.08,
    alpha: 0,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => {
      if (style.shape === "circle") {
        releaseEffectCircle(scene, blast as Phaser.GameObjects.Arc);
      } else {
        releaseEffectRectangle(scene, blast as Phaser.GameObjects.Rectangle);
      }
    }
  });
  scene.tweens.add({
    targets: marker,
    scale: 1.45,
    alpha: 0,
    duration: 280,
    ease: "Quad.easeOut",
    onComplete: () => {
      if (style.marker === "shell") {
        releaseEffectCircle(scene, marker as Phaser.GameObjects.Arc);
      } else {
        marker.destroy();
      }
    }
  });
}

export function makeShockPulse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  rangeX: number,
  rangeY: number,
  damageType: DamageType = "physical"
) {
  const pulse = scene.add
    .rectangle(x, y, rangeX * 2, rangeY * 2, palette.black, 0)
    .setStrokeStyle(2, damageEffectColor(damageType), 0.82)
    .setDepth(106);

  scene.tweens.add({
    targets: pulse,
    scale: 1.12,
    alpha: 0,
    duration: 120,
    ease: "Quad.easeOut",
    onComplete: () => pulse.destroy()
  });
}

export function makeFreezePulse(scene: Phaser.Scene, x: number, y: number, radius: number) {
  const ring = acquireEffectCircle(scene, x, y, radius, palette.black, 0, 3, palette.magic, 0.9, 106);
  scene.tweens.add({
    targets: ring,
    scale: 1.1,
    alpha: 0,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, ring)
  });
}

export function makeHeartPulse(scene: Phaser.Scene, x: number, y: number, radius: number) {
  const heart = scene.add
    .text(x, y + 2, "♥", {
      color: "#ff7eb6",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: "42px",
      fontStyle: "bold"
    })
    .setOrigin(0.5)
    .setDepth(111);
  const ring = acquireEffectCircle(scene, x, y, radius * 0.25, palette.black, 0, 2, palette.heart, 0.78, 110);

  scene.tweens.add({
    targets: heart,
    scale: radius / 18,
    alpha: 0,
    duration: 420,
    ease: "Quad.easeOut",
    onComplete: () => heart.destroy()
  });
  scene.tweens.add({
    targets: ring,
    scale: 4,
    alpha: 0,
    duration: 420,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, ring)
  });
}

export function makeTrapBurst(scene: Phaser.Scene, x: number, y: number, damageType: DamageType) {
  const ring = acquireEffectCircle(scene, x, y, 14, palette.black, 0, 3, damageEffectColor(damageType), 0.92, 106);
  scene.tweens.add({
    targets: ring,
    scale: 2.7,
    alpha: 0,
    duration: 180,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, ring)
  });
}

export function makeSlashEffect(scene: Phaser.Scene, x: number, y: number, damageType: DamageType) {
  const color = damageEffectColor(damageType);
  const slash = acquireEffectGraphics(scene, 110).setPosition(x, y);
  slash.lineStyle(4, color, 0.98);
  slash.lineBetween(-30, -30, 30, 30);
  slash.lineBetween(-30, 30, 30, -30);
  slash.lineStyle(1, color, 0.72);
  slash.lineBetween(-38, -38, -22, -22);
  slash.lineBetween(22, 22, 38, 38);
  slash.lineBetween(-38, 38, -22, 22);
  slash.lineBetween(22, -22, 38, -38);

  scene.tweens.add({
    targets: slash,
    scale: 1.28,
    alpha: 0,
    duration: 145,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectGraphics(scene, slash)
  });
}

export function makeArcWaveEffect(
  scene: Phaser.Scene,
  x: number,
  y: number,
  damageType: DamageType,
  direction: -1 | 1 = 1
) {
  const color = damageEffectColor(damageType);
  const wave = acquireEffectGraphics(scene, 110).setPosition(x, y);
  const arcs = [
    { x: -10 * direction, radius: CELL_HEIGHT * 0.9, angle: 1.38, width: 4, alpha: 0.95 },
    { x: -34 * direction, radius: CELL_HEIGHT * 1.3, angle: 1.2, width: 3, alpha: 0.72 },
    { x: -60 * direction, radius: CELL_HEIGHT * 1.72, angle: 1.04, width: 2, alpha: 0.52 }
  ];
  const forwardAngle = direction > 0 ? 0 : Math.PI;

  for (const arc of arcs) {
    wave.lineStyle(arc.width, color, arc.alpha);
    wave.beginPath();
    wave.arc(arc.x, 0, arc.radius, forwardAngle - arc.angle, forwardAngle + arc.angle, false);
    wave.strokePath();
  }

  scene.tweens.add({
    targets: wave,
    x: x + 56 * direction,
    scaleX: 1.26,
    scaleY: 1.12,
    alpha: 0,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectGraphics(scene, wave)
  });
}

export function makeShiftEffect(scene: Phaser.Scene, fromX: number, fromY: number, toX: number, toY: number) {
  const line = acquireEffectGraphics(scene, 109);
  line.lineStyle(2, palette.green, 0.92);
  line.lineBetween(fromX, fromY, toX, toY);
  const marker = acquireEffectCircle(scene, toX, toY, 13, palette.black, 0, 2, palette.green, 0.9, 109);

  scene.tweens.add({
    targets: line,
    alpha: 0,
    duration: 180,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectGraphics(scene, line)
  });
  scene.tweens.add({
    targets: marker,
    scale: 1.7,
    alpha: 0,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, marker)
  });
}

export function makeStasisEffect(scene: Phaser.Scene, x: number, y: number) {
  const ring = acquireEffectCircle(scene, x, y, 18, palette.black, 0, 2, palette.time, 0.95, 109);
  const marker = scene.add
    .text(x, y - 1, "$", {
      color: "#9fdcff",
      fontFamily: "monospace",
      fontSize: "18px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  marker.setDepth(110);

  scene.tweens.add({
    targets: ring,
    scale: 1.7,
    alpha: 0,
    duration: 240,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, ring)
  });
  scene.tweens.add({
    targets: marker,
    y: y - 18,
    alpha: 0,
    duration: 300,
    ease: "Quad.easeOut",
    onComplete: () => marker.destroy()
  });
}

export function makeSunderEffect(scene: Phaser.Scene, x: number, y: number) {
  const ring = acquireEffectCircle(scene, x, y, 18, palette.black, 0, 2, palette.white, 0.95, 109);
  const marker = scene.add
    .text(x, y - 1, "▣", {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "18px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  marker.setDepth(110);

  scene.tweens.add({
    targets: ring,
    scale: 1.7,
    alpha: 0,
    duration: 240,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, ring)
  });
  scene.tweens.add({
    targets: marker,
    y: y - 18,
    alpha: 0,
    duration: 300,
    ease: "Quad.easeOut",
    onComplete: () => marker.destroy()
  });
}

export function makeHasteTrail(scene: Phaser.Scene, x: number, y: number) {
  const trail = acquireEffectGraphics(scene, 58);
  trail.lineStyle(2, palette.magic, 0.72);
  for (let index = 0; index < 3; index += 1) {
    const offsetY = Phaser.Math.Between(-12, 12);
    const length = Phaser.Math.Between(16, 30);
    trail.lineBetween(x + 22 + index * 4, y + offsetY, x + 22 + length, y + offsetY - Phaser.Math.Between(2, 8));
  }

  scene.tweens.add({
    targets: trail,
    x: trail.x + 18,
    alpha: 0,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectGraphics(scene, trail)
  });
}

export function makeBossHasteTrail(scene: Phaser.Scene, x: number, y: number) {
  const trail = acquireEffectGraphics(scene, 87);
  trail.lineStyle(3, palette.magic, 0.78);
  for (let index = 0; index < 7; index += 1) {
    const offsetY = Phaser.Math.Between(-64, 64);
    const length = Phaser.Math.Between(46, 86);
    trail.lineBetween(x + 64 + index * 8, y + offsetY, x + 64 + length, y + offsetY - Phaser.Math.Between(5, 18));
  }

  scene.tweens.add({
    targets: trail,
    x: trail.x + 34,
    alpha: 0,
    duration: 320,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectGraphics(scene, trail)
  });
}

export function makeBossInvincibleFlash(scene: Phaser.Scene, x: number, y: number, width = BOSS_HITBOX_WIDTH, height = BOSS_HITBOX_HEIGHT) {
  const shield = acquireEffectRectangle(scene, x, y, width * 0.96, height * 0.96, palette.black, 0, 110, {
    width: 3,
    color: palette.gold,
    alpha: 0.9
  });
  scene.tweens.add({
    targets: shield,
    alpha: 0,
    scale: 1.08,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectRectangle(scene, shield)
  });
}

export function makeEnemyInvincibleFlash(scene: Phaser.Scene, x: number, y: number) {
  const shield = acquireEffectCircle(scene, x, y, 28, palette.black, 0, 3, palette.gold, 0.9, 110);
  scene.tweens.add({
    targets: shield,
    alpha: 0,
    scale: 1.2,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, shield)
  });
}

export function makeBossHitFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  damageType: DamageType,
  width = BOSS_HITBOX_WIDTH,
  height = BOSS_HITBOX_HEIGHT
) {
  const flash = acquireEffectRectangle(scene, x, y, width, height, palette.black, 0, 109, {
    width: 2,
    color: damageEffectColor(damageType),
    alpha: 0.5
  });
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: 1.03,
    duration: 120,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectRectangle(scene, flash)
  });
}

export function makeCubeCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  followTarget?: Enemy | Tower,
  _activeEnemies: Enemy[] = [],
  _activeTowers: Tower[] = []
) {
  makePolyhedronCollapse(scene, x, y, "cube", followTarget);
}

export function makeTetrahedronCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  followTarget?: Enemy | Tower,
  _activeEnemies: Enemy[] = [],
  _activeTowers: Tower[] = []
) {
  makePolyhedronCollapse(scene, x, y, "tetrahedron", followTarget);
}

export function makeDodecahedronCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  followTarget?: Enemy | Tower,
  _activeEnemies: Enemy[] = [],
  _activeTowers: Tower[] = []
) {
  makePolyhedronCollapse(scene, x, y, "dodecahedron", followTarget);
}

export function makeSmallStellatedDodecahedronCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  followTarget?: Enemy | Tower,
  _activeEnemies: Enemy[] = [],
  _activeTowers: Tower[] = []
) {
  makePolyhedronCollapse(scene, x, y, "smallStellatedDodecahedron", followTarget);
}

export function makeOctahedronCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  followTarget?: Enemy | Tower,
  _activeEnemies: Enemy[] = [],
  _activeTowers: Tower[] = []
) {
  makePolyhedronCollapse(scene, x, y, "octahedron", followTarget);
}

export function makeIcosahedronCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  followTarget?: Enemy | Tower,
  _activeEnemies: Enemy[] = [],
  _activeTowers: Tower[] = []
) {
  makePolyhedronCollapse(scene, x, y, "icosahedron", followTarget);
}

function makePolyhedronCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  shape: "cube" | "tetrahedron" | "dodecahedron" | "smallStellatedDodecahedron" | "octahedron" | "icosahedron",
  followTarget?: Enemy | Tower
) {
  const collapse = acquireEffectGraphics(scene, 108).setPosition(x, y);
  const rotation = randomCollapseRotation();
  if (shape === "cube") {
    drawProjectedCube(collapse, 34, rotation);
  } else if (shape === "tetrahedron") {
    drawProjectedTetrahedron(collapse, 39, rotation);
  } else if (shape === "dodecahedron") {
    drawProjectedDodecahedron(collapse, 29, rotation);
  } else if (shape === "octahedron") {
    drawProjectedOctahedron(collapse, 40, rotation);
  } else if (shape === "icosahedron") {
    drawProjectedIcosahedron(collapse, 30, rotation);
  } else {
    drawProjectedSmallStellatedDodecahedron(collapse, 21, rotation);
  }

  scene.tweens.add({
    targets: collapse,
    scale: 0.15,
    rotation: Phaser.Math.FloatBetween(-0.75, 0.75),
    alpha: 0,
    duration: 936,
    ease: "Quad.easeIn",
    onUpdate: () => {
      if (!followTarget) {
        return;
      }

      if (followTarget.inPlay) {
        collapse.setPosition(followTarget.x, followTarget.y);
      }
    },
    onComplete: () => releaseEffectGraphics(scene, collapse)
  });
}

function randomCollapseRotation(): CollapseRotation {
  return {
    x: Phaser.Math.FloatBetween(-Math.PI, Math.PI),
    y: Phaser.Math.FloatBetween(-Math.PI, Math.PI),
    z: Phaser.Math.FloatBetween(-Math.PI, Math.PI)
  };
}

function drawProjectedCube(graphics: Phaser.GameObjects.Graphics, size: number, rotation: CollapseRotation) {
  const vertices = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1]
  ].map(([x, y, z]) => projectCollapsePoint(x * size, y * size, z * size, rotation));
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7]
  ];

  graphics.lineStyle(2, palette.white, 0.88);
  for (const [from, to] of edges) {
    graphics.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }
}

function drawProjectedTetrahedron(graphics: Phaser.GameObjects.Graphics, size: number, rotation: CollapseRotation) {
  const vertices = [
    [1, 1, 1],
    [-1, -1, 1],
    [-1, 1, -1],
    [1, -1, -1]
  ].map(([x, y, z]) => projectCollapsePoint(x * size, y * size, z * size, rotation));
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3]
  ];

  graphics.lineStyle(2, palette.white, 0.9);
  for (const [from, to] of edges) {
    graphics.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }
}

function drawProjectedDodecahedron(graphics: Phaser.GameObjects.Graphics, size: number, rotation: CollapseRotation) {
  const vertices = DODECAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectCollapsePoint(x * size, y * size, z * size, rotation)
  );

  graphics.lineStyle(2, palette.white, 0.86);
  for (const [from, to] of DODECAHEDRON_EDGES) {
    graphics.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }
}

function drawProjectedOctahedron(graphics: Phaser.GameObjects.Graphics, size: number, rotation: CollapseRotation) {
  const vertices = OCTAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectCollapsePoint(x * size, y * size, z * size, rotation)
  );

  graphics.lineStyle(2, palette.white, 0.9);
  for (const [from, to] of OCTAHEDRON_EDGES) {
    graphics.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }
}

function drawProjectedIcosahedron(graphics: Phaser.GameObjects.Graphics, size: number, rotation: CollapseRotation) {
  const vertices = ICOSAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectCollapsePoint(x * size, y * size, z * size, rotation)
  );

  graphics.lineStyle(2, palette.enemyShot, 0.9);
  for (const [from, to] of ICOSAHEDRON_EDGES) {
    graphics.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }
}

function drawProjectedSmallStellatedDodecahedron(
  graphics: Phaser.GameObjects.Graphics,
  size: number,
  rotation: CollapseRotation
) {
  const baseVertices = DODECAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectCollapsePoint(x * size, y * size, z * size, rotation)
  );
  const spikeTips = SMALL_STELLATED_DODECAHEDRON_SPIKES.map(({ tip }) =>
    projectCollapsePoint(tip[0] * size, tip[1] * size, tip[2] * size, rotation)
  );

  graphics.lineStyle(1.4, palette.white, 0.32);
  for (const [from, to] of DODECAHEDRON_EDGES) {
    graphics.lineBetween(baseVertices[from].x, baseVertices[from].y, baseVertices[to].x, baseVertices[to].y);
  }

  graphics.lineStyle(1.8, palette.white, 0.86);
  SMALL_STELLATED_DODECAHEDRON_SPIKES.forEach(({ face }, index) => {
    const tip = spikeTips[index];
    for (const vertexIndex of face) {
      const vertex = baseVertices[vertexIndex];
      graphics.lineBetween(tip.x, tip.y, vertex.x, vertex.y);
    }
  });
}

function icosahedronEdges() {
  const edges: Array<[number, number]> = [];
  for (let from = 0; from < ICOSAHEDRON_UNIT_VERTICES.length; from += 1) {
    for (let to = from + 1; to < ICOSAHEDRON_UNIT_VERTICES.length; to += 1) {
      const [ax, ay, az] = ICOSAHEDRON_UNIT_VERTICES[from];
      const [bx, by, bz] = ICOSAHEDRON_UNIT_VERTICES[to];
      const distance = Math.hypot(ax - bx, ay - by, az - bz);
      if (distance <= 2.01) {
        edges.push([from, to]);
      }
    }
  }
  return edges;
}

function projectCollapsePoint(x: number, y: number, z: number, rotation: CollapseRotation) {
  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  const cosZ = Math.cos(rotation.z);
  const sinZ = Math.sin(rotation.z);

  const y1 = y * cosX - z * sinX;
  const z1 = y * sinX + z * cosX;
  const x2 = x * cosY + z1 * sinY;
  const z2 = -x * sinY + z1 * cosY;
  const x3 = x2 * cosZ - y1 * sinZ;
  const y3 = x2 * sinZ + y1 * cosZ;
  const scale = 1.25 / (1 + z2 / 360);
  return { x: x3 * scale, y: y3 * scale };
}

export function makeHealParticles(scene: Phaser.Scene, x: number, y: number) {
  for (let index = 0; index < 6; index += 1) {
    const angle = Phaser.Math.FloatBetween(-Math.PI, 0);
    const distance = Phaser.Math.Between(12, 28);
    const particle = scene.add
      .text(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-6, 10), EFFECT_SYMBOLS.heal, {
        color: "#48ff88",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5)
      .setDepth(106);

    scene.tweens.add({
      targets: particle,
      x: particle.x + Math.cos(angle) * distance,
      y: particle.y + Math.sin(angle) * distance,
      alpha: 0,
      duration: 360,
      ease: "Quad.easeOut",
      onComplete: () => particle.destroy()
    });
  }
}

export function makeReflectFlash(scene: Phaser.Scene, x: number, y: number) {
  const flash = acquireEffectCircle(scene, x, y, 16, palette.black, 0, 2, palette.white, 0.8, 105);
  scene.tweens.add({
    targets: flash,
    scale: 1.8,
    alpha: 0,
    duration: 180,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, flash)
  });
}

export function makeEraseMark(scene: Phaser.Scene, x: number, y: number) {
  const mark = acquireEffectGraphics(scene, 107);
  mark.lineStyle(3, palette.white, 0.9);
  mark.lineBetween(x - 18, y - 18, x + 18, y + 18);
  mark.lineBetween(x + 18, y - 18, x - 18, y + 18);

  scene.tweens.add({
    targets: mark,
    scale: 1.2,
    alpha: 0,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectGraphics(scene, mark)
  });
}

export function makeAutoUpgradePulse(scene: Phaser.Scene, x: number, y: number) {
  const ring = acquireEffectCircle(scene, x, y, 20, palette.black, 0, 2, palette.green, 0.95, 107);
  scene.tweens.add({
    targets: ring,
    scale: 1.65,
    alpha: 0,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => releaseEffectCircle(scene, ring)
  });
}

export function makeProductionPulse(scene: Phaser.Scene, x: number, y: number, amount: number) {
  const text = scene.add
    .text(x, y, `${EFFECT_SYMBOLS.chars}${amount}`, {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "16px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  text.setDepth(105);

  scene.tweens.add({
    targets: text,
    y: y - 22,
    alpha: 0,
    duration: 640,
    ease: "Quad.easeOut",
    onComplete: () => text.destroy()
  });
}
