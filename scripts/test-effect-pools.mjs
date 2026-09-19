import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const { outputText } = ts.transpileModule(
  fs.readFileSync(new URL("../src/render/combatEffects.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
);
const effects = {};
new Function("require", "exports", outputText)(name => {
  if (name === "phaser") return { default: {} };
  if (name === "../config") return { palette: { white: 0xffffff, black: 0, green: 0x48ff88 } };
  if (name === "../i18n") return { EFFECT_SYMBOLS: { chars: "Aa" } };
  if (name === "../bosses/cubeBoss") return {};
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
