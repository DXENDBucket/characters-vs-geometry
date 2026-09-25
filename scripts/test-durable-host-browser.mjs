import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const option = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const playwright = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { DurableBattleHost } = load("src/game/durableBattleHost.ts");
const { BATTLE_RULES_VERSION } = load("src/game/battleSimulation.ts");
const { BATTLE_PERMISSIONS } = load("src/game/battleParticipants.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { createBattleCheckpointStore } = createRequire(import.meta.url)("../electron/battle-checkpoint.cjs");
const dir = await mkdtemp(path.join(tmpdir(), "charset-durable-browser-"));
const store = createBattleCheckpointStore(path.join(dir, "battle.json"));
const ports = { inputTime: () => performance.now(), save: text => store.save(text) };
let host, peer, browser, drop = false;
const outbound = [], errors = [], token = randomUUID(), url = option("url") ?? "http://127.0.0.1:5173";
const send = message => { if (drop && message.type === "receipt") { drop = false; return; } outbound.push(message); };
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", new URL(url).origin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
  if (req.method === "GET" && req.url === "/poll") { res.end(JSON.stringify(outbound.splice(0))); return; }
  if (req.method !== "POST" || req.url !== "/send") { res.writeHead(404).end(); return; }
  try {
    const parts = []; let size = 0;
    for await (const part of req) { size += part.length; if (size > 66000) throw Error("size"); parts.push(part); }
    res.writeHead(await host.receiveText(peer, Buffer.concat(parts).toString("utf8")) ? 200 : 400).end();
  } catch (error) { errors.push(error.message); res.writeHead(503).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  host = await DurableBattleHost.create("durable-browser", { version: BATTLE_RULES_VERSION, difficultyVersion: 2,
    levelId: "5-10", difficulty: 3, seed: 888, unlimitedFirepower: false, selectedCards: ["A", "B", "X"], debug: true,
    policy: LEGACY_BATTLE_POLICY, participants: [{ id: "peer", permissions: BATTLE_PERMISSIONS }] }, ports);
  const engine = option("engine") ?? "firefox";
  browser = await playwright[engine].launch({ executablePath: engine === "chromium" ? option("browser") : undefined, headless: true });
  const page = await browser.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(url); await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async ({ relay, token }) => {
    const { GameScene } = await import("/src/scenes/GameScene.ts");
    const { BattleSyncClient } = await import("/src/game/battleSyncClient.ts");
    const game = window.__testGame; game.loop.stop();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const state = window.durable = { serial: 0, tail: Promise.resolve(), receipts: [], statuses: [], profile: JSON.stringify(localStorage) };
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    state.client = new BattleSyncClient({ restore: ({ replay }) => {
      if (state.scene) { game.scene.stop(state.scene.sys.settings.key); game.scene.remove(state.scene.sys.settings.key); }
      const key = "DurableReplica" + state.serial++;
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, { replica: replay }); state.scene = game.scene.getScene(key);
    }, follow: (tick, commands) => state.scene.followSynchronizedFrame(tick, commands),
    checksum: () => state.scene.battleChecksum(), receipt: receipt => state.receipts.push(receipt) });
    state.connect = () => state.client.connect(message => {
      state.tail = state.tail.then(async () => {
        const response = await fetch(relay + "/send", { method: "POST", headers, body: JSON.stringify(message) });
        if (!response.ok) throw Error("request rejected");
      });
    });
    state.poll = async () => {
      await state.tail;
      const messages = await (await fetch(relay + "/poll", { headers })).json();
      for (const message of messages) state.statuses.push(state.client.receiveText(JSON.stringify(message)));
      await state.tail; return messages.length;
    };
    state.connect();
  }, { relay: `http://127.0.0.1:${server.address().port}`, token });
  peer = await host.connect("peer", send);
  const pump = async () => {
    for (let i = 0; i < 20; i++) if (!await page.evaluate(() => window.durable.poll()) && !outbound.length) return;
    throw Error("messages did not settle");
  };
  const equal = async () => assert.equal(await page.evaluate(() => window.durable.scene.battleChecksum()), JSON.parse(host.checkpointText).snapshot.checksum);
  const request = async intent => { assert.equal(await page.evaluate(intent => window.durable.client.request(intent), intent), true); await pump(); await equal(); };
  await pump(); await equal();
  await request({ type: "control", control: { type: "autoUpgradeEnabled", enabled: false } });
  drop = true;
  await request({ type: "operation", operation: { type: "deploy", card: "B", cell: { lane: 3, column: 2 }, expected: null } });
  assert.ok(await page.evaluate(() => window.durable.client.pendingRequest));
  const saved = host.checkpointText;
  await host.close(); await page.evaluate(() => window.durable.client.disconnect());
  host = await DurableBattleHost.restore(await store.read(), ports);
  await page.evaluate(() => window.durable.connect()); peer = await host.connect("peer", send);
  await pump(); await equal();
  assert.equal(await page.evaluate(() => window.durable.client.pendingRequest), undefined);
  assert.equal(await page.evaluate(() => window.durable.scene.world.towers.filter(t => t.type === "B").length), 1);
  assert.equal(JSON.parse(host.checkpointText).snapshot.cursor.sequence, JSON.parse(saved).snapshot.cursor.sequence);
  await request({ type: "control", control: { type: "reserve", value: 100 } });
  for (let i = 0; i < 30; i++) { await host.advance(100); await pump(); await equal(); }
  await page.evaluate(() => { window.durable.scene.world.chars += 1; });
  await host.advance(100); await pump(); await equal();
  assert.ok(await page.evaluate(() => window.durable.statuses.includes("resync")));
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage) === window.durable.profile), true);
  assert.deepEqual(errors, []);
  console.log("Durable Node host / live browser restart, lost receipt, continuation and resync passed", { engine,
    cursor: JSON.parse(host.checkpointText).snapshot.cursor, checksum: JSON.parse(host.checkpointText).snapshot.checksum });
} finally {
  await host?.close(); await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
