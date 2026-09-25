import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const sources = new Map();
function scan(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const name = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) scan(name);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) sources.set(name, fs.readFileSync(path.join(root, name), "utf8"));
  }
}
scan("src");
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const compilerOptions = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, root).options;

// Inspect emitted imports so type-only dependency cycles are not treated as runtime cycles.
function runtimeImports(source) {
  const emitted = ts.transpileModule(source, { compilerOptions }).outputText;
  const ast = ts.createSourceFile("module.js", emitted, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imports = [];
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return imports;
}

const graph = new Map([...sources].map(([name, source]) => [name, runtimeImports(source).map(specifier => {
  if (!specifier.startsWith(".")) return specifier;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier));
  return [base, base + ".ts", base + "/index.ts"].find(candidate => sources.has(candidate)) ?? base;
})]));

function dependencyCycles(graph) {
  const complete = new Set(), active = new Set(), stack = [], cycles = [];
  const visit = name => {
    if (active.has(name)) { cycles.push([...stack.slice(stack.indexOf(name)), name]); return; }
    if (complete.has(name)) return;
    active.add(name); stack.push(name);
    for (const child of graph.get(name) ?? []) visit(child);
    stack.pop(); active.delete(name); complete.add(name);
  };
  for (const name of graph.keys()) visit(name);
  return cycles;
}

test("dependency inspection retains runtime re-exports and lazy imports but ignores type-only edges", () => {
  assert.deepEqual(runtimeImports(`
    import type { Type } from "./type";
    import { erased } from "./unused";
    import { used } from "./value";
    import "./sideEffect";
    export { thing } from "./reexport";
    export type { Shape } from "./shape";
    void used;
    const lazy = () => import("./lazy");
  `), ["./value", "./sideEffect", "./reexport", "./lazy"]);
  assert.deepEqual(dependencyCycles(new Map([["a", ["b"]], ["b", ["a"]]])), [["a", "b", "a"]]);
  assert.deepEqual(dependencyCycles(new Map([["a", ["b"]], ["b", ["c"]], ["c", []]])), []);
});

test("source runtime imports and re-exports remain acyclic", () => {
  assert.deepEqual(dependencyCycles(graph), [], "Extract a shared lower-level rule instead of introducing a runtime import cycle");
});

test("combat controllers schedule data actions rather than engine timers or paused callbacks", () => {
  const modules = ["combatRuntime", "towerCombat", "triggerTowers", "triggerTowerRules", "targetedEffectCards", "targetedEffectRules",
    "towerSkills", "towerSkillSimulation", "enemyRuntime", "enemySimulation", "bossRuntime", "bossSimulation"];
  for (const name of modules) {
    const source = sources.get(`src/game/${name}.ts`);
    assert.ok(source, name);
    assert.doesNotMatch(source, /time\.delayedCall|runWhenBattleActive|scheduleBattleAction\?/, name);
  }
  assert.doesNotMatch(sources.get("src/scenes/GameScene.ts"), /pausedActions|runWhenBattleActive|flushPausedActions/);
});

