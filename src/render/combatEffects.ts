import Phaser from "phaser";
import { BOSS_HITBOX_HEIGHT, BOSS_HITBOX_WIDTH, palette } from "../config";
import { EFFECT_SYMBOLS } from "../i18n";
import type { DamageType, Enemy, Tower } from "../types";

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

export function makeShockPulse(scene: Phaser.Scene, x: number, y: number, rangeX: number, rangeY: number) {
  const pulse = scene.add
    .rectangle(x, y, rangeX * 2, rangeY * 2, palette.black, 0)
    .setStrokeStyle(2, palette.white, 0.82)
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
  const cube = scene.add.graphics().setPosition(x, y).setDepth(108);
  const size = 132;
  cube.lineStyle(2, palette.white, 0.88);
  cube.strokeRect(-size / 2, -size / 2, size, size);
  cube.strokeRect(-size / 2 + 8, -size / 2 - 8, size, size);
  cube.lineBetween(-size / 2, -size / 2, -size / 2 + 8, -size / 2 - 8);
  cube.lineBetween(size / 2, -size / 2, size / 2 + 8, -size / 2 - 8);
  cube.lineBetween(size / 2, size / 2, size / 2 + 8, size / 2 - 8);
  cube.lineBetween(-size / 2, size / 2, -size / 2 + 8, size / 2 - 8);

  scene.tweens.add({
    targets: cube,
    scale: 0.15,
    rotation: 0.5,
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
        cube.setPosition(followTarget.x, followTarget.y);
      }
    },
    onComplete: () => cube.destroy()
  });
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
