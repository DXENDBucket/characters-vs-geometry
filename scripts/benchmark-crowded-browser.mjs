import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const modulePath = option("playwright");
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const counts = (option("counts") ?? "100,400,800").split(",").map(Number);
assert.ok(counts.every(n => Number.isSafeInteger(n) && n > 0 && n <= 5000));
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1410, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  console.log(JSON.stringify({ diagnostic: "Headless Chromium mixed battle, one fixed tick per rendered frame; not player FPS or network latency",
    browser: browser.version() }));
  for (const count of counts) {
    const result = await page.evaluate(async count => {
      const mod = path => import(performance.getEntriesByType("resource").map(e => e.name)
        .find(url => new URL(url).pathname === path) ?? path);
      const { populateCrowdedBattle, crowdedCensus, CROWDED_CARDS } = await mod("/scripts/helpers/crowded-battle.mjs");
      const config = await mod("/src/config.ts");
      const progress = await mod("/src/progress.ts");
      const { BATTLE_STEP_MS } = await mod("/src/game/battleSimulation.ts");
      const { captureBattleSnapshot } = await mod("/src/game/captureBattleSnapshot.ts");
      const { createIndependentBattle } = await mod("/src/game/independentBattle.ts");
      const { battleChecksum } = await mod("/src/game/battleChecksum.ts");
      const check = (value, message) => { if (!value) throw Error(message); };
      const summarize = values => {
        const sorted = [...values].sort((a, b) => a - b);
        return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1],
          maxMs: sorted.at(-1) };
      };
      const game = window.__testGame;
      game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start("GameScene", { levelId: "5-10", seed: 178, selectedCards: CROWDED_CARDS, difficulty: 3 });
      const scene = game.scene.getScene("GameScene"), runtime = scene.runtime;
      populateCrowdedBattle(runtime, count, config);
      for (let tick = 0; tick < 180; tick++) scene.update(0, BATTLE_STEP_MS);
      const initial = crowdedCensus(runtime);
      const replay = runtime.session.checkpointReplay(captureBattleSnapshot(runtime.snapshot(CROWDED_CARDS[0])), CROWDED_CARDS);
      const reference = createIndependentBattle(replay, { checkpoint: replay.checkpoint });
      const frameCosts = [], intervals = [];
      let previous;
      for (let frame = 0; frame < 72; frame++) {
        const time = await new Promise(resolve => requestAnimationFrame(resolve));
        if (previous !== undefined) intervals.push(time - previous);
        previous = time;
        const start = performance.now(); game.step(time, BATTLE_STEP_MS); frameCosts.push(performance.now() - start);
      }
      for (let tick = 0; tick < 72; tick++) reference.session.advance(BATTLE_STEP_MS, reference.sessionRuntime);
      const checksum = battleChecksum(runtime.snapshot(CROWDED_CARDS[0]));
      check(runtime.session.clock.tick === initial.tick + 72, "Rendered scene missed ticks");
      check(checksum === battleChecksum(reference.snapshot(CROWDED_CARDS[0])), "Rendering changed simulation state");
      check(!runtime.world.gameOver, "Fixture ended prematurely");
      // Read back the actual render in this task before the WebGL drawing buffer clears.
      game.step(performance.now(), 0);
      const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 95;
      const context = canvas.getContext("2d"); context.drawImage(game.canvas, 0, 0, 160, 95);
      const pixels = context.getImageData(0, 0, 160, 95).data;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 90) lit++;
      check(lit > 100, "Battle canvas is blank");
      return { requestedEnemies: count, initial, final: crowdedCensus(runtime), checksum, litPixels: lit,
        samples: frameCosts.length, cpuFrame: summarize(frameCosts), animationFrameInterval: summarize(intervals) };
    }, count);
    console.log(JSON.stringify(result));
  }
  if (option("screenshot")) await page.screenshot({ path: option("screenshot") });
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
