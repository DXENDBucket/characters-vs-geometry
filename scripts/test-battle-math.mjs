import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
import { mathVectors, evaluateVectors, numberBits } from "./helpers/battle-math-vectors.mjs";

const math = createTypeScriptLoader()("src/game/battleMath.ts");
const kernels = ["sin", "cos", "tan", "atan2", "hypot", "pow"];
const require = createRequire(import.meta.url);

test("pinned kernels use pure JavaScript throughout their loaded dependency tree", () => {
  const seen = new Set();
  const visit = module => {
    if (!module || seen.has(module.filename)) return;
    seen.add(module.filename);
    assert.match(module.filename, /\.js$/);
    assert.doesNotMatch(module.filename, /napi|native\.js|bindings/);
    const source = ts.createSourceFile(module.filename, fs.readFileSync(module.filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const walk = node => {
      if (ts.isPropertyAccessExpression(node) && node.expression.getText(source) === "Math") {
        assert.ok(["sqrt", "floor", "abs", "round"].includes(node.name.text), module.filename + ": " + node.getText(source));
      }
      assert.notEqual(node.kind, ts.SyntaxKind.AsteriskAsteriskToken, module.filename);
      ts.forEachChild(node, walk);
    };
    walk(source);
    for (const child of module.children) visit(child);
  };
  for (const name of kernels) visit(require.cache[require.resolve("@stdlib/math-base-special-" + name)]);
  assert.ok(seen.size > 100);
  const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of kernels) assert.match(manifest.dependencies["@stdlib/math-base-special-" + name], /^\d+\.\d+\.\d+$/);
});

test("kernels retain special values and signed-zero conventions", () => {
  assert.ok(Object.is(math.sin(-0), -0)); assert.ok(Object.is(math.tan(-0), -0));
  assert.ok(Object.is(math.sqrt(-0), -0)); assert.equal(math.atan2(-0, -1), -Math.PI);
  assert.ok(Object.is(math.atan2(-0, 1), -0)); assert.equal(math.hypot(Infinity, NaN), Infinity);
  assert.ok(Object.is(math.hypot(-0, -0), 0));
  for (const base of [0, -0, 1, -1, -Infinity, Infinity, NaN]) {
    for (const exponent of [0, -0, .5, -.5, 1, -1, 2, 3, -3, Infinity, -Infinity, NaN]) {
      assert.ok(Object.is(math.pow(base, exponent), Math.pow(base, exponent)), `${base} ^ ${exponent}`);
    }
  }
  assert.equal(numberBits(math.sqrt(2)), "3ff6a09e667f3bcd");
  assert.equal(numberBits(math.sin(1)), "3feaed548f090cee");
  assert.equal(numberBits(math.cos(1)), "3fe14a280fb5068c");
  assert.equal(math.hypot(3, 4), 5);
  assert.equal(math.atan2(-Number.MIN_VALUE, -Number.MAX_VALUE), -Math.PI);
  assert.equal(math.pow(-1, Number.MAX_VALUE), 1);
  assert.equal(math.pow(-1, -Number.MAX_VALUE), 1);
});

test("combat-domain values remain near native results without hiding exact differences in synchronization", () => {
  for (const { name, args } of mathVectors()) {
    const values = args.map(Number), actual = math[name](...values);
    const expected = name === "square" ? values[0] * values[0] : Math[name](...values);
    if (!Number.isFinite(expected)) {
      assert.ok(Object.is(actual, expected), name + " " + args); continue;
    }
    const tolerance = Math.max(Number.MIN_VALUE * 8, Number.EPSILON * 8 * Math.max(1, Math.abs(expected)));
    assert.ok(Math.abs(actual - expected) <= tolerance, `${name}(${args}) ${actual} / ${expected}`);
  }
});

test("all vectors still work when native approximated functions are disabled", () => {
  const vectors = mathVectors(), expected = evaluateVectors(math, vectors), original = {};
  try {
    for (const name of kernels) { original[name] = Math[name]; Math[name] = () => { throw Error("Native " + name); }; }
    assert.deepEqual(evaluateVectors(math, vectors), expected);
  } finally { Object.assign(Math, original); }
});
