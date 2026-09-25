import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { load, captureBattleSnapshot, battleChecksum } from "./helpers/battle-runtime.mjs";
import { PRESSURE_CARDS, populatePipelinePressure, pipelinePressureCensus } from "./helpers/pipeline-pressure.mjs";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const seconds = Number(option("seconds") ?? 60), delay = Number(option("delay") ?? 25);
const engine = option("engine") ?? "chromium", small = process.argv.includes("--small");
assert.ok(Number.isSafeInteger(seconds) && seconds >= 15 && seconds <= 600);
assert.ok(Number.isSafeInteger(delay) && delay >= 0 && delay <= 250);
assert.ok(["chromium", "firefox", "webkit"].includes(engine));
const playwright = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { BattleSyncHost } = load("src/game/battleSyncHost.ts");
const { BattleHostLoop } = load("src/game/battleHostLoop.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { upgradeTowerLevel, applyTowerUpgradeStats } = load("src/game/towerUpgradeRules.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const config = load("src/config.ts"), url = option("url") ?? "http://127.0.0.1:5173";
const runtime = createIndependentBattle({ version: BATTLE_RULES_VERSION, levelId: "IF-1",
  difficultyVersion: config.DIFFICULTY_VERSION, difficulty: 3, seed: 178, debug: false,
  unlimitedFirepower: false, selectedCards: PRESSURE_CARDS, policy: LEGACY_BATTLE_POLICY });
populatePipelinePressure(runtime, { config, BATTLE_STEP_MS, upgradeTowerLevel, applyTowerUpgradeStats, getCardDefinition }, 35);
for (let tick = 0; tick < 720; tick++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
const hash = () => battleChecksum(runtime.snapshot(PRESSURE_CARDS[0]));
const errors = [], outbound = [], token = randomUUID();
let peer, linkId = 0, bytes = 0, queuedBytes = 0, peakQueue = 0, snapshots = 0, dropReceipt = false, dropped = 0, browser, watchdog;
const authority = new BattleAuthority("network-pressure", runtime.session, { inputTime: () => performance.now(),
  available: () => !runtime.world.gameOver, execute: command => runtime.executeCommand(command) });
const host = new BattleSyncHost(runtime.session, authority, { inputTime: () => performance.now(), checksum: hash,
  checkpoint: () => runtime.session.captureCheckpointReplay(() => captureBattleSnapshot(runtime.snapshot(PRESSURE_CARDS[0])), PRESSURE_CARDS) });
const loop = new BattleHostLoop({ get available() { return true; },
  get timing() { return { ...runtime.session.clock.snapshot(), speed: runtime.session.controls.speed,
    paused: runtime.session.controls.paused, ended: runtime.world.gameOver }; },
  async advance(delta) { runtime.session.advance(delta, runtime.sessionRuntime); host.publish(false); }
}, { failed: error => errors.push(error.message) });
const send = message => {
  if (dropReceipt && message.type === "receipt") { dropReceipt = false; dropped++; return; }
  if (message.type === "snapshot") snapshots++;
  const text = JSON.stringify(message);
  const size = Buffer.byteLength(text);
  if (outbound.length >= 64 || queuedBytes + size > 16 * 1024 * 1024) {
    errors.push("Relay backlog exceeded its bounds"); throw Error(errors.at(-1));
  }
  bytes += size; queuedBytes += size; outbound.push(text); peakQueue = Math.max(peakQueue, outbound.length);
};
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", new URL(url).origin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Connection");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
  try {
    if (req.method === "POST" && req.url === "/connect") {
      if (peer) host.disconnect(peer);
      outbound.length = 0; queuedBytes = 0; linkId++; peer = host.connect("local", send);
      res.end(JSON.stringify({ id: linkId })); return;
    }
    if (req.headers["x-connection"] !== String(linkId)) { res.writeHead(409).end(); return; }
    if (req.method === "POST" && req.url === "/disconnect") {
      host.disconnect(peer); peer = undefined; outbound.length = 0; queuedBytes = 0; res.writeHead(204).end(); return;
    }
    if (req.method === "GET" && req.url === "/poll") {
      const messages = outbound.splice(0); queuedBytes = 0;
      await new Promise(resolve => setTimeout(resolve, delay));
      res.end(JSON.stringify(messages)); return;
    }
    if (req.method !== "POST" || req.url !== "/send") { res.writeHead(404).end(); return; }
    const parts = []; let size = 0;
    for await (const part of req) { size += part.length; if (size > 66000) throw Error("Oversized request"); parts.push(part); }
    res.writeHead(host.receiveText(peer, Buffer.concat(parts).toString("utf8")) ? 200 : 400).end();
  } catch (error) { errors.push(error.message); res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  browser = await playwright[engine].launch({ headless: true, executablePath: engine === "chromium" ? option("browser") : undefined });
  watchdog = setTimeout(() => void browser.close(), (seconds + 90) * 1000);
  const page = await browser.newPage({ viewport: small ? { width: 800, height: 600 } : { width: 1410, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(url); await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async ({ token, relay }) => {
    const { RemoteBattleSession } = await import("/src/render/remoteBattleSession.ts");
    const game = window.__testGame;
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const listeners = emitter => Object.fromEntries(emitter.eventNames().map(name => [String(name), emitter.listenerCount(name)]).sort());
    const resources = () => ({ textures: Object.keys(game.textures.list).sort(), canvases: document.querySelectorAll("canvas").length,
      game: listeners(game.events), input: listeners(game.input.events) });
    const state = window.networkPressure = { tail: Promise.resolve(), errors: [], statuses: [], receipts: [], completions: 0,
      jobs: new Set(), links: [], holdUntil: 0, frames: 0, intervals: [], litPixels: 0, peakMortars: 0, peakTrails: 0,
      profile: JSON.stringify(localStorage), baseline: resources(), resources };
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    state.remote = new RemoteBattleSession(game, { actorId: "local", onExit() {},
      receipt: receipt => state.receipts.push(receipt), scheduler: {
        set: (delay, run) => { const id = setTimeout(() => { state.jobs.delete(id); run(); }, delay); state.jobs.add(id); return id; },
        clear: id => { clearTimeout(id); state.jobs.delete(id); }
      }, transport: events => {
        const link = { id: 0, closed: false, timer: undefined, events }; state.links.push(link); state.link = link;
        const linkHeaders = () => ({ ...headers, "X-Connection": String(link.id) });
        const poll = async () => {
          try {
            if (link.closed) return;
            if (performance.now() >= state.holdUntil) {
              const response = await fetch(relay + "/poll", { headers: linkHeaders() });
              if (!response.ok) throw Error("Poll rejected: " + response.status);
              const messages = await response.json();
              if (link.closed) return;
              for (const message of messages) { if (link.closed) break; events.message(message); }
            }
          } catch (error) { if (!link.closed) { state.errors.push(error.message); events.closed(); } }
          finally { if (!link.closed) link.timer = setTimeout(poll, 20); }
        };
        state.tail = state.tail.then(async () => {
          const response = await fetch(relay + "/connect", { method: "POST", headers });
          if (!response.ok) throw Error("Connect rejected");
          link.id = (await response.json()).id;
          if (!link.closed) { events.open(); void poll(); }
        });
        return { send: text => {
          state.tail = state.tail.then(async () => {
            if (link.closed) return;
            const response = await fetch(relay + "/send", { method: "POST", headers: linkHeaders(), body: text });
            if (!response.ok) throw Error("Send rejected: " + response.status);
          });
        }, close: () => {
          link.closed = true; clearTimeout(link.timer); link.timer = undefined;
          state.tail = state.tail.then(() => fetch(relay + "/disconnect", { method: "POST", headers: linkHeaders() }));
        } };
      } });
    state.remote.connection.subscribe(status => state.statuses.push(status));
    let previous, sampled = 0;
    state.render = () => {
      const now = performance.now(); state.frames++;
      if (previous !== undefined) state.intervals.push(now - previous);
      previous = now;
      if (now - sampled < 1000) return;
      sampled = now;
      const scene = state.remote.scene;
      if (!scene) return;
      state.peakMortars = Math.max(state.peakMortars, scene.runtime.world.mortarProjectiles.length);
      const objects = [...scene.children.list];
      for (let i = 0; i < objects.length; i++) if (Array.isArray(objects[i].list)) objects.push(...objects[i].list);
      state.peakTrails = Math.max(state.peakTrails, objects.filter(child => child.name === "projectile-trail").length);
      const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 95;
      const context = canvas.getContext("2d"); context.drawImage(game.canvas, 0, 0, 160, 95);
      const pixels = context.getImageData(0, 0, 160, 95).data;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 90) lit++;
      state.litPixels = Math.max(state.litPixels, lit);
    };
    game.events.on("postrender", state.render); state.remote.start();
  }, { token, relay: `http://127.0.0.1:${server.address().port}` });
  await page.waitForFunction(() => window.networkPressure.remote.connection.ready);
  const initial = pipelinePressureCensus(runtime), samples = [];
  const start = performance.now(); let heldAt, requested = false, disconnectedAt;
  loop.start();
  while (performance.now() - start < seconds * 1000) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const elapsed = performance.now() - start;
    if (heldAt === undefined && elapsed >= seconds * 250) {
      heldAt = elapsed; await page.evaluate(() => { window.networkPressure.holdUntil = performance.now() + 1200; });
    }
    if (!requested && elapsed >= seconds * 600) {
      dropReceipt = true;
      requested = await page.evaluate(() => {
        const s = window.networkPressure;
        return s.remote.connection.request({ type: "control", control: { type: "reserve", value: 1234 } }, () => s.completions++);
      });
    }
    if (requested && disconnectedAt === undefined && dropped) {
      disconnectedAt = elapsed; await page.evaluate(() => window.networkPressure.link.events.closed());
    }
    const sample = await page.evaluate(() => {
      const s = window.networkPressure;
      return { tick: s.remote.scene?.runtime.session.clock.tick, status: s.remote.connection.status, catchingUp: s.remote.connection.catchingUp };
    });
    samples.push({ elapsed, ...sample, hostTick: runtime.session.clock.tick, lag: runtime.session.clock.tick - sample.tick });
    assert.deepEqual(errors, []); assert.equal(loop.status, "running");
  }
  await loop.stop(); host.publish();
  await page.waitForFunction(tick => {
    const s = window.networkPressure;
    return s.remote.connection.ready && !s.remote.connection.catchingUp && s.completions === 1 && s.remote.scene.runtime.session.clock.tick === tick;
  }, runtime.session.clock.tick, { timeout: 15000 });
  const final = pipelinePressureCensus(runtime);
  const observed = await page.evaluate(() => {
    const s = window.networkPressure;
    return { hash: s.remote.scene.battleChecksum(), errors: s.errors, frames: s.frames, intervals: s.intervals,
      peakMortars: s.peakMortars, peakTrails: s.peakTrails, litPixels: s.litPixels, statuses: s.statuses,
      completions: s.completions, receipts: s.receipts, links: s.links.length, profileUnchanged: JSON.stringify(localStorage) === s.profile };
  });
  assert.equal(observed.hash, hash()); assert.equal(runtime.session.nextCommandSequence, 1);
  assert.equal(runtime.session.controls.reserveChars, 1234); assert.equal(dropped, 1);
  assert.equal(observed.completions, 1); assert.equal(observed.links, 2); assert.equal(observed.profileUnchanged, true);
  assert.equal(snapshots, 2, "Unexpected resync could conceal a divergent replica");
  assert.deepEqual(observed.errors, []); assert.deepEqual(errors, []);
  assert.ok(final.tick - initial.tick >= seconds * 50 && !final.gameOver);
  assert.ok(observed.frames > seconds * 15 && observed.peakMortars >= 10 && observed.peakTrails > 0 && observed.litPixels > 100);
  const summary = values => { values.sort((a, b) => a - b); return { median: values[Math.floor(values.length / 2)],
    p95: values[Math.ceil(values.length * .95) - 1], max: values.at(-1) }; };
  assert.ok(heldAt !== undefined && disconnectedAt !== undefined);
  assert.ok(samples.some(s => s.elapsed >= heldAt && s.elapsed <= heldAt + 1500 && s.lag >= 30), "Polling hold did not create backlog");
  for (const fault of [heldAt, disconnectedAt]) assert.ok(samples.some(s => s.elapsed > fault && s.elapsed <= fault + 3500 &&
    s.elapsed >= fault + 1500 && s.status === "ready" && s.lag <= 12), "Client did not recover while the host kept running");
  const steady = samples.filter(s => [heldAt, disconnectedAt].every(fault => s.elapsed < fault || s.elapsed > fault + 3500));
  assert.ok(steady.length >= 10);
  const lag = summary(steady.map(s => s.lag));
  assert.ok(lag.p95 <= 30 && lag.max <= 120, `Sustained replica backlog: ${JSON.stringify(lag)}`);
  if (option("screenshot")) await page.screenshot({ path: option("screenshot") });
  const cleanup = await page.evaluate(async () => {
    const s = window.networkPressure, game = window.__testGame;
    s.remote.close(); await s.tail;
    game.events.off("postrender", s.render); game.loop.stop();
    return { jobs: s.jobs.size, activeScenes: game.scene.getScenes(true).length,
      liveLinks: s.links.filter(link => !link.closed || link.timer !== undefined).length, resources: s.resources(), baseline: s.baseline };
  });
  assert.equal(cleanup.jobs + cleanup.activeScenes + cleanup.liveLinks, 0);
  assert.deepEqual(cleanup.resources, cleanup.baseline);
  console.log(JSON.stringify({ diagnostic: "Continuous localhost replica rendering with delayed polling; in-memory host, no disk latency",
    engine, browser: browser.version(), seconds, delay, small, initial, final, checksum: observed.hash,
    frames: observed.frames, frameIntervalMs: summary(observed.intervals), steadyLagTicks: lag,
    peakMortars: observed.peakMortars, peakTrails: observed.peakTrails, peakQueue, bytes, samples, cleanup: "baseline restored" }));
} finally {
  clearTimeout(watchdog); await loop.stop(); host.close(); authority.close();
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
