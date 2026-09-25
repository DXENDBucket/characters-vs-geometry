import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const playwright = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const engine = option("engine") ?? "chromium", seconds = Number(option("seconds") ?? 60), cycles = Number(option("cycles") ?? 3);
const mortars = Number(option("mortars") ?? 35), small = process.argv.includes("--small");
assert.ok(["chromium", "firefox", "webkit"].includes(engine));
assert.ok(Number.isSafeInteger(seconds) && seconds >= 5 && seconds <= 600);
assert.ok(Number.isSafeInteger(cycles) && cycles >= 1 && cycles <= 10);
assert.ok(Number.isSafeInteger(mortars) && mortars >= 0 && mortars <= 140);
const browser = await playwright[engine].launch({ headless: true, executablePath: engine === "chromium" ? option("browser") : undefined });
try {
  const page = await browser.newPage({ viewport: small ? { width: 800, height: 600 } : { width: 1410, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const progress = await import("/src/progress.ts");
    const game = window.__testGame; game.loop.stop();
    progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const listeners = emitter => Object.fromEntries(emitter.eventNames().map(name => [String(name), emitter.listenerCount(name)]).sort());
    window.pressureResources = () => ({ textures: Object.keys(game.textures.list).sort(), canvases: document.querySelectorAll("canvas").length,
      gameListeners: listeners(game.events), inputListeners: listeners(game.input.events) });
    window.pressureBaseline = window.pressureResources();
  });
  let retiredSceneListeners;
  console.log(JSON.stringify({ diagnostic: "Continuous headless browser wall-clock render; independent replay comparison, not network latency", engine, browser: browser.version(), seconds, cycles, mortars, small }));
  for (let cycle = 0; cycle < cycles; cycle++) {
    const deadline = setTimeout(() => void browser.close(), (seconds + 90) * 1000);
    try {
      const result = await page.evaluate(async ({ seconds, mortars }) => {
        const mod = path => import(performance.getEntriesByType("resource").map(e => e.name)
          .find(url => new URL(url).pathname === path) ?? path);
        const { PRESSURE_CARDS, populatePipelinePressure, pipelinePressureCensus } = await mod("/scripts/helpers/pipeline-pressure.mjs");
        const { createIndependentBattle } = await mod("/src/game/independentBattle.ts");
        const { captureBattleSnapshot } = await mod("/src/game/captureBattleSnapshot.ts");
        const { restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
        const { battleChecksum } = await mod("/src/game/battleChecksum.ts");
        const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = await mod("/src/game/battleSimulation.ts");
        const { LEGACY_BATTLE_POLICY } = await mod("/src/game/battlePolicy.ts");
        const { upgradeTowerLevel, applyTowerUpgradeStats } = await mod("/src/game/towerUpgradeRules.ts");
        const { getCardDefinition } = await mod("/src/registry/cardDefinitions.ts");
        const config = await mod("/src/config.ts"), game = window.__testGame;
        const check = (value, message) => { if (!value) throw Error(message); };
        const hash = runtime => battleChecksum(runtime.snapshot(PRESSURE_CARDS[0]));
        const options = { version: BATTLE_RULES_VERSION, levelId: "IF-1", difficultyVersion: config.DIFFICULTY_VERSION,
          difficulty: 3, seed: 178, debug: false, unlimitedFirepower: false, selectedCards: PRESSURE_CARDS, policy: LEGACY_BATTLE_POLICY };
        const prepared = createIndependentBattle(options);
        const { closedEdges } = populatePipelinePressure(prepared, { config, BATTLE_STEP_MS, upgradeTowerLevel, applyTowerUpgradeStats, getCardDefinition }, mortars);
        for (let tick = 0; tick < (mortars ? 12 : 70) * 60; tick++) prepared.session.advance(BATTLE_STEP_MS, prepared.sessionRuntime);
        const graph = captureBattleSnapshot(prepared.snapshot(PRESSURE_CARDS[0]));
        game.scene.start("GameScene", { ...options, persistProgress: false });
        const scene = game.scene.getScene("GameScene");
        scene.applyBattleSave(restoreBattleSnapshot(scene, graph));
        const runtime = scene.runtime;
        check(hash(runtime) === hash(prepared), "Rendered checkpoint differs before continuous run");
        const initial = pipelinePressureCensus(runtime), samples = [], costs = [], intervals = [];
        const displayObjects = () => {
          const objects = [...scene.children.list];
          for (let i = 0; i < objects.length; i++) if (Array.isArray(objects[i].list)) objects.push(...objects[i].list);
          return objects;
        };
        const counters = { captured: 0, intercepted: 0, shielded: 0 };
        for (const key of Object.keys(counters)) {
          const original = runtime.circuit.presentation[key];
          runtime.circuit.presentation[key] = (...args) => { counters[key]++; original(...args); };
        }
        const peaks = { stored: 0, fullBanks: 0, mortars: 0, trails: 0, tweens: 0, objects: 0 };
        let started = performance.now(), frameStart, previous, nextSample = started, opened = false, litPixels = 0;
        const before = () => {
          frameStart = performance.now();
          if (previous !== undefined) intervals.push(frameStart - previous);
          previous = frameStart;
          if (!mortars && !opened && frameStart - started >= seconds * 500) {
            opened = true;
            for (const id of closedEdges) runtime.session.submit({ type: "operation", actorId: "local",
              operation: { type: "edgeMode", target: { kind: "edge", id }, mode: "=" } }, command => runtime.executeCommand(command));
          }
        };
        const after = () => {
          costs.push(performance.now() - frameStart);
          const census = pipelinePressureCensus(runtime);
          const objects = displayObjects();
          const current = { ...census, trails: objects.filter(child => child.name === "projectile-trail").length,
            tweens: scene.tweens.tweens.length, objects: objects.length };
          for (const key of Object.keys(peaks)) peaks[key] = Math.max(peaks[key], current[key]);
          if (performance.now() >= nextSample) {
            samples.push({ elapsedMs: performance.now() - started, ...current, textures: Object.keys(game.textures.list).length });
            nextSample += 1000;
            const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 95;
            const context = canvas.getContext("2d"); context.drawImage(game.canvas, 0, 0, 160, 95);
            const pixels = context.getImageData(0, 0, 160, 95).data;
            let lit = 0;
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 90) lit++;
            litPixels = Math.max(litPixels, lit);
          }
        };
        game.events.on("prestep", before); game.events.on("postrender", after);
        try {
          game.loop.start(game.step.bind(game));
          await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        } finally {
          game.loop.stop(); game.events.off("prestep", before); game.events.off("postrender", after);
        }
        const elapsedMs = performance.now() - started, final = pipelinePressureCensus(runtime), replay = runtime.session.exportReplay();
        check(costs.length > seconds * 5, "Continuous render loop barely advanced");
        check(final.tick > initial.tick + seconds * 30 && !final.gameOver, "Pressure workload stopped advancing");
        check(litPixels > 100, "Pressure canvas is blank");
        if (mortars) check(peaks.mortars > 0 && peaks.trails > 0 && counters.intercepted > 0 && counters.shielded > 0,
          `Missing mortar/trail/interception/shield workload: ${JSON.stringify({ peaks, counters })}`);
        else check(peaks.fullBanks > 0 && final.stored < peaks.stored, "Banks never saturated and drained");
        const reference = createIndependentBattle(replay, { playback: replay });
        while (!reference.session.playbackComplete) {
          const tick = reference.session.clock.tick;
          reference.session.advance(BATTLE_STEP_MS, reference.sessionRuntime);
          check(reference.session.clock.tick > tick, "Independent replay stopped early");
        }
        check(hash(runtime) === hash(reference), "Continuous rendering changed authoritative state");
        const summary = values => {
          values.sort((a, b) => a - b);
          return { medianMs: values[Math.floor(values.length / 2)], p95Ms: values[Math.ceil(values.length * .95) - 1], maxMs: values.at(-1) };
        };
        return { elapsedMs, initial, final, peaks, counters, frames: costs.length, cpuFrame: summary(costs),
          frameInterval: summary(intervals), litPixels, checksum: hash(runtime), samples };
      }, { seconds, mortars });
      if (option("screenshot")) await page.screenshot({ path: option("screenshot") });
      const cleanup = await page.evaluate(() => {
        const game = window.__testGame, scene = game.scene.getScene("GameScene");
        game.scene.stop("GameScene");
        const listeners = emitter => Object.fromEntries(emitter.eventNames().map(name => [String(name), emitter.listenerCount(name)]).sort());
        return { baseline: window.pressureBaseline, resources: window.pressureResources(), children: scene.children.length,
          tweens: scene.tweens.tweens.length, timers: scene.time._active.length + scene.time._pendingInsertion.length + scene.time._pendingRemoval.length,
          activeScenes: game.scene.getScenes(true).length,
          sceneListeners: { events: listeners(scene.events), input: listeners(scene.input), keyboard: listeners(scene.input.keyboard) } };
      });
      assert.deepEqual(cleanup.resources, cleanup.baseline, "Scene shutdown retained resources or global listeners");
      assert.equal(cleanup.children + cleanup.tweens + cleanup.timers + cleanup.activeScenes, 0);
      if (retiredSceneListeners) assert.deepEqual(cleanup.sceneListeners, retiredSceneListeners, "Retired scene listeners accumulated between runs");
      retiredSceneListeners = cleanup.sceneListeners;
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ cycle: cycle + 1, ...result, cleanup: "baseline restored" }));
    } finally { clearTimeout(deadline); }
  }
} finally { await browser.close(); }
