import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { load, runtimeFromOptions, battleChecksum, captureBattleSnapshot, step, cloneCheckpoint } from "./helpers/battle-runtime.mjs";
const { decodeSaveGraph, canonicalSaveGraph } = load("src/game/saveGraph.ts");
function authoritativeGraph(graph) {
  for (const node of graph.nodes) {
    if (node.kind === "boss") for (const key of ["rotationX", "rotationY", "rotationZ", "velocityX", "velocityY", "velocityZ", "targetVelocityX", "targetVelocityY", "targetVelocityZ", "nextTurnIn"]) delete node.data[key];
    delete node.data.selectedCardId;
  }
  return canonicalSaveGraph(graph);
}
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const fixtures = await page.evaluate(async onlyCase => {
    const mod = path => import(performance.getEntriesByType("resource").map(e => e.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const { GameScene } = await mod("/src/scenes/GameScene.ts"), progress = await mod("/src/progress.ts");
    const { captureBattleSnapshot } = await mod("/src/game/captureBattleSnapshot.ts");
    const { getTowerSkillState } = await mod("/src/game/skillState.ts");
    const { towerOperationRef } = await mod("/src/game/battleOperations.ts");
    const { BATTLE_STEP_MS } = await mod("/src/game/battleSimulation.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const cases = ["1-9", "2-10", "5-5", "5-10", "5-10:P2", "5-10:P3", "5-10:P4", "AE-5", "AE-10", "AE-EX-2", "IF-BE-4"];
    const results = [];
    for (const [index, name] of cases.entries()) {
      if (onlyCase && name !== onlyCase) continue;
      const [levelId, phase] = name.split(":");
      const key = "Runtime" + index;
      game.scene.add(key, new GameScene(key), false);
      game.scene.start(key, { levelId, difficulty: 3, seed: 714 + index, persistProgress: false,
        selectedCards: ["A", "m", "[]", "u", "0", "1", "=", "f", "S", "e"] });
      const scene = game.scene.getScene(key), runtime = scene.runtime;
      const options = scene.session.exportReplay(), worldOptions = runtime.world.options, initial = scene.battleChecksum();
      runtime.world.chars = 100000;
      runtime.world.baseIntegrity = 100;
      scene.session.controls.autoUpgradeEnabled = false;
      if (phase) {
        runtime.world.bossPhaseIndex = Number(phase.slice(1)) - 1;
        runtime.encounter.resetBoss(runtime.world.boss);
        runtime.world.applyBossPhaseStats(runtime.world.boss);
        scene.applyBossPhaseSkillState(runtime.world.boss);
      }
      const place = (card, lane, column) => {
        runtime.world.loadout.byId.get(card).readyAt = 0;
        const result = runtime.executeOperation("local", { type: "deploy", card, cell: { lane, column }, expected: null });
        if (result !== "deployed") throw Error(card + " " + result);
        return runtime.world.towers.find(t => t.type === card && t.lane === lane && t.column === column);
      };
      place("A", 0, 8); place("[]", 0, 8); place("m", 0, 9);
      place("u", 2, 8); place("A", 2, 9); place("e", 3, 8);
      for (const lane of [1, 3, 4, 5]) place("A", lane, 10);
      const source = place("f", 6, 0); place("0", 6, 1); place("1", 6, 9);
      for (let column = 0; column < 9; column++) runtime.world.edgeTowers.push(runtime.world.entityIds.identify("edge", {
        type: "=", axis: "horizontal", lane: 6, column, mode: ">", level: 1
      }));
      runtime.circuit.sync(); runtime.triggerShockTower(source);
      const mortar = place("S", 4, 1);
      getTowerSkillState(mortar, "spellMortar").sp = 60;
      if (runtime.executeOperation("local", { type: "skill", targets: [towerOperationRef(mortar)], skill: "S", point: { x: 1000, y: 400 } }) !== "handled") throw Error("Mortar skill did not fire");
      const graph = captureBattleSnapshot(scene.battleState()), checkpoints = [{ tick: 0, hash: scene.battleChecksum() }];
      const adapter = { step: () => scene.stepBattle(), executeCommand() { throw Error("Unexpected queued UI command"); }, canAdvance: () => !scene.gameOver };
      for (let tick = 1; tick <= 3600; tick++) {
        scene.session.advance(BATTLE_STEP_MS, adapter);
        if (tick % 300 === 0) checkpoints.push({ tick, hash: scene.battleChecksum(), graph: captureBattleSnapshot(scene.battleState()) });
      }
      results.push({ name, options, worldOptions, initial, graph, checkpoints,
        seen: { wave: scene.wave, defeated: scene.enemiesDefeated, entities: scene.world.entityIds.snapshot().nextId, phase: scene.bossPhaseIndex } });
      game.scene.remove(key);
    }
    return results;
  }, option("case"));
  const results = [];
  for (const fixture of fixtures) {
    const fresh = runtimeFromOptions(fixture.options, fixture.worldOptions);
    fresh.initialize();
    const selected = fixture.options.selectedCards[0];
    assert.equal(battleChecksum(fresh.snapshot(selected)), fixture.initial, fixture.name + " fresh default factories differ");
    const runtime = runtimeFromOptions(fixture.options, fixture.worldOptions);
    runtime.restore(decodeSaveGraph(fixture.graph, () => ({})));
    let restored, crossEngineCoordinateDifferences = 0;
    for (const checkpoint of fixture.checkpoints) {
      const count = checkpoint.tick === 0 ? 0 : 300;
      step(runtime, count);
      if (restored) {
        step(restored, count);
        assert.deepEqual(authoritativeGraph(captureBattleSnapshot(restored.snapshot(selected))), authoritativeGraph(captureBattleSnapshot(runtime.snapshot(selected))),
          fixture.name + " exact Node state continuation at " + checkpoint.tick);
      }
      if (checkpoint.graph && battleChecksum(runtime.snapshot(selected)) !== checkpoint.hash) {
        const actual = authoritativeGraph(captureBattleSnapshot(runtime.snapshot(selected))), expected = authoritativeGraph(checkpoint.graph);
        const differences = [];
        const compare = (a, b, path = "root") => {
          if (Object.is(a, b)) return;
          if (a && b && typeof a === "object" && typeof b === "object") {
            for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(a[key], b[key], path + "." + key);
          } else differences.push({ path, actual: a, expected: b });
        };
        compare(actual, expected);
        assert.ok(differences.length, fixture.name + " checksum mismatch without a canonical data difference");
        for (const diff of differences) {
          assert.match(diff.path, /^root\.nodes\.\d+\.data\.(x|y|vx|vy)$/);
          assert.ok(typeof diff.actual === "number" && typeof diff.expected === "number" && Math.abs(diff.actual - diff.expected) <= 1e-10,
            fixture.name + " divergent battle state " + JSON.stringify(diff));
        }
        crossEngineCoordinateDifferences += differences.length;
        if (option("strict") === "true") assert.equal(battleChecksum(runtime.snapshot(selected)), checkpoint.hash,
          fixture.name + " strict cross-engine checksum at " + checkpoint.tick + ": " + JSON.stringify(differences[0]));
      } else {
        assert.equal(battleChecksum(runtime.snapshot(selected)), checkpoint.hash, fixture.name + " Node vs actual browser at " + checkpoint.tick);
      }
      if (checkpoint.tick === 1500) restored = cloneCheckpoint(runtime, fixture.options, true);
    }
    results.push({ name: fixture.name, browserHash: fixture.checkpoints.at(-1).hash, crossEngineCoordinateDifferences, ...fixture.seen });
  }
  assert.deepEqual(errors, []);
  console.log("Diagnostic Node/browser state comparison (coordinate tolerance 1e-10; exact Node state continuation; not proof of cross-engine checksum agreement)", results);
} finally { await browser.close(); }
