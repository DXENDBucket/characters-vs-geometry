import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();

const { outputText } = ts.transpileModule(
  fs.readFileSync(new URL("../src/render/combatEffects.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
);
const trailModule = ts.transpileModule(
  fs.readFileSync(new URL("../src/render/projectileTrail.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
);
const trails = {};
new Function("exports", trailModule.outputText)(trails);
const delModule = ts.transpileModule(
  fs.readFileSync(new URL("../src/render/delBoss.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
);
const del = {};
new Function("exports", delModule.outputText)(del);
const effects = {};
new Function("require", "exports", outputText)(name => {
  if (name === "phaser") return { default: {} };
  if (name === "../config") return { palette: { white: 0xffffff, black: 0, green: 0x48ff88 } };
  if (name === "../data/damageColors") return load("src/data/damageColors.ts");
  if (name === "../i18n") return { EFFECT_SYMBOLS: { chars: "Aa" } };
  if (name === "../bosses/cubeBoss") return {};
  if (name === "./projectileTrail") return trails;
  if (name === "./delBoss") return del;
  throw new Error(`Unexpected import: ${name}`);
}, effects);

function fixture() {
  const objects = [];
  let pending = [];
  const scene = {
    events: new EventEmitter(),
    tweens: { add: tween => pending.push(tween), killTweensOf: () => {} },
    add: {}
  };
  for (const kind of ["graphics", "rectangle", "circle", "text"]) {
    scene.add[kind] = () => {
      const object = { scene, kind, destroy() { this.scene = undefined; } };
      const proxy = new Proxy(object, {
        get(target, key) {
          if (key in target) return target[key];
          return () => {
            assert.ok(target.scene, `Used a destroyed ${kind}: ${String(key)}`);
            return proxy;
          };
        }
      });
      objects.push(proxy);
      return proxy;
    };
  }
  return {
    scene, objects,
    complete() {
      const callbacks = pending;
      pending = [];
      for (const tween of callbacks) tween.onComplete?.();
    },
    end(event = "shutdown") {
      scene.events.emit(event);
      for (const object of objects) object.destroy();
    }
  };
}

function emitAll(scene, amount = 25) {
  effects.makeEraseMark(scene, 400, 300);
  effects.makeShockPulse(scene, 400, 300, 80, 80);
  effects.makeAutoUpgradePulse(scene, 400, 300);
  effects.makeProductionPulse(scene, 400, 300, amount);
}

test("DEL orbits have rounded zero glyphs and deterministic animation", () => {
  let paths = [], path;
  const graphics = {
    clear() { paths = []; }, lineStyle() {},
    beginPath() { path = []; paths.push(path); },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    strokePath() {}, lineBetween() {}
  };
  for (const radius of [22, 111]) {
    del.drawDelBoss(graphics, radius, 1200);
    const initial = structuredClone(paths);
    const zeros = paths.filter(points => points.length === 25);
    assert.equal(zeros.length, radius < 40 ? 64 : 112);
    assert.ok(paths.flat(2).every(Number.isFinite));
    assert.ok(paths.flat(2).every(value => Math.abs(value) < radius * 1.1));
    for (const points of zeros) {
      assert.ok(Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1e-8);
    }
    del.drawDelBoss(graphics, radius, 1200);
    assert.deepEqual(paths, initial);
    del.drawDelBoss(graphics, radius, 1400);
    assert.notDeepEqual(paths, initial);
  }
});

test("DEL contact effects reuse one graphics object", () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) {
    effects.makeDelCollapse(f.scene, 400, 300);
    f.complete();
  }
  assert.equal(f.objects.length, 1);
  f.end();
});

test("DEL name stays between rear and front glyphs, with opaque local occlusion", () => {
  let paths, path, style;
  const graphics = {
    clear() { paths = []; }, lineStyle(...args) { style = args; },
    beginPath() { path = { points: [], style }; paths.push(path); },
    moveTo(x, y) { path.points.push([x, y]); },
    lineTo(x, y) { path.points.push([x, y]); }, strokePath() {}, lineBetween() {}
  };
  for (const time of [0, 500, 1200, 3300, 7000]) {
    del.drawDelBoss(graphics, 111, time);
    const nameStart = paths.findIndex(p => p.points.length === 7);
    const nameEnd = paths.findLastIndex(p => ![5, 25].includes(p.points.length));
    const rear = paths.slice(0, nameStart).filter(p => p.style[1] === 0xf5f5f5);
    const front = paths.slice(nameEnd + 1).filter(p => p.style[1] === 0xf5f5f5);
    assert.ok(rear.length && front.length);
    assert.ok(rear.every(p => p.style[2] <= .73 + 1e-12));
    assert.ok(front.every(p => p.style[2] >= .73 - 1e-12));
    for (const p of [...rear, ...front]) {
      const underlay = paths[paths.indexOf(p) - 1];
      assert.equal(underlay.style[1], 0x050505);
      assert.equal(underlay.style[2], 1);
      assert.ok(underlay.style[0] > p.style[0]);
      assert.deepEqual(underlay.points, p.points);
    }
  }
});

test("DEL error flashes affect its name but leave both binary rings unchanged", () => {
  let paths, path, style;
  const graphics = {
    clear() { paths = []; }, lineStyle(...args) { style = args; },
    beginPath() { path = { points: [], style }; paths.push(path); },
    moveTo(x, y) { path.points.push([x, y]); },
    lineTo(x, y) { path.points.push([x, y]); }, strokePath() {}, lineBetween() {}
  };
  const rings = () => paths.filter(p => [5, 25].includes(p.points.length));
  for (const invincible of [false, true]) {
    for (const time of [160, 240]) {
      del.drawDelBoss(graphics, 111, time, invincible, false);
      const normalRings = structuredClone(rings());
      del.drawDelBoss(graphics, 111, time, invincible, true);
      assert.deepEqual(rings(), normalRings);
      const name = paths.filter(p => p.points.length === 7 && p.style[1] !== 0x050505).at(-1);
      assert.equal(name.style[1], time === 160 ? 0xff4d4d : invincible ? 0xffd75a : 0xf5f5f5);
    }
  }
});

test("DEL sweep uses gold name flashes instead of coloring the rings or red skill flashes", () => {
  let paths, path, style;
  const graphics = {
    clear() { paths = []; }, lineStyle(...args) { style = args; },
    beginPath() { path = { points: [], style }; paths.push(path); },
    moveTo(x, y) { path.points.push([x, y]); },
    lineTo(x, y) { path.points.push([x, y]); }, strokePath() {}, lineBetween() {}
  };
  for (const time of [160, 240]) {
    del.drawDelBoss(graphics, 111, time, true, true, true);
    const rings = paths.filter(p => [5, 25].includes(p.points.length) && p.style[1] !== 0x050505);
    assert.ok(rings.every(p => p.style[1] === 0xf5f5f5));
    assert.ok(paths.every(p => p.style[1] !== 0xff4d4d && p.style[1] !== 0xff6464));
    const name = paths.filter(p => p.points.length === 7 && p.style[1] !== 0x050505).at(-1);
    assert.equal(name.style[1], time === 160 ? 0xffd75a : 0xf5f5f5);
  }
});

test("all four effect pools reuse live objects within a battle, including pause/resume", () => {
  const f = fixture();
  emitAll(f.scene);
  f.complete();
  f.scene.events.emit("pause");
  f.scene.events.emit("resume");
  emitAll(f.scene, 50);
  assert.equal(f.objects.length, 4);
  assert.equal(f.scene.events.listenerCount("shutdown"), 1);
  assert.equal(f.scene.events.listenerCount("destroy"), 1);
});

test("ion impacts reuse four objects, emit one audio cue, and clear after scene restart", () => {
  const f = fixture();
  const positions = [];
  f.scene.events.on("ion-impact", x => positions.push(x));
  for (let i = 0; i < 30; i++) {
    effects.makeIonImpact(f.scene, 400 + i, 300, 180, 0xafffcb);
    f.complete();
  }
  assert.equal(f.objects.length, 4);
  assert.equal(positions.length, 30);
  assert.equal(positions.at(-1), 429);
  f.end();
  effects.makeIonImpact(f.scene, 400, 300, 180, 0xafffcb);
  f.complete();
  assert.equal(f.objects.length, 8);
});

test("projectile trails keep bounded same-color samples and clean up on body destruction", () => {
  const body = new EventEmitter();
  let segments = [];
  let style;
  let destroyed = 0;
  const graphics = {
    setDepth() { return this; }, setName() { return this; },
    clear() { segments = []; return this; },
    lineStyle(...args) { style = args; },
    lineBetween(...args) { segments.push({ style, points: args }); },
    destroy() { destroyed++; }
  };
  const scene = { add: { graphics: () => graphics } };
  trails.attachProjectileTrail(scene, body, 0x9fdcff, 119);
  for (let time = 0; time <= 10000; time += 16) {
    trails.updateProjectileTrail(body, time, time / 2, time);
    assert.ok(segments.length <= 16);
    assert.ok(segments.every(s => s.style[1] === 0x9fdcff));
  }
  assert.ok(segments.length > 1);
  assert.ok(segments[0].style[2] > segments.at(-1).style[2]);
  const paused = structuredClone(segments);
  trails.updateProjectileTrail(body, 10000, 5000, 10000);
  assert.deepEqual(segments, paused);
  trails.updateProjectileTrail(body, 0, 0, 0);
  assert.equal(segments.length, 1);
  body.emit("destroy");
  assert.equal(destroyed, 1);
  assert.equal(body.listenerCount("destroy"), 0);
  trails.removeProjectileTrail(body);
  assert.equal(destroyed, 1);
  trails.attachProjectileTrail(scene, body, 0xffffff, 119);
  trails.removeProjectileTrail(body);
  assert.equal(destroyed, 2);
  assert.equal(body.listenerCount("destroy"), 0);
});

test("restart clears all pooled objects and does not accumulate lifecycle listeners", () => {
  const f = fixture();
  for (let run = 0; run < 12; run++) {
    emitAll(f.scene, run);
    f.complete();
    assert.equal(f.objects.length, (run + 1) * 4);
    f.end();
    assert.equal(f.scene.events.listenerCount("shutdown"), 0);
    assert.equal(f.scene.events.listenerCount("destroy"), 0);
  }
});

test("direct scene destruction also invalidates pools", () => {
  const f = fixture();
  emitAll(f.scene);
  f.complete();
  f.end("destroy");
  emitAll(f.scene, 50);
  assert.equal(f.objects.length, 8);
});

test("objects destroyed individually are discarded, not reused", () => {
  const f = fixture();
  emitAll(f.scene);
  f.complete();
  for (const object of f.objects) object.destroy();
  emitAll(f.scene, 50);
  assert.equal(f.objects.length, 8);
});

test("late tween completions cannot revive old pools or touch destroyed objects", () => {
  const f = fixture();
  emitAll(f.scene);
  f.end();
  f.complete();
  assert.equal(f.scene.events.listenerCount("shutdown"), 0);
  emitAll(f.scene, 50);
  assert.equal(f.objects.length, 8);
});

test("shutting down one scene does not clear another scene's pools", () => {
  const a = fixture();
  const b = fixture();
  emitAll(a.scene);
  emitAll(b.scene);
  a.complete();
  b.complete();
  a.end();
  emitAll(b.scene, 50);
  assert.equal(b.objects.length, 4);
});
