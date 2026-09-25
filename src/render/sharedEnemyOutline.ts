import Phaser from "phaser";
import { MAX_RENDER_SCALE } from "./renderResolution";

type OutlineKind = "heart" | "tilde";
const SIZE = 72;
const caches = new WeakMap<Phaser.Scene, Map<OutlineKind, string>>();
let nextTextureId = 0;

// Only fixed, rank-independent outlines belong here. Animated parts remain live geometry.
export function createSharedEnemyOutline(scene: Phaser.Scene, kind: OutlineKind,
  draw: (graphics: Phaser.GameObjects.Graphics) => void) {
  let cache = caches.get(scene);
  if (!cache) {
    cache = new Map();
    caches.set(scene, cache);
    const owned = cache;
    const dispose = () => {
      for (const key of owned.values()) scene.textures.remove(key);
      owned.clear(); caches.delete(scene);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, dispose);
      scene.events.off(Phaser.Scenes.Events.DESTROY, dispose);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
    scene.events.once(Phaser.Scenes.Events.DESTROY, dispose);
  }
  let key = cache.get(kind);
  if (!key) {
    key = `shared-enemy-outline-${nextTextureId++}`;
    const graphics = new Phaser.GameObjects.Graphics(scene);
    try {
      graphics.scaleCanvas(MAX_RENDER_SCALE, MAX_RENDER_SCALE).translateCanvas(SIZE / 2, SIZE / 2);
      draw(graphics);
      graphics.generateTexture(key, SIZE * MAX_RENDER_SCALE, SIZE * MAX_RENDER_SCALE);
      cache.set(kind, key);
    } catch (error) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
      throw error;
    } finally { graphics.destroy(); }
  }
  return scene.add.image(0, 0, key).setOrigin(.5).setDisplaySize(SIZE, SIZE);
}
