import Phaser from "phaser";
import { DODECAHEDRON_EDGES, DODECAHEDRON_UNIT_VERTICES } from "../bosses/cubeBoss";
import { BOSS_HITBOX_HEIGHT, BOSS_HITBOX_WIDTH, CELL_HEIGHT, palette } from "../config";
import { EFFECT_SYMBOLS } from "../i18n";
import type { DamageType, Enemy, Tower } from "../types";

interface CollapseRotation {
  x: number;
  y: number;
  z: number;
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
    const shard = scene.add.rectangle(x, y, Phaser.Math.Between(4, 9), 2, shardColor, 1).setDepth(110);
    shard.rotation = angle;
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => shard.destroy()
    });
  }
}

export function makeEnemyHitShards(scene: Phaser.Scene, x: number, y: number) {
  for (let index = 0; index < 7; index += 1) {
    const angle = Phaser.Math.FloatBetween(Math.PI * 0.2, Math.PI * 1.2);
    const distance = Phaser.Math.Between(10, 26);
    const shard = scene.add.rectangle(x, y, Phaser.Math.Between(4, 8), 2, palette.enemyShot, 1).setDepth(110);
    shard.rotation = angle;
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      duration: 240,
      ease: "Quad.easeOut",
      onComplete: () => shard.destroy()
    });
  }
}

export function makeEnemyLaserEffect(scene: Phaser.Scene, fromX: number, y: number, toX: number) {
  const beam = scene.add.graphics().setDepth(109);
  beam.lineStyle(11, palette.enemyShot, 0.18);
  beam.lineBetween(fromX, y, toX, y);
  beam.lineStyle(6, palette.enemyShot, 0.72);
  beam.lineBetween(fromX, y, toX, y);
  beam.lineStyle(2, palette.white, 0.9);
  beam.lineBetween(fromX, y, toX, y);

  const emitter = scene.add.circle(fromX, y, 8, palette.black, 0).setStrokeStyle(3, palette.enemyShot, 0.92).setDepth(110);
  const endpoint = scene.add.circle(toX, y, 10, palette.black, 0).setStrokeStyle(2, palette.enemyShot, 0.72).setDepth(110);

  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration: 120,
    ease: "Quad.easeOut",
    onComplete: () => beam.destroy()
  });
  scene.tweens.add({
    targets: [emitter, endpoint],
    scale: 1.8,
    alpha: 0,
    duration: 160,
    ease: "Quad.easeOut",
    onComplete: () => {
      emitter.destroy();
      endpoint.destroy();
    }
  });
}

export function makeShellBurst(scene: Phaser.Scene, x: number, y: number, radius: number, damageType: DamageType) {
  const ring = scene.add
    .circle(x, y, radius / 5, palette.black, 0)
    .setStrokeStyle(2, damageEffectColor(damageType), 0.9);
  ring.setDepth(105);
  scene.tweens.add({
    targets: ring,
    scale: 5,
    alpha: 0,
    duration: 280,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
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
  const blast = scene.add
    .rectangle(x, y, rangeX * 2, rangeY * 2, palette.black, 0)
    .setStrokeStyle(3, color, 0.92)
    .setDepth(112);
  const marker =
    style.marker === "shell"
      ? scene.add.circle(x, y, 9, palette.black, 1).setStrokeStyle(3, color, 0.96).setDepth(113)
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
    onComplete: () => blast.destroy()
  });
  scene.tweens.add({
    targets: marker,
    scale: 1.45,
    alpha: 0,
    duration: 280,
    ease: "Quad.easeOut",
    onComplete: () => marker.destroy()
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

export function makeTrapBurst(scene: Phaser.Scene, x: number, y: number, damageType: DamageType) {
  const ring = scene.add
    .circle(x, y, 14, palette.black, 0)
    .setStrokeStyle(3, damageEffectColor(damageType), 0.92);
  ring.setDepth(106);
  scene.tweens.add({
    targets: ring,
    scale: 2.7,
    alpha: 0,
    duration: 180,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
  });
}

export function makeSlashEffect(scene: Phaser.Scene, x: number, y: number, damageType: DamageType) {
  const color = damageEffectColor(damageType);
  const slash = scene.add.graphics().setPosition(x, y).setDepth(110);
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
    onComplete: () => slash.destroy()
  });
}

export function makeArcWaveEffect(scene: Phaser.Scene, x: number, y: number, damageType: DamageType) {
  const color = damageEffectColor(damageType);
  const wave = scene.add.graphics().setPosition(x, y).setDepth(110);
  const arcs = [
    { x: -10, radius: CELL_HEIGHT * 0.9, angle: 1.38, width: 4, alpha: 0.95 },
    { x: -34, radius: CELL_HEIGHT * 1.3, angle: 1.2, width: 3, alpha: 0.72 },
    { x: -60, radius: CELL_HEIGHT * 1.72, angle: 1.04, width: 2, alpha: 0.52 }
  ];

  for (const arc of arcs) {
    wave.lineStyle(arc.width, color, arc.alpha);
    wave.beginPath();
    wave.arc(arc.x, 0, arc.radius, -arc.angle, arc.angle, false);
    wave.strokePath();
  }

  scene.tweens.add({
    targets: wave,
    x: x + 56,
    scaleX: 1.26,
    scaleY: 1.12,
    alpha: 0,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => wave.destroy()
  });
}

export function makeShiftEffect(scene: Phaser.Scene, fromX: number, fromY: number, toX: number, toY: number) {
  const line = scene.add.graphics().setDepth(109);
  line.lineStyle(2, palette.green, 0.92);
  line.lineBetween(fromX, fromY, toX, toY);
  const marker = scene.add.circle(toX, toY, 13, palette.black, 0).setStrokeStyle(2, palette.green, 0.9);
  marker.setDepth(109);

  scene.tweens.add({
    targets: line,
    alpha: 0,
    duration: 180,
    ease: "Quad.easeOut",
    onComplete: () => line.destroy()
  });
  scene.tweens.add({
    targets: marker,
    scale: 1.7,
    alpha: 0,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => marker.destroy()
  });
}

export function makeStasisEffect(scene: Phaser.Scene, x: number, y: number) {
  const ring = scene.add.circle(x, y, 18, palette.black, 0).setStrokeStyle(2, palette.time, 0.95);
  const marker = scene.add
    .text(x, y - 1, "$", {
      color: "#9fdcff",
      fontFamily: "monospace",
      fontSize: "18px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  ring.setDepth(109);
  marker.setDepth(110);

  scene.tweens.add({
    targets: ring,
    scale: 1.7,
    alpha: 0,
    duration: 240,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
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
  const trail = scene.add.graphics().setDepth(58);
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
    onComplete: () => trail.destroy()
  });
}

export function makeBossHasteTrail(scene: Phaser.Scene, x: number, y: number) {
  const trail = scene.add.graphics().setDepth(87);
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
    onComplete: () => trail.destroy()
  });
}

export function makeBossInvincibleFlash(scene: Phaser.Scene, x: number, y: number) {
  const shield = scene.add
    .rectangle(x, y, BOSS_HITBOX_WIDTH * 0.96, BOSS_HITBOX_HEIGHT * 0.96, palette.black, 0)
    .setStrokeStyle(3, palette.gold, 0.9)
    .setDepth(110);
  scene.tweens.add({
    targets: shield,
    alpha: 0,
    scale: 1.08,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => shield.destroy()
  });
}

export function makeBossHitFlash(scene: Phaser.Scene, x: number, y: number, damageType: DamageType) {
  const flash = scene.add
    .rectangle(x, y, BOSS_HITBOX_WIDTH, BOSS_HITBOX_HEIGHT, palette.black, 0)
    .setStrokeStyle(2, damageEffectColor(damageType), 0.5);
  flash.setDepth(109);
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: 1.03,
    duration: 120,
    ease: "Quad.easeOut",
    onComplete: () => flash.destroy()
  });
}

