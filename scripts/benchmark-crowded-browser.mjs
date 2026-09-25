import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const modulePath = option("playwright");
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const counts = (option("counts") ?? "100,400,800").split(",").map(Number);
const warmFrames = Number(option("warm-frames") ?? 0), frames = Number(option("frames") ?? 72);
const replica = process.argv.includes("--replica");
const sliceTicks = option("slice-ticks") === undefined ? undefined : Number(option("slice-ticks"));
assert.ok(sliceTicks === undefined || (replica && Number.isSafeInteger(sliceTicks) && sliceTicks >= 1 && sliceTicks <= 600));
assert.ok(counts.every(n => Number.isSafeInteger(n) && n > 0 && n <= 5000));
assert.ok(Number.isSafeInteger(warmFrames) && warmFrames >= 0 && warmFrames <= 600);
assert.ok(Number.isSafeInteger(frames) && frames >= 12 && frames <= 1200);
assert.ok(!replica || (warmFrames % 6 === 0 && frames % 6 === 0), "Replica frame windows must contain full six-tick batches");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1410, height: 900 } });
  const profiler = option("profile") ? await page.context().newCDPSession(page) : undefined;
  if (profiler) {
    assert.equal(counts.length, 1, "CPU profiling requires one enemy count");
    await profiler.send("Profiler.enable");
  }
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // Diagnostic reference path only; never a runtime option or a gameplay rule.
  if (process.argv.includes("--vector-outlines")) await page.route("**/src/render/sharedEnemyOutline.ts*", route => route.fulfill({
    contentType: "text/javascript", body: "export function createSharedEnemyOutline(scene, kind, draw) { const graphics=scene.add.graphics(); draw(graphics); return graphics; }"
  }));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  console.log(JSON.stringify({ diagnostic: replica
    ? "Headless replica, six-tick JSON frames every six renders; same-process host preparation excluded from CPU frame costs, no network latency"
    : "Headless Chromium mixed battle, one fixed tick per rendered frame; not player FPS or network latency",
    browser: browser.version(), sliceTicks, vectorOutlines: process.argv.includes("--vector-outlines") }));
  for (const count of counts) {
    if (profiler) await profiler.send("Profiler.start");
    const result = await page.evaluate(async ({ count, warmFrames, frames, replica, sliceTicks }) => {
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
      let scene = game.scene.getScene("GameScene"), runtime = scene.runtime;
      populateCrowdedBattle(runtime, count, config);
      for (let tick = 0; tick < 180; tick++) scene.update(0, BATTLE_STEP_MS);
      const packets = [], syncCosts = [], syncWallCosts = [], syncTaskCosts = [];
      let host, sync, authority, client;
      if (replica) {
        const { BattleAuthority } = await mod("/src/game/battleAuthority.ts");
        const { BattleSyncHost } = await mod("/src/game/battleSyncHost.ts");
        const { BattleSyncClient } = await mod("/src/game/battleSyncClient.ts");
        const replay = runtime.session.captureCheckpointReplay(() => captureBattleSnapshot(runtime.snapshot(CROWDED_CARDS[0])), CROWDED_CARDS);
        host = createIndependentBattle(replay, { checkpoint: replay.checkpoint });
        authority = new BattleAuthority("crowded", host.session, { inputTime: () => 0,
          available: () => !host.world.gameOver, execute: command => host.executeCommand(command) });
        sync = new BattleSyncHost(host.session, authority, { inputTime: () => 0,
          checkpoint: () => host.session.captureCheckpointReplay(() => captureBattleSnapshot(host.snapshot(CROWDED_CARDS[0])), CROWDED_CARDS),
          checksum: () => battleChecksum(host.snapshot(CROWDED_CARDS[0])) });
        client = new BattleSyncClient({ restore: ({ replay }) => {
          game.scene.stop("GameScene"); game.scene.start("GameScene", { replica: replay, viewActorId: "local" });
          scene = game.scene.getScene("GameScene"); runtime = scene.runtime;
        }, follow: (tick, commands) => scene.followSynchronizedFrame(tick, commands),
        checksum: () => scene.battleChecksum() }, sliceTicks);
        client.connect(() => { throw Error("Unexpected replica resync request"); });
        sync.connect("local", message => packets.push(JSON.stringify(message)));
        for (const text of packets.splice(0)) check(client.receiveText(text) === "applied", "Invalid replica snapshot");
        check(client.ready && runtime.session.replica, "Replica did not initialize");
      }
      const prepare = frame => {
        if (host && frame % 6 === 0) {
          host.session.advance(BATTLE_STEP_MS * 6, host.sessionRuntime); sync.publish(false);
          check(packets.length === 1, "Expected one six-tick frame");
        }
      };
      const apply = async (record = false) => {
        let cpu = 0;
        for (const text of packets.splice(0)) {
          const wallStart = performance.now();
          let result, first = true;
          do {
            if (!first) await new Promise(resolve => setTimeout(resolve, 1));
            const start = performance.now();
            result = first ? client.receiveText(text) : client.continueFrame();
            const cost = performance.now() - start;
            cpu += cost;
            if (record) syncTaskCosts.push(cost);
            first = false;
          } while (result === "pending");
          check(result === "applied", "Replica diverged");
          if (record) syncWallCosts.push(performance.now() - wallStart);
        }
        return cpu;
      };
      for (let frame = 0; frame < warmFrames; frame++) {
        const time = await new Promise(resolve => requestAnimationFrame(resolve));
        prepare(frame); await apply();
        game.step(time, BATTLE_STEP_MS);
      }
      const initial = crowdedCensus(runtime);
      const replay = runtime.session.checkpointReplay(captureBattleSnapshot(runtime.snapshot(CROWDED_CARDS[0])), CROWDED_CARDS);
      const reference = createIndependentBattle(replay, { checkpoint: replay.checkpoint });
      const frameCosts = [], intervals = [], stages = {}, restore = [];
      let measured;
      const instrument = (target, method, name) => {
        const original = target[method];
        target[method] = function(...args) {
          const start = performance.now();
          try { return original.apply(this, args); }
          finally { if (measured) measured[name] = (measured[name] ?? 0) + performance.now() - start; }
        };
        restore.push(() => { target[method] = original; });
      };
      instrument(runtime, "step", "simulationAndEffects");
      instrument(scene, "refreshBattleViews", "viewRefresh");
      instrument(scene, "syncBattleOverlays", "overlays");
      instrument(scene, "updateCards", "cards");
      instrument(scene, "updateHud", "hud");
      for (const method of ["preRender", "render", "postRender"]) instrument(game.renderer, method, "render");
      let previous;
      try { for (let frame = 0; frame < frames; frame++) {
        const time = await new Promise(resolve => requestAnimationFrame(resolve));
        if (previous !== undefined) intervals.push(time - previous);
        previous = time;
        prepare(frame);
        measured = {};
        const received = packets.length, applyCpu = await apply(true);
        if (received) syncCosts.push(applyCpu);
        const start = performance.now();
        game.step(time, BATTLE_STEP_MS); frameCosts.push(applyCpu + performance.now() - start);
        for (const key of ["simulationAndEffects", "viewRefresh", "overlays", "cards", "hud", "render"]) {
          (stages[key] ??= []).push(measured[key] ?? 0);
        }
        measured = undefined;
      } } finally { for (const undo of restore) undo(); }
      for (let tick = 0; tick < frames; tick++) reference.session.advance(BATTLE_STEP_MS, reference.sessionRuntime);
      const checksum = battleChecksum(runtime.snapshot(CROWDED_CARDS[0]));
      check(runtime.session.clock.tick === initial.tick + frames, "Rendered scene missed ticks");
      check(checksum === battleChecksum(reference.snapshot(CROWDED_CARDS[0])), "Rendering changed simulation state");
      if (host) check(checksum === battleChecksum(host.snapshot(CROWDED_CARDS[0])), "Replica differs from host");
      check(!runtime.world.gameOver, "Fixture ended prematurely");
      // Read back the actual render in this task before the WebGL drawing buffer clears.
      game.step(performance.now(), 0);
      const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 95;
      const context = canvas.getContext("2d"); context.drawImage(game.canvas, 0, 0, 160, 95);
      const pixels = context.getImageData(0, 0, 160, 95).data;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 90) lit++;
      check(lit > 100, "Battle canvas is blank");
      client?.dispose(); sync?.close(); authority?.close();
      return { requestedEnemies: count, initial, final: crowdedCensus(runtime), checksum, litPixels: lit,
        warmFrames, samples: frameCosts.length, cpuFrame: summarize(frameCosts), animationFrameInterval: summarize(intervals),
        ...(replica ? { syncFrames: syncCosts.length, syncApply: summarize(syncCosts),
          syncWall: summarize(syncWallCosts), syncTasks: syncTaskCosts.length, syncTask: summarize(syncTaskCosts) } : {}),
        stages: Object.fromEntries(Object.entries(stages).map(([key, values]) => [key, summarize(values)])) };
    }, { count, warmFrames, frames, replica, sliceTicks });
    console.log(JSON.stringify(result));
    if (profiler) {
      const { profile } = await profiler.send("Profiler.stop");
      await writeFile(option("profile"), JSON.stringify(profile));
    }
  }
  if (option("screenshot")) await page.screenshot({ path: option("screenshot") });
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
