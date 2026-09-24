import Phaser from "phaser";
import { MAX_RENDER_SCALE } from "./renderResolution";

interface GlyphTexture {
  key: string;
  width: number;
  height: number;
  references: number;
}

interface GlyphCache {
  entries: Map<string, GlyphTexture>;
  unused: Map<string, GlyphTexture>;
  disposed: boolean;
}

const caches = new WeakMap<Phaser.Scene, GlyphCache>();
const MAX_UNUSED_GLYPHS = 128;
let nextTextureId = 0;

/** Static labels share a high-DPI texture; only unused glyphs may be evicted. */
export function createSharedGlyph(
  scene: Phaser.Scene, x: number, y: number, text: string,
  style: Pick<Phaser.Types.GameObjects.Text.TextStyle, "fontFamily" | "fontSize" | "fontStyle" | "color">
) {
  const cache = glyphCache(scene);
  const signature = JSON.stringify([text, style.fontFamily, style.fontSize, style.fontStyle, style.color]);
  let entry = cache.entries.get(signature);
  if (!entry) {
    const source = new Phaser.GameObjects.Text(scene, 0, 0, text, { ...style, resolution: MAX_RENDER_SCALE });
    // Text returns its canvas to Phaser's pool on destroy, so the shared texture owns a copy.
    const canvas = document.createElement("canvas");
    canvas.width = source.canvas.width;
    canvas.height = source.canvas.height;
    canvas.getContext("2d")!.drawImage(source.canvas, 0, 0);
    entry = { key: `shared-glyph-${nextTextureId++}`, width: source.width, height: source.height, references: 0 };
    scene.textures.addCanvas(entry.key, canvas);
    source.destroy();
    cache.entries.set(signature, entry);
  }
  cache.unused.delete(signature);
  entry.references++;
  const glyph = entry;
  const image = scene.add.image(x, y, glyph.key).setOrigin(0.5).setDisplaySize(glyph.width, glyph.height);
  image.once(Phaser.GameObjects.Events.DESTROY, () => {
    if (cache.disposed || --glyph.references > 0) return;
    cache.unused.set(signature, glyph);
    if (cache.unused.size <= MAX_UNUSED_GLYPHS) return;
    const [oldSignature, oldGlyph] = cache.unused.entries().next().value!;
    cache.unused.delete(oldSignature);
    cache.entries.delete(oldSignature);
    scene.textures.remove(oldGlyph.key);
  });
  return image;
}

function glyphCache(scene: Phaser.Scene) {
  let cache = caches.get(scene);
  if (cache) return cache;
  cache = { entries: new Map(), unused: new Map(), disposed: false };
  caches.set(scene, cache);
  const owned = cache;
  const dispose = () => {
    owned.disposed = true;
    for (const glyph of owned.entries.values()) scene.textures.remove(glyph.key);
    owned.entries.clear();
    owned.unused.clear();
    caches.delete(scene);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, dispose);
    scene.events.off(Phaser.Scenes.Events.DESTROY, dispose);
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
  scene.events.once(Phaser.Scenes.Events.DESTROY, dispose);
  return cache;
}