export function makeCubeCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  followTarget?: Enemy | Tower,
  activeEnemies: Enemy[] = [],
  activeTowers: Tower[] = []
) {
  makePolyhedronCollapse(scene, x, y, "cube", followTarget, activeEnemies, activeTowers);
}

export function makeTetrahedronCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  followTarget?: Enemy | Tower,
  activeEnemies: Enemy[] = [],
  activeTowers: Tower[] = []
) {
  makePolyhedronCollapse(scene, x, y, "tetrahedron", followTarget, activeEnemies, activeTowers);
}

export function makeDodecahedronCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  followTarget?: Enemy | Tower,
  activeEnemies: Enemy[] = [],
  activeTowers: Tower[] = []
) {
  makePolyhedronCollapse(scene, x, y, "dodecahedron", followTarget, activeEnemies, activeTowers);
}

function makePolyhedronCollapse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  shape: "cube" | "tetrahedron" | "dodecahedron",
  followTarget?: Enemy | Tower,
  activeEnemies: Enemy[] = [],
  activeTowers: Tower[] = []
) {
  const collapse = scene.add.graphics().setPosition(x, y).setDepth(108);
  const rotation = randomCollapseRotation();
  if (shape === "cube") {
    drawProjectedCube(collapse, 34, rotation);
  } else if (shape === "tetrahedron") {
    drawProjectedTetrahedron(collapse, 39, rotation);
  } else {
    drawProjectedDodecahedron(collapse, 29, rotation);
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

      const targetStillExists =
        "kind" in followTarget ? activeEnemies.includes(followTarget) : activeTowers.includes(followTarget);
      if (targetStillExists) {
        collapse.setPosition(followTarget.x, followTarget.y);
      }
    },
    onComplete: () => collapse.destroy()
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
  const flash = scene.add.circle(x, y, 16, palette.black, 0).setStrokeStyle(2, palette.white, 0.8);
  flash.setDepth(105);
  scene.tweens.add({
    targets: flash,
    scale: 1.8,
    alpha: 0,
    duration: 180,
    ease: "Quad.easeOut",
    onComplete: () => flash.destroy()
  });
}

export function makeEraseMark(scene: Phaser.Scene, x: number, y: number) {
  const mark = scene.add.graphics().setDepth(107);
  mark.lineStyle(3, palette.white, 0.9);
  mark.lineBetween(x - 18, y - 18, x + 18, y + 18);
  mark.lineBetween(x + 18, y - 18, x - 18, y + 18);

  scene.tweens.add({
    targets: mark,
    scale: 1.2,
    alpha: 0,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => mark.destroy()
  });
}

export function makeAutoUpgradePulse(scene: Phaser.Scene, x: number, y: number) {
  const ring = scene.add.circle(x, y, 20, palette.black, 0).setStrokeStyle(2, palette.green, 0.95);
  ring.setDepth(107);
  scene.tweens.add({
    targets: ring,
    scale: 1.65,
    alpha: 0,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
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
