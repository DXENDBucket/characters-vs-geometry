import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

test("enemy reversal moves shared rank labels without mirroring their pixels", () => {
  class TextLabel {}
  const load = createTypeScriptLoader({ phaser: { default: { GameObjects: { Text: TextLabel } } },
    "src/render/unitShapes.ts": {} });
  const { syncEnemyFacingVisual } = load("src/game/enemyBehaviors.ts");
  const object = (x, rankLabel = false) => {
    const data = new Map([["enemyRankLabel", rankLabel]]);
    return { x, scaleX: .32, scaleY: .5,
      getData: key => data.get(key), setData: (key, value) => data.set(key, value),
      setX(value) { this.x = value; }, setScale(x, y) { this.scaleX = x; this.scaleY = y; } };
  };
  const rank = object(-9, true), legacy = Object.assign(new TextLabel(), object(9)), frame = object(0);
  const enemy = { kind: "triangleRam14", movementDirection: -1, statusEffects: [], shape: { list: [rank, legacy, frame] } };
  for (const direction of [1, -1, 1, -1]) {
    enemy.movementDirection = direction;
    syncEnemyFacingVisual(enemy);
    assert.deepEqual([rank.x, rank.scaleX, legacy.x, legacy.scaleX], [9 * direction, .32, -9 * direction, .32]);
    assert.equal(frame.scaleX, -.32 * direction);
  }
});

function fixture() {
  let rasterizations = 0;
  const textures = new Map(), images = [];
  class Text {
    constructor(_scene, _x, _y, _text, style) {
      rasterizations++;
      this.width = 20; this.height = 30;
      this.canvas = { width: this.width * style.resolution, height: this.height * style.resolution };
    }
    destroy() { this.canvas.width = 0; }
  }
  class Graphics {
    constructor(scene) { this.scene = scene; }
    scaleCanvas(x, y) { this.scale = [x, y]; return this; }
    translateCanvas(x, y) { this.translation = [x, y]; return this; }
    generateTexture(key, width, height) { this.scene.textures.addCanvas(key, { width, height,
      scale: this.scale, translation: this.translation }); }
    destroy() { this.scene = undefined; }
  }
  const load = createTypeScriptLoader({ phaser: { default: {
    GameObjects: { Text, Graphics, Events: { DESTROY: "destroy" } }, Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } }
  } } });
  const { createSharedGlyph } = load("src/render/sharedGlyphs.ts");
  const { createSharedEnemyOutline } = load("src/render/sharedEnemyOutline.ts");
  const scene = {
    events: new EventEmitter(),
    textures: {
      addCanvas(key, canvas) { textures.set(key, canvas); },
      exists: key => textures.has(key),
      remove(key) { assert(textures.delete(key), "texture removed twice"); }
    },
    add: { image(x, y, key) {
      assert(textures.has(key));
      const image = Object.assign(new EventEmitter(), {
        x, y, key, setOrigin() { return this; },
        setDisplaySize(width, height) { this.width = width; this.height = height; return this; },
        destroy() { this.emit("destroy"); this.removeAllListeners(); }
      });
      images.push(image); return image;
    } }
  };
  return { scene, textures, images, rasterizations: () => rasterizations,
    outline: (kind, draw) => createSharedEnemyOutline(scene, kind, draw),
    glyph: (text = "I", color = "#ffffff") => createSharedGlyph(scene, 0, 0, text, { color, fontFamily: "serif", fontSize: "18px", fontStyle: "bold" }) };
}

test("static enemy outlines rasterize once per kind at high DPI and clean up on restart", () => {
  const f = fixture(); let draws = 0;
  const a = f.outline("heart", () => draws++);
  for (let i = 0; i < 500; i++) assert.equal(f.outline("heart", () => draws++).key, a.key);
  f.outline("tilde", () => draws++);
  assert.equal(draws, 2); assert.equal(f.textures.size, 2);
  assert.deepEqual([a.width, a.height], [72, 72]);
  assert.deepEqual(f.textures.get(a.key), { width: 144, height: 144, scale: [2, 2], translation: [36, 36] });
  a.destroy(); assert.equal(f.textures.size, 2, "Other instances still use the outline");
  f.scene.events.emit("shutdown"); assert.equal(f.textures.size, 0);
  assert.equal(f.scene.events.listenerCount("destroy"), 0);
  assert.notEqual(f.outline("heart", () => draws++).key, a.key);
  f.scene.events.emit("destroy"); assert.equal(f.textures.size, 0);
  assert.equal(f.scene.events.listenerCount("shutdown"), 0);
});

test("a failed outline capture is not cached and other scenes own independent textures", () => {
  const a = fixture(), b = fixture(); let draws = 0;
  assert.throws(() => a.outline("heart", () => { throw Error("draw failed"); }), /draw failed/);
  assert.equal(a.textures.size, 0);
  a.outline("heart", () => draws++); b.outline("heart", () => draws++);
  assert.equal(draws, 2);
  a.scene.events.emit("shutdown"); assert.equal(b.textures.size, 1);
  b.scene.events.emit("destroy"); assert.equal(b.textures.size, 0);
});

function withCanvas(run) {
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) };
  try { run(); } finally { globalThis.document = original; }
}

test("glyphs rasterize once per style, keep logical dimensions and own a high-DPI canvas", () => withCanvas(() => {
  const f = fixture();
  const a = f.glyph(), b = f.glyph();
  assert.equal(f.rasterizations(), 1); assert.equal(a.key, b.key);
  assert.deepEqual([a.width, a.height], [20, 30]);
  assert.deepEqual([f.textures.get(a.key).width, f.textures.get(a.key).height], [40, 60]);
  assert.notEqual(f.glyph("I", "#ff0000").key, a.key);
  a.destroy(); b.destroy();
  assert.equal(f.glyph().key, a.key, "unused glyphs can be reused without rerasterization");
}));

test("unused cache is bounded while live high-rank labels are never evicted", () => withCanvas(() => {
  const f = fixture(), live = f.glyph("live");
  const labels = Array.from({ length: 300 }, (_, i) => f.glyph(String(i)));
  assert.equal(f.textures.size, 301);
  for (const label of labels) label.destroy();
  assert.equal(f.textures.size, 129);
  assert(f.textures.has(live.key));
  live.destroy(); assert.equal(f.textures.size, 128);
}));

test("scene shutdown/destroy release textures once and restart owns an independent cache", () => withCanvas(() => {
  const f = fixture(), old = f.glyph();
  f.scene.events.emit("shutdown");
  assert.equal(f.textures.size, 0);
  assert.equal(f.scene.events.listenerCount("destroy"), 0);
  const next = f.glyph();
  assert.notEqual(next.key, old.key);
  old.destroy(); assert.equal(f.textures.size, 1);
  f.scene.events.emit("destroy"); next.destroy();
  assert.equal(f.textures.size, 0);
  assert.equal(f.scene.events.listenerCount("shutdown"), 0);
}));
