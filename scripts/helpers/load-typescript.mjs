import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const requirePackage = createRequire(import.meta.url);
export function loadExternal(specifier) {
  const value = requirePackage(specifier);
  return value?.__esModule ? value : Object.assign({ default: value }, value);
}

export function createTypeScriptLoader(overrides = {}, globals = {}) {
  const modules = new Map();
  function load(name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    const filename = path.resolve(root, name);
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    });
    new Function("require", "exports", "window", "navigator", outputText)(specifier => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (!specifier.startsWith(".")) return loadExternal(specifier);
      return load(path.relative(root, path.resolve(path.dirname(filename), `${specifier}.ts`)).replaceAll("\\", "/"));
    }, exports, Object.hasOwn(globals, "window") ? globals.window : { localStorage: { getItem: () => null, setItem() {} } },
      Object.hasOwn(globals, "navigator") ? globals.navigator : { language: "en" });
    return exports;
  }
  return load;
}
