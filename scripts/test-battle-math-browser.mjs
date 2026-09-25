import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "vite";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
import { mathVectors, evaluateVectors } from "./helpers/battle-math-vectors.mjs";
const option = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const engines = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const vectors = mathVectors(), math = createTypeScriptLoader()("src/game/battleMath.ts"), expected = evaluateVectors(math, vectors);
// Exercise production CommonJS conversion and minification as well as Vite's dev modules.
const bundle = await build({ configFile: false, logLevel: "silent", build: {
  write: false, minify: "esbuild", lib: { entry: fileURLToPath(new URL("../src/game/battleMath.ts", import.meta.url)),
    name: "BattleMathTest", formats: ["iife"] }
} });
const bundledCode = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(result => result.output)
  .filter(file => file.type === "chunk").map(file => file.code).join("\n");
assert.ok(bundledCode.length > 1000);
const results = [];
for (const engine of (option("engines") ?? "chromium,firefox,webkit").split(",")) {
  const browser = await engines[engine].launch({ executablePath: engine === "chromium" ? option("browser") : undefined, headless: true });
  try {
    const page = await browser.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/src/main.ts*", route => route.fulfill({ contentType: "application/javascript", body: "" }));
    await page.goto(option("url") ?? "http://127.0.0.1:5173");
    const actual = await page.evaluate(async vectors => {
      for (const name of ["sin", "cos", "tan", "atan2", "hypot", "pow"]) Math[name] = () => { throw Error("Native " + name); };
      const math = await import("/src/game/battleMath.ts");
      const { evaluateVectors } = await import("/scripts/helpers/battle-math-vectors.mjs");
      return evaluateVectors(math, vectors);
    }, vectors);
    for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i], engine + " " + JSON.stringify(vectors[i]));
    await page.addScriptTag({ content: bundledCode });
    const production = await page.evaluate(async vectors => {
      const { evaluateVectors } = await import("/scripts/helpers/battle-math-vectors.mjs");
      return evaluateVectors(window.BattleMathTest, vectors);
    }, vectors);
    for (let i = 0; i < expected.length; i++) assert.equal(production[i], expected[i], engine + " bundled " + JSON.stringify(vectors[i]));
    assert.deepEqual(errors, []); results.push({ engine, vectors: vectors.length, exact: true, bundled: true });
  } finally { await browser.close(); }
}
console.log("Exact binary64 kernels across engines, with native approximated functions disabled", results);
