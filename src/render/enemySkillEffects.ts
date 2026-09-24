import type Phaser from "phaser";

export function makeWingPulse(scene: Phaser.Scene, x: number, y: number) {
  const halo = scene.add.ellipse(x, y - 28, 34, 10, 0x000000, 0).setStrokeStyle(2, 0xf5f5f5, 0.9).setDepth(109);
  const lift = scene.add.graphics().setDepth(108);
  lift.lineStyle(2, 0xf5f5f5, 0.65);
  lift.lineBetween(x - 18, y - 8, x - 34, y - 22);
  lift.lineBetween(x + 18, y - 8, x + 34, y - 22);
  scene.tweens.add({
    targets: [halo, lift],
    y: "-=18",
    alpha: 0,
    duration: 320,
    ease: "Quad.easeOut",
    onComplete: () => {
      halo.destroy();
      lift.destroy();
    }
  });
}
