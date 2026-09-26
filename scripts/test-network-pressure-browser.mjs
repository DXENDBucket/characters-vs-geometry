import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { load, captureBattleSnapshot, battleChecksum } from "./helpers/battle-runtime.mjs";
import { PRESSURE_CARDS, populatePipelinePressure, pipelinePressureCensus } from "./helpers/pipeline-pressure.mjs";
import { CROWDED_CARDS, populateCrowdedBattle, crowdedCensus } from "./helpers/crowded-battle.mjs";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const seconds = Number(option("seconds") ?? 60), delay = Number(option("delay") ?? 25);
const engine = option("engine") ?? "chromium", small = process.argv.includes("--small");
const profilePath = option("profile");
assert.ok(!profilePath || engine === "chromium", "CPU profiling requires Chromium");
const durable = process.argv.includes("--durable");
const uncompressed = process.argv.includes("--uncompressed");
const crowded = Number(option("crowded") ?? 0);
const crowdedInput = process.argv.includes("--crowded-input");
assert.ok(Number.isSafeInteger(crowded) && crowded >= 0 && crowded <= 2000);
assert.ok(!crowdedInput || crowded > 0, "--crowded-input requires a mixed-enemy workload");
const cards = crowded ? CROWDED_CARDS : PRESSURE_CARDS;
const census = crowded ? crowdedCensus : pipelinePressureCensus;
assert.ok(durable || !uncompressed, "--uncompressed requires --durable");
assert.ok(Number.isSafeInteger(seconds) && seconds >= 15 && seconds <= 600);
assert.ok(Number.isSafeInteger(delay) && delay >= 0 && delay <= 250);
assert.ok(["chromium", "firefox", "webkit"].includes(engine));
const playwright = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { BattleAuthority, BATTLE_PROTOCOL_VERSION } = load("src/game/battleAuthority.ts");
const { BattleSyncHost } = load("src/game/battleSyncHost.ts");
const { BattleHostLoop } = load("src/game/battleHostLoop.ts");
const { DurableBattleHost } = load("src/game/durableBattleHost.ts");
const { encodeBattleWireGraph } = load("src/game/battleWireGraph.ts");
const { decodeSyncMessage } = load("src/game/battleSyncProtocol.ts");
const { createBattleCheckpointStore } = createRequire(import.meta.url)("../electron/battle-checkpoint.cjs");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { upgradeTowerLevel, applyTowerUpgradeStats } = load("src/game/towerUpgradeRules.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const config = load("src/config.ts"), url = option("url") ?? "http://127.0.0.1:5173";
let runtime = createIndependentBattle({ version: BATTLE_RULES_VERSION, levelId: crowded ? "5-10" : "IF-1",
  difficultyVersion: config.DIFFICULTY_VERSION, difficulty: 3, seed: 178, debug: false,
  unlimitedFirepower: false, selectedCards: cards, policy: LEGACY_BATTLE_POLICY });
const fixtureTools = { config, BATTLE_STEP_MS, upgradeTowerLevel, applyTowerUpgradeStats, getCardDefinition };
if (crowded) populateCrowdedBattle(runtime, crowded, config);
else populatePipelinePressure(runtime, fixtureTools, 35);
for (let tick = 0; tick < (crowded ? 0 : 720); tick++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
const hash = () => battleChecksum(runtime.snapshot(cards[0]));
const errors = [], outbound = [], token = randomUUID();
let peer, linkId = 0, bytes = 0, queuedBytes = 0, peakQueue = 0, snapshots = 0, dropReceipt = false, dropped = 0, browser, watchdog;
let diskHost, store, directory, loop, recovery, storage, profiler, profiling = false;
async function saveProfile() {
  if (!profiling) return;
  profiling = false;
  const { profile } = await profiler.send("Profiler.stop");
  await writeFile(profilePath, JSON.stringify(profile));
}
const writeTimes = [], commitTimes = [];
let writtenBytes = 0, logicalBytes = 0, peakCheckpointBytes = 0, peakStoredBytes = 0, writing = false;
const ports = { inputTime: () => performance.now(), save: async text => {
  assert.equal(writing, false, "Concurrent checkpoint writes"); writing = true;
  const started = performance.now();
  let storedBytes;
  try { storedBytes = await store.save(text); } finally { writing = false; }
  writeTimes.push(performance.now() - started);
  const size = Buffer.byteLength(text); writtenBytes += storedBytes; logicalBytes += size;
  peakCheckpointBytes = Math.max(peakCheckpointBytes, size); peakStoredBytes = Math.max(peakStoredBytes, storedBytes);
} };
const authority = new BattleAuthority("network-pressure", runtime.session, { inputTime: () => performance.now(),
  available: () => !runtime.world.gameOver, execute: command => runtime.executeCommand(command) });
const host = new BattleSyncHost(runtime.session, authority, { inputTime: () => performance.now(), checksum: hash,
  checkpoint: () => runtime.session.captureCheckpointReplay(() => captureBattleSnapshot(runtime.snapshot(cards[0])), cards) });
const liveHost = () => diskHost ?? host;
const hostTick = () => diskHost?.timing.tick ?? runtime.session.clock.tick;
const scheduled = { get available() { return diskHost?.available ?? true; },
  get timing() { return diskHost?.timing ?? memoryTiming(); },
  async advance(delta) {
    if (diskHost) {
      const started = performance.now(); await diskHost.advance(delta); commitTimes.push(performance.now() - started);
    } else { runtime.session.advance(delta, runtime.sessionRuntime); host.publish(runtime.world.gameOver); }
  }
};
function memoryTiming() {
  return { ...runtime.session.clock.snapshot(), speed: runtime.session.controls.speed,
    paused: runtime.session.controls.paused, ended: runtime.world.gameOver };
}
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
      if (peer) await liveHost().disconnect(peer);
      outbound.length = 0; queuedBytes = 0; linkId++; peer = await liveHost().connect("local", send);
      res.end(JSON.stringify({ id: linkId })); return;
    }
    if (req.headers["x-connection"] !== String(linkId)) { res.writeHead(409).end(); return; }
    if (req.method === "POST" && req.url === "/disconnect") {
      await liveHost().disconnect(peer); peer = undefined; outbound.length = 0; queuedBytes = 0; res.writeHead(204).end(); return;
    }
    if (req.method === "GET" && req.url === "/poll") {
      const messages = outbound.splice(0); queuedBytes = 0;
      await new Promise(resolve => setTimeout(resolve, delay));
      res.end(JSON.stringify(messages)); return;
    }
    if (req.method !== "POST" || req.url !== "/send") { res.writeHead(404).end(); return; }
    const parts = []; let size = 0;
    for await (const part of req) { size += part.length; if (size > 66000) throw Error("Oversized request"); parts.push(part); }
    res.writeHead(await liveHost().receiveText(peer, Buffer.concat(parts).toString("utf8")) ? 200 : 400).end();
  } catch (error) { errors.push(error.message); res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  if (durable) {
    directory = await mkdtemp(path.join(tmpdir(), "charset-network-pressure-"));
    store = createBattleCheckpointStore(path.join(directory, "battle.json"), undefined, { compression: !uncompressed });
    const ledger = authority.snapshot();
    const replay = runtime.session.captureCheckpointReplay(() => captureBattleSnapshot(runtime.snapshot(cards[0])), cards);
    const saved = JSON.stringify({ version: 1, stream: 0, authority: ledger, snapshot: {
      type: "snapshot", version: BATTLE_PROTOCOL_VERSION, battleId: authority.battleId, stream: 1,
      cursor: { tick: ledger.tick, sequence: ledger.commandSequence }, nextRequest: 0,
      replay: { ...replay, checkpoint: encodeBattleWireGraph(replay.checkpoint) }, checksum: hash()
    } });
    diskHost = await DurableBattleHost.restore(saved, ports);
  }
  loop = new BattleHostLoop(scheduled, { failed: error => errors.push(error.message) });
  browser = await playwright[engine].launch({ headless: true, executablePath: engine === "chromium" ? option("browser") : undefined });
  watchdog = setTimeout(() => void browser.close(), (seconds + 90) * 1000);
  const page = await browser.newPage({ viewport: small ? { width: 800, height: 600 } : { width: 1410, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(url); await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async ({ token, relay, profile }) => {
    const { RemoteBattleSession } = await import("/src/render/remoteBattleSession.ts");
    const game = window.__testGame;
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const listeners = emitter => Object.fromEntries(emitter.eventNames().map(name => [String(name), emitter.listenerCount(name)]).sort());
    const resources = () => ({ textures: Object.keys(game.textures.list).sort(), canvases: document.querySelectorAll("canvas").length,
      game: listeners(game.events), input: listeners(game.input.events) });
    const state = window.networkPressure = { tail: Promise.resolve(), errors: [], statuses: [], receipts: [], completions: 0,
      jobs: new Set(), links: [], holdUntil: 0, frames: 0, intervals: [], litPixels: 0, peakMortars: 0, peakTrails: 0,
      peakEnemyProjectiles: 0, profile: JSON.stringify(localStorage), baseline: resources(), resources,
      graphicsCosts: {}, measuredGraphics: new WeakSet() };
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
          if (state.inputProbe && state.inputProbe.sentAt === undefined && JSON.parse(text).type === "request") {
            state.inputProbe.sentAt = performance.now();
          }
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
      if (profile) {
        const enemies = [...scene.runtime.world.enemies];
        for (let i = 0; i < enemies.length; i++) {
          const enemy = enemies[i];
          enemies.push(...(enemy.parenthesisCargo ?? []));
          const objects = [enemy.body];
          for (let j = 0; j < objects.length; j++) {
            const object = objects[j];
            if (Array.isArray(object.list)) objects.push(...object.list);
            if (object.type !== "Graphics" || state.measuredGraphics.has(object)) continue;
            state.measuredGraphics.add(object);
            const key = enemy.kind + ":" + (object === enemy.shape.getData("ionCharge") ? "charge" : "outline");
            const render = object.renderWebGL;
            object.renderWebGL = function (...args) {
              const started = performance.now();
              try { return render.apply(this, args); }
              finally { state.graphicsCosts[key] = (state.graphicsCosts[key] ?? 0) + performance.now() - started; }
            };
          }
        }
      }
      state.peakMortars = Math.max(state.peakMortars, scene.runtime.world.mortarProjectiles.length);
      state.peakEnemyProjectiles = Math.max(state.peakEnemyProjectiles, scene.runtime.world.enemyProjectiles.length);
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
  }, { token, relay: `http://127.0.0.1:${server.address().port}`, profile: !!profilePath });
  await page.waitForFunction(() => window.networkPressure.remote.connection.ready);
  const viewBatch = await page.evaluate(() => {
    const scene = window.networkPressure.remote.scene;
    const refresh = scene.refreshBattleViews;
    let count = 0;
    scene.refreshBattleViews = function () { count++; return refresh.call(this); };
    try {
      const tick = scene.runtime.session.clock.tick;
      for (let i = 0; i < 3; i++) scene.followSynchronizedFrame(tick, [], false);
      const before = count;
      scene.update(0, 0);
      const after = count;
      scene.followSynchronizedFrame(tick, []);
      return { before, after, immediate: count };
    } finally { scene.refreshBattleViews = refresh; }
  });
  assert.deepEqual(viewBatch, { before: 0, after: 1, immediate: 2 });
  const initial = census(runtime), samples = [];
  if (profilePath) {
    profiler = await page.context().newCDPSession(page);
    await profiler.send("Profiler.enable");
    await profiler.send("Profiler.start");
    profiling = true;
  }
  writeTimes.length = 0; writtenBytes = 0; logicalBytes = 0; peakCheckpointBytes = 0; peakStoredBytes = 0;
  const start = performance.now(); let heldAt, requested = false, disconnectedAt, terminal;
  // The mixed battle ends naturally in about twelve seconds. Seed the retry fault
  // before ticking so receipt recovery is not confounded with input starvation.
  if (crowded && !crowdedInput) {
    dropReceipt = true;
    requested = await page.evaluate(() => {
      const s = window.networkPressure;
      return s.remote.connection.request({ type: "control", control: { type: "reserve", value: 1234 } }, () => s.completions++);
    });
    assert.equal(requested, true);
  }
  loop.start();
  while (performance.now() - start < seconds * 1000) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const elapsed = performance.now() - start;
    if (heldAt === undefined && elapsed >= (crowded ? 4000 : seconds * 250)) {
      heldAt = elapsed; await page.evaluate(() => { window.networkPressure.holdUntil = performance.now() + 1200; });
    }
    if (!requested && elapsed >= (crowded ? 4000 : seconds * 600)) {
      dropReceipt = true;
      requested = await page.evaluate(requireCatchup => {
        const s = window.networkPressure;
        if (requireCatchup && (!s.remote.connection.catchingUp || s.remote.scene.runtime.world.gameOver)) return false;
        const probe = { enqueuedAt: performance.now(), catchingUp: s.remote.connection.catchingUp,
          gameOver: s.remote.scene.runtime.world.gameOver, tick: s.remote.scene.runtime.session.clock.tick };
        if (requireCatchup) s.inputProbe = probe;
        const accepted = s.remote.connection.request({ type: "control", control: { type: "reserve", value: 1234 } }, () => s.completions++);
        if (!accepted && requireCatchup) s.inputProbe = undefined;
        return accepted;
      }, crowdedInput);
    }
    if (crowdedInput && elapsed >= 7000) assert.ok(requested, "Input remained unavailable throughout active catch-up");
    if (requested && disconnectedAt === undefined && dropped) {
      disconnectedAt = elapsed; await page.evaluate(() => window.networkPressure.link.events.closed());
    }
    const sample = await page.evaluate(() => {
      const s = window.networkPressure;
      const world = s.remote.scene?.runtime.world;
      return { tick: s.remote.scene?.runtime.session.clock.tick, enemies: s.remote.scene?.runtime.world.enemies.length,
        passengers: world?.enemies.reduce((sum, enemy) => sum + (enemy.parenthesisCargo?.length ?? 0), 0),
        gameOver: world?.gameOver, status: s.remote.connection.status, catchingUp: s.remote.connection.catchingUp };
    });
    samples.push({ elapsed, ...sample, hostTick: hostTick(), lag: hostTick() - sample.tick });
    assert.deepEqual(errors, []);
    if (crowded && scheduled.timing.ended) {
      assert.equal(loop.status, "stopped");
      terminal ??= { elapsed, tick: hostTick() };
      assert.equal(hostTick(), terminal.tick, "Ended host kept advancing");
    } else assert.equal(loop.status, "running");
  }
  await loop.stop();
  if (profilePath) console.log(JSON.stringify({ diagnostic: "Graphics render CPU by owner (instrumented run)",
    costs: await page.evaluate(() => window.networkPressure.graphicsCosts) }));
  if (diskHost) await diskHost.advance(BATTLE_STEP_MS * 6);
  else host.publish();
  await page.waitForFunction(tick => {
    const s = window.networkPressure;
    return s.remote.connection.ready && !s.remote.connection.catchingUp && s.completions === 1 &&
      !s.remote.scene.synchronizedViewsDirty && s.remote.scene.runtime.session.clock.tick === tick;
  }, hostTick(), { timeout: 15000 }).catch(async error => {
    console.error(JSON.stringify({ hostTick: hostTick(), terminal, samples, client: await page.evaluate(() => {
      const s = window.networkPressure;
      return { tick: s.remote.scene?.runtime.session.clock.tick, status: s.remote.connection.status,
        ready: s.remote.connection.ready, catchingUp: s.remote.connection.catchingUp, completions: s.completions,
        receipts: s.receipts, errors: s.errors, statuses: s.statuses };
    }) }));
    throw error;
  });
  let diskText;
  if (diskHost) {
    diskText = await store.read(); assert.equal(diskText, diskHost.checkpointText);
    const snapshot = decodeSyncMessage(JSON.parse(diskText).snapshot);
    runtime = createIndependentBattle(snapshot.replay, { checkpoint: snapshot.replay.checkpoint });
    runtime.session.restoreCommandOffset(snapshot.cursor.sequence);
    assert.equal(hash(), snapshot.checksum);
  }
  const final = census(runtime);
  const observed = await page.evaluate(() => {
    const s = window.networkPressure;
    return { hash: s.remote.scene.battleChecksum(), errors: s.errors, frames: s.frames, intervals: s.intervals,
      peakMortars: s.peakMortars, peakTrails: s.peakTrails, peakEnemyProjectiles: s.peakEnemyProjectiles,
      litPixels: s.litPixels, statuses: s.statuses,
      completions: s.completions, receipts: s.receipts, links: s.links.length, inputProbe: s.inputProbe,
      profileUnchanged: JSON.stringify(localStorage) === s.profile };
  });
  await saveProfile();
  if (crowded) console.log(JSON.stringify({ diagnostic: "Mixed-battle terminal observations before acceptance checks",
    initial, final, terminal, samples, frames: observed.frames, peakEnemyProjectiles: observed.peakEnemyProjectiles,
    heldAt, disconnectedAt, snapshots, receipts: observed.receipts, inputProbe: observed.inputProbe,
    checksum: observed.hash, hostChecksum: hash() }));
  if (crowded) {
    assert.ok(initial.enemies === crowded && final.enemies + final.passengers >= crowded * .9 &&
      samples.every(sample => sample.enemies + sample.passengers >= crowded * .9), "Crowded workload did not remain populated");
    assert.ok(terminal && final.gameOver && samples.at(-1).gameOver, "Natural terminal state missed the client observation window");
    assert.ok(terminal.tick - initial.tick >= terminal.elapsed * .05, "Crowded host did not keep real time before defeat");
  }
  assert.equal(observed.hash, hash()); assert.equal(runtime.session.nextCommandSequence, 1);
  assert.equal(runtime.session.controls.reserveChars, 1234); assert.equal(dropped, 1);
  assert.equal(observed.completions, 1); assert.equal(observed.links, 2); assert.equal(observed.profileUnchanged, true);
  if (crowdedInput) {
    assert.equal(observed.inputProbe?.catchingUp, true); assert.equal(observed.inputProbe.gameOver, false);
    assert.ok(observed.inputProbe.sentAt >= observed.inputProbe.enqueuedAt &&
      observed.inputProbe.sentAt - observed.inputProbe.enqueuedAt < 1000, "Input did not leave at a nearby validated frame boundary");
    assert.ok(observed.receipts[0].tick < final.tick, "Input was not executed during battle");
  }
  assert.equal(snapshots, 2, "Unexpected resync could conceal a divergent replica");
  assert.deepEqual(observed.errors, []); assert.deepEqual(errors, []);
  if (!crowded) assert.ok(final.tick - initial.tick >= seconds * 50 && !final.gameOver);
  assert.ok(observed.frames > seconds * 15 && observed.litPixels > 100);
  if (crowded) assert.ok(observed.peakEnemyProjectiles >= 100, "Missing mixed enemy attack workload");
  else assert.ok(observed.peakMortars >= 10 && observed.peakTrails > 0);
  const summary = values => { values.sort((a, b) => a - b); return { median: values[Math.floor(values.length / 2)],
    p95: values[Math.ceil(values.length * .95) - 1], max: values.at(-1) }; };
  assert.ok(heldAt !== undefined && disconnectedAt !== undefined);
  assert.ok(samples.some(s => s.elapsed >= heldAt && s.elapsed <= heldAt + 1500 && s.lag >= 30), "Polling hold did not create backlog");
  for (const fault of [heldAt, disconnectedAt]) assert.ok(samples.some(s => s.elapsed > fault && s.elapsed <= fault + 3500 &&
    s.elapsed >= fault + 1500 && s.status === "ready" && s.lag <= 12), "Client did not recover while the host kept running");
  const steady = samples.filter(s => (!terminal || s.elapsed < terminal.elapsed) &&
    [heldAt, disconnectedAt].every(fault => s.elapsed < fault || s.elapsed > fault + 3500));
  assert.ok(steady.length >= 10);
  const lag = summary(steady.map(s => s.lag));
  assert.ok(lag.p95 <= 30 && lag.max <= 120, `Sustained replica backlog: ${JSON.stringify(lag)}`);
  if (diskHost) {
    assert.ok(commitTimes.length > (terminal ? terminal.elapsed / 1000 : seconds) * 5 && writeTimes.length >= commitTimes.length);
    if (uncompressed) assert.equal(writtenBytes, logicalBytes);
    else assert.ok(writtenBytes < logicalBytes / 2, "Pressure checkpoints did not meaningfully compress");
    storage = { compression: !uncompressed, writes: writeTimes.length, writtenBytes, logicalBytes, peakCheckpointBytes, peakStoredBytes,
      atomicWriteMs: summary(writeTimes), advancementCommitMs: summary(commitTimes) };
  }
  if (option("screenshot")) await page.screenshot({ path: option("screenshot") });
  const cleanup = await page.evaluate(async () => {
    const s = window.networkPressure, game = window.__testGame;
    s.remote.close(); await s.tail;
    game.events.off("postrender", s.render); game.loop.stop();
    return { errors: s.errors, jobs: s.jobs.size, activeScenes: game.scene.getScenes(true).length,
      liveLinks: s.links.filter(link => !link.closed || link.timer !== undefined).length, resources: s.resources(), baseline: s.baseline };
  });
  assert.equal(cleanup.jobs + cleanup.activeScenes + cleanup.liveLinks, 0);
  assert.deepEqual(cleanup.resources, cleanup.baseline);
  assert.deepEqual(cleanup.errors, []); assert.deepEqual(errors, []);
  if (diskHost) {
    await diskHost.close();
    diskText = await store.read();
    recovery = await DurableBattleHost.restore(diskText, ports);
    const messages = [], recoveredPeer = await recovery.connect("local", message => messages.push(message));
    const hello = messages[0]; assert.equal(hello.nextRequest, 1);
    assert.equal(hello.checksum, observed.hash);
    await recovery.receiveText(recoveredPeer, JSON.stringify({ type: "request", stream: hello.stream, request: {
      version: BATTLE_PROTOCOL_VERSION, battleId: "network-pressure", sequence: 0,
      intent: { type: "control", control: { type: "reserve", value: 1234 } }
    } }));
    assert.equal(messages.at(-1).receipt.status, "executed");
    assert.equal(JSON.parse(recovery.checkpointText).snapshot.cursor.sequence, 1);
    runtime.session.advance(BATTLE_STEP_MS * 6, runtime.sessionRuntime);
    await recovery.advance(BATTLE_STEP_MS * 6);
    const restoredText = await store.read(); assert.equal(restoredText, recovery.checkpointText);
    assert.equal(JSON.parse(restoredText).snapshot.checksum, hash());
    storage.recovery = terminal ? "disk restart, receipt retry and immutable terminal state matched" :
      "disk restart, receipt retry and continuation matched";
  }
  console.log(JSON.stringify({ diagnostic: "Continuous localhost replica rendering with delayed polling; optional atomic file persistence",
    engine, browser: browser.version(), seconds, delay, small, crowded, crowdedInput, inputProbe: observed.inputProbe,
    terminal, durable, storage, initial, final, checksum: observed.hash,
    frames: observed.frames, frameIntervalMs: summary(observed.intervals), steadyLagTicks: lag,
    peakMortars: observed.peakMortars, peakTrails: observed.peakTrails, peakEnemyProjectiles: observed.peakEnemyProjectiles,
    peakQueue, bytes, samples, cleanup: "baseline restored" }));
} finally {
  try { await saveProfile(); } catch (error) { console.error("CPU profile could not be saved:", error.message); }
  clearTimeout(watchdog); await loop?.stop(); await diskHost?.close(); await recovery?.close(); host.close(); authority.close();
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (directory) {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("charset-network-pressure-"));
    await rm(directory, { recursive: true, force: true });
  }
}
