import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const option = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const playwright = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const load = createTypeScriptLoader({}, { window: undefined, navigator: undefined });
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { BattleSyncHost } = load("src/game/battleSyncHost.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { canonicalSaveGraph } = load("src/game/saveGraph.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { DIFFICULTY_VERSION } = load("src/config.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { BATTLE_PERMISSIONS } = load("src/game/battleParticipants.ts");
const url = option("url") ?? "http://127.0.0.1:5173";
const ownership = process.argv.includes("--ownership");
const roles = ["a", "b"], engines = (option("engines") ?? "firefox,webkit").split(",");
assert.equal(engines.length, 2);
const tokens = Object.fromEntries(roles.map(role => [role, randomUUID()]));
const queues = { a: [], b: [] }, peers = {}, browsers = [], pages = {}, errors = [], results = [];
let runtime, authority, host, loseReceipt = false;
const checksum = () => battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0]));
const send = role => message => {
  if (role === "a" && loseReceipt && message.type === "receipt") { loseReceipt = false; return; }
  queues[role].push(JSON.stringify(message));
};
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", new URL(url).origin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  const role = roles.find(role => req.headers.authorization === `Bearer ${tokens[role]}`);
  if (!role) { res.writeHead(403).end(); return; }
  if (req.method === "GET" && req.url === "/poll") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(queues[role].splice(0))); return; }
  if (req.method !== "POST" || req.url !== "/send") { res.writeHead(404).end(); return; }
  try {
    const parts = []; let size = 0;
    for await (const part of req) { size += part.length; if (size > 66000) throw Error("size"); parts.push(part); }
    const accepted = host.receiveText(peers[role], Buffer.concat(parts).toString("utf8"));
    res.writeHead(accepted ? 200 : 400).end();
  } catch { res.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const relay = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [index, role] of roles.entries()) {
    const engine = engines[index];
    assert.ok(["chromium", "firefox", "webkit"].includes(engine));
    const browser = await playwright[engine].launch({ executablePath: engine === "chromium" ? option("browser") : undefined, headless: true });
    browsers.push(browser);
    const page = pages[role] = await browser.newPage();
    page.on("pageerror", error => errors.push(role + ": " + error.message));
    await page.route("**/src/main.ts*", async route => {
      const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
    });
    await page.goto(url); await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
    await page.evaluate(async ({ token, relay }) => {
      const { GameScene } = await import("/src/scenes/GameScene.ts");
      const { BattleSyncClient } = await import("/src/game/battleSyncClient.ts");
      const game = window.__testGame; game.loop.stop();
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      const state = window.headlessTest = { serial: 0, tail: Promise.resolve(), receipts: [], statuses: [], profile: JSON.stringify(localStorage) };
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      state.connect = () => state.client.connect(message => {
        state.tail = state.tail.then(async () => {
          const result = await fetch(relay + "/send", { method: "POST", headers, body: JSON.stringify(message) });
          if (!result.ok) throw Error("Host rejected transport input");
        });
      });
      state.reset = () => {
        state.client?.disconnect(); state.receipts = []; state.statuses = [];
        state.client = new BattleSyncClient({
          restore: ({ replay }) => {
            if (state.scene) { game.scene.stop(state.scene.sys.settings.key); game.scene.remove(state.scene.sys.settings.key); }
            const key = "Replica" + state.serial++;
            game.scene.add(key, new GameScene(key), false); game.scene.start(key, { replica: replay });
            state.scene = game.scene.getScene(key);
          },
          follow: (tick, commands) => state.scene.followSynchronizedFrame(tick, commands),
          checksum: () => state.scene.battleChecksum(), receipt: receipt => state.receipts.push(receipt)
        });
        state.connect();
      };
      state.poll = async () => {
        await state.tail;
        const response = await fetch(relay + "/poll", { headers }), messages = await response.json();
        for (const message of messages) state.statuses.push(state.client.receiveText(message));
        await state.tail; return messages.length;
      };
    }, { token: tokens[role], relay });
  }
  const pump = async () => {
    for (let i = 0; i < 30; i++) {
      let count = 0;
      for (const role of roles) count += await pages[role].evaluate(() => window.headlessTest.poll());
      if (!count && roles.every(role => !queues[role].length)) return;
    }
    throw Error("Host/client messages did not settle");
  };
  const equal = async label => {
    for (const role of roles) {
      const actual = await pages[role].evaluate(() => window.headlessTest.scene.battleChecksum());
      if (actual !== checksum()) {
        const graph = await pages[role].evaluate(async () => {
          const { captureBattleSnapshot } = await import("/src/game/captureBattleSnapshot.ts");
          return captureBattleSnapshot(window.headlessTest.scene.battleState());
        });
        const clean = graph => {
          const root = graph.nodes[graph.root.ref]; delete root.data.selectedCardId; root.data.gameSpeed = 1;
          for (const node of graph.nodes) if (node.kind === "boss") {
            for (const key of ["rotationX", "rotationY", "rotationZ", "velocityX", "velocityY", "velocityZ", "targetVelocityX", "targetVelocityY", "targetVelocityZ", "nextTurnIn"]) delete node.data[key];
          }
          return canonicalSaveGraph(graph);
        };
        const a = clean(graph), b = clean(captureBattleSnapshot(runtime.snapshot(runtime.world.loadout.ids[0]))), differences = [];
        const compare = (a, b, path = "root") => {
          if (Object.is(a, b)) return;
          if (a && b && typeof a === "object" && typeof b === "object") {
            for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(a[key], b[key], path + "." + key);
          } else differences.push({ path, browser: a, host: b });
        };
        compare(a, b);
        assert.fail(role + " " + label + ": " + JSON.stringify(differences.slice(0, 12)));
      }
    }
  };
  const request = async (role, intent) => {
    assert.equal(await pages[role].evaluate(intent => window.headlessTest.client.request(intent), intent), true);
    await pump(); await equal(intent.type);
    return pages[role].evaluate(() => window.headlessTest.receipts.at(-1));
  };
  const control = data => ({ type: "control", control: data });
  const deploy = (card, lane, column) => ({ type: "operation", operation: { type: "deploy", card, cell: { lane, column }, expected: null } });
  const advance = ticks => {
    for (let i = 0; i < ticks; i++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
    host.publish();
  };
  for (const levelId of ["IF-1", "5-10", "AE-EX-2", "AE-10"]) {
    host?.close(); authority?.close();
    runtime = createIndependentBattle({ version: BATTLE_RULES_VERSION, difficultyVersion: DIFFICULTY_VERSION,
      levelId, difficulty: 3, unlimitedFirepower: false, seed: 810, selectedCards: ["A", "B", "X", "m", "u", "S"],
      debug: true, policy: ownership ? { ...LEGACY_BATTLE_POLICY, towerAccess: "owner" } : LEGACY_BATTLE_POLICY,
      participants: [{ id: "local", permissions: BATTLE_PERMISSIONS }, { id: "a", permissions: BATTLE_PERMISSIONS },
        { id: "b", permissions: ["build"] }] });
    // A captured mid-battle fixture with reselection ready. No display-specific preparation.
    runtime.world.loadout.reselection.restore({ readyAt: 0, cards: [] });
    authority = new BattleAuthority(randomUUID(), runtime.session, {
      available: () => !runtime.world.gameOver, inputTime: () => performance.now(), execute: command => runtime.executeCommand(command)
    });
    authority.submitTrusted("local", control({ type: "debugChars" }));
    authority.submitTrusted("local", control({ type: "autoUpgradeEnabled", enabled: false }));
    host = new BattleSyncHost(runtime.session, authority, {
      checkpoint: () => runtime.session.checkpointReplay(captureBattleSnapshot(runtime.snapshot(runtime.world.loadout.ids[0])), runtime.world.loadout.ids),
      checksum, inputTime: () => performance.now()
    });
    for (const role of roles) { queues[role].length = 0; await pages[role].evaluate(() => window.headlessTest.reset()); peers[role] = host.connect(role, send(role)); }
    await pump(); await equal("join");
    assert.equal((await request("b", control({ type: "debugChars" }))).result, "forbidden");
    assert.equal((await request("a", deploy("A", 3, 8))).result, "deployed");
    if (ownership) {
      const tower = runtime.world.towers.find(t => t.type === "A");
      assert.equal(tower.ownerId, "a");
      const before = checksum();
      assert.equal((await request("b", { type: "operation", operation: { ...deploy("A", 3, 8).operation,
        expected: { kind: "tower", id: tower.entityId } } })).result, "forbidden");
      assert.equal(checksum(), before);
      assert.equal((await request("b", deploy("X", 0, 0))).result, "deployed");
      const owned = runtime.world.towers.find(t => t.type === "X");
      assert.equal(owned.ownerId, "b");
      assert.equal((await request("a", { type: "operation", operation: { type: "erase",
        target: { kind: "tower", id: owned.entityId } } })).result, "forbidden");
    }
    assert.equal((await request("a", control({ type: "pause", paused: true }))).result, "handled");
    const tick = runtime.session.clock.tick; advance(20); assert.equal(runtime.session.clock.tick, tick);
    await request("a", control({ type: "reserve", value: 700 }));
    await request("a", control({ type: "reselect", cards: ["B", "A", "S"] }));
    assert.deepEqual(runtime.world.loadout.ids, ["B", "A", "S"]);
    loseReceipt = true;
    await request("a", deploy("B", 2, 9));
    assert.ok(await pages.a.evaluate(() => window.headlessTest.client.pendingRequest));
    host.disconnect(peers.a);
    await pages.a.evaluate(() => { window.headlessTest.client.disconnect(); window.headlessTest.connect(); });
    peers.a = host.connect("a", send("a")); await pump(); await equal("lost receipt reconnect");
    assert.equal(await pages.a.evaluate(() => window.headlessTest.client.pendingRequest), undefined);
    assert.equal(runtime.world.towers.filter(t => t.type === "B").length, 1);
    await request("a", control({ type: "pause", paused: false }));
    const batches = levelId === "AE-EX-2" ? 25 : 6;
    for (let batch = 0; batch < batches; batch++) { advance(150); await pump(); await equal("combat " + batch); }
    if (levelId === "AE-EX-2") assert.ok(runtime.nullification.snapshot()?.towers.length, "NUL recovery fixture has no suspended towers");
    await pages.b.evaluate(() => { window.headlessTest.scene.world.chars += 1; });
    advance(6); await pump(); await equal("divergence repair");
    assert.ok(await pages.b.evaluate(() => window.headlessTest.statuses.includes("resync")));
    for (const role of roles) assert.equal(await pages[role].evaluate(() => JSON.stringify(localStorage) === window.headlessTest.profile), true);
    results.push({ levelId, tick: runtime.session.clock.tick, checksum: checksum() });
  }
  assert.deepEqual(errors, []);
  console.log("Independent Node authority and real browser replicas over authenticated HTTP", { engines, ownership, results });
} finally {
  host?.close(); authority?.close();
  for (const browser of browsers) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