test("data, geometry, support queries and snapshot capture cannot pull in scenes or rendering", () => {
  const entries = ["enemyState", "towerState", "projectileState", "bossState", "bossRules", "bossSkillRules", "enemyCombatRules", "towerRules",
    "captureBattleSnapshot", "battleDataSchema", "battleEntityIds", "battleEntityGraph", "battleOperations", "battleControls", "tutorialInteraction",
    "tutorial", "tutorialRegistry", "tutorialState", "tutorialPresentation", "battleLifecycle", "battleDiscovery",
    "battleSession", "battleAuthority", "battleSyncProtocol", "battleSyncHost", "battleSyncClient", "battleParticipants", "battlePolicy", "battleChecksum", "battleLoadout", "loadoutReselection", "unitGeometry", "enemySupport",
    "combatStats", "statusEffects", "enemyContainerRules", "slowAura", "battleWorld", "battleRuntime", "waveSpawner", "rules/statusEffectRules",
    "projectileRuntime", "projectileMotion", "projectileBounds", "projectilePresentation", "gatheringRules", "orientationRules",
    "unitLifecycle", "unitLifecyclePresentation", "towerHealthRules", "enemyHealth", "unitStatRules", "towerAuras",
    "enemyReleaseRules", "enemySplitRules", "solarBombRules", "delLaneSweep", "chevronLeader",
    "enemySimulation", "enemySimulationPresentation", "enemyProjectileRules", "enemyBlockingRules", "boardCells",
    "enemySkillExecution", "enemySkillPresentation", "parenthesisRules", "slopeRules",
    "towerTargeting", "cardBehaviorRules", "towerCombat", "towerCombatRuntime", "towerCombatPresentation",
    "triggerTowerRules", "triggerTowerPresentation", "towerSkillSimulation", "towerSkillPresentation",
    "towerSkillRegistry", "orientationSkillRules", "gatheringSkillRules", "pushSkillRules",
    "bossSimulation", "bossSimulationRuntime", "bossSimulationPresentation", "bossSkillRegistry", "enemyPromotionRules", "delSweep",
    "battleEncounter", "battlefieldCells", "towerStorageRules", "towerNullificationRules",
    "projectileCircuitRules", "pipelineRouting", "pipelineRules", "pipelineActionRules", "pipelineActionPayload",
    "targetedEffectRules", "towerAttachmentRules", "towerUpgradeRules", "towerDeploymentRules",
    "towerMirrorRules", "towerCopy", "towerTopology", "towerBoard", "towerShifterRules", "towerPushRules",
    "battleOperationRuntime", "edgeTowerControls", "battleControlRuntime", "battleSetup", "independentBattle", "restoreBattleData", "durableBattleHost", "battleConnection", "battleHostLoop", "battlePlayerView"];
  for (const entry of [...entries, "../registry/cardDefinitions"]) {
    const seen = new Set();
    const visit = (name, chain) => {
      if (seen.has(name)) return;
      seen.add(name);
      const trace = [...chain, name];
      assert.ok(name !== "phaser" && !name.startsWith("src/render/") && !name.startsWith("src/scenes/"), trace.join(" -> "));
      for (const child of graph.get(name) ?? []) visit(child, trace);
    };
    const name = path.posix.normalize("src/game/" + entry + ".ts");
    assert.ok(graph.has(name), name);
    visit(name, []);
  }
});

test("combat code cannot write a player's persistent profile", () => {
  for (const [name, dependencies] of graph) {
    if (!name.startsWith("src/game/") && !name.startsWith("src/bosses/")) continue;
    assert.ok(!dependencies.includes("src/progress.ts") && !dependencies.includes("src/battleProfile.ts"), name);
  }
});

test("independent battle boot, controls and restoration have no browser or wall-clock globals", () => {
  const forbidden = new Set(["window", "document", "navigator", "localStorage", "sessionStorage", "Date", "performance", "crypto",
    "setTimeout", "setInterval", "requestAnimationFrame"]);
  const seen = new Set();
  const visit = name => {
    if (seen.has(name) || !sources.has(name)) return;
    seen.add(name);
    const ast = ts.createSourceFile(name, ts.transpileModule(sources.get(name), { compilerOptions }).outputText, ts.ScriptTarget.Latest, true);
    const walk = node => {
      if (ts.isIdentifier(node)) assert.ok(!forbidden.has(node.text), name + ": " + node.text);
      ts.forEachChild(node, walk);
    };
    walk(ast);
    for (const child of graph.get(name) ?? []) visit(child);
  };
  visit("src/game/independentBattle.ts");
  visit("src/game/durableBattleHost.ts");
  assert.ok(seen.size > 100);
});

test("the independent battle graph cannot use implementation-approximated native math", () => {
  const allowed = new Set(["abs", "ceil", "clz32", "floor", "fround", "imul", "max", "min", "round", "sign", "sqrt", "trunc",
    "E", "LN10", "LN2", "LOG10E", "LOG2E", "PI", "SQRT1_2", "SQRT2"]);
  const seen = new Set();
  const visit = name => {
    if (seen.has(name) || !sources.has(name)) return;
    seen.add(name);
    const ast = ts.createSourceFile(name, sources.get(name), ts.ScriptTarget.Latest, true);
    const walk = node => {
      if (ts.isIdentifier(node) && node.text === "Math") {
        assert.ok((ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) &&
          node.parent.expression === node, `${name}: do not alias or destructure native Math in combat`);
      }
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        ts.isIdentifier(node.expression) && node.expression.text === "Math") {
        const key = ts.isPropertyAccessExpression(node) ? node.name.text :
          ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : undefined;
        assert.ok(allowed.has(key), `${name}: ${node.getText(ast)}; use battleMath for approximated operations`);
      }
      assert.notEqual(node.kind, ts.SyntaxKind.AsteriskAsteriskToken, `${name}: use battleMath.pow or square`);
      ts.forEachChild(node, walk);
    };
    walk(ast);
    for (const child of graph.get(name) ?? []) visit(child);
  };
  visit("src/game/battleRuntime.ts");
  visit("src/game/independentBattle.ts");
  assert.ok(seen.size > 100);
});
