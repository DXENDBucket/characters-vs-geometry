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
const connection = process.argv.includes("--connection");
const input = connection || process.argv.includes("--input");
const resources = input || process.argv.includes("--resources");
const economy = resources || process.argv.includes("--economy");
const ownership = economy || process.argv.includes("--ownership");
const roles = ["a", "b"], engines = (option("engines") ?? "firefox,webkit").split(",");
assert.equal(engines.length, 2);
const tokens = Object.fromEntries(roles.map(role => [role, randomUUID()]));
const queues = { a: [], b: [] }, peers = {}, browsers = [], pages = {}, errors = [], results = [];
const linkIds = { a: 0, b: 0 };
let runtime, authority, host, loseReceipt = false;
const checksum = () => battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0]));
const send = role => message => {
  if (role === "a" && loseReceipt && message.type === "receipt") { loseReceipt = false; return; }
  queues[role].push(JSON.stringify(message));
};
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", new URL(url).origin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Connection");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  const role = roles.find(role => req.headers.authorization === `Bearer ${tokens[role]}`);
  if (!role) { res.writeHead(403).end(); return; }
  if (connection && req.method === "POST" && req.url === "/connect") {
    if (peers[role]) host.disconnect(peers[role]);
    queues[role].length = 0; linkIds[role]++;
    peers[role] = host.connect(role, send(role));
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ id: linkIds[role] })); return;
  }
  if (connection && req.headers["x-connection"] !== String(linkIds[role])) { res.writeHead(409).end(); return; }
  if (connection && req.method === "POST" && req.url === "/disconnect") {
    host.disconnect(peers[role]); delete peers[role]; res.writeHead(204).end(); return;
  }
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
    await page.evaluate(async ({ token, relay, role, input, connection }) => {
      const { GameScene } = await import("/src/scenes/GameScene.ts");
      const { BattleSyncClient } = await import("/src/game/battleSyncClient.ts");
      const { RemoteBattleSession } = await import("/src/render/remoteBattleSession.ts");
      const game = window.__testGame; game.loop.stop();
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      const state = window.headlessTest = { serial: 0, tail: Promise.resolve(), receipts: [], statuses: [], profile: JSON.stringify(localStorage) };
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      if (connection) {
        const jobs = new Set(); state.links = []; state.exits = 0;
        state.timerCount = () => jobs.size;
        Object.defineProperty(state, "scene", { get: () => state.remote?.scene });
        state.reset = () => {
          state.remote?.close(); state.receipts = []; state.statuses = [];
          state.remote = new RemoteBattleSession(game, { actorId: role,
            onExit: () => { state.exits++; game.scene.start("MainMenuScene"); },
            receipt: receipt => state.receipts.push(receipt),
            scheduler: {
              set: (delay, fn) => { const id = setTimeout(() => { jobs.delete(id); fn(); }, delay); jobs.add(id); return id; },
              clear: id => { clearTimeout(id); jobs.delete(id); }
            },
            transport: events => {
              const link = { events, id: 0, closed: false };
              state.links.push(link); state.link = link;
              state.tail = state.tail.then(async () => {
                const response = await fetch(relay + "/connect", { method: "POST", headers });
                if (!response.ok) throw Error("Connect rejected");
                link.id = (await response.json()).id;
                if (!link.closed) events.open();
              });
              return {
                send: text => {
                  state.tail = state.tail.then(async () => {
                    if (link.closed) return;
                    const response = await fetch(relay + "/send", { method: "POST",
                      headers: { ...headers, "X-Connection": String(link.id) }, body: text });
                    if (!response.ok) events.closed(response.status !== 403);
                  });
                },
                close: () => {
                  link.closed = true;
                  state.tail = state.tail.then(() => fetch(relay + "/disconnect", { method: "POST",
                    headers: { ...headers, "X-Connection": String(link.id) } }));
                }
              };
            }
          });
          state.client = state.remote.connection;
          state.client.subscribe(status => state.statuses.push(status));
          state.remote.start();
        };
        state.poll = async () => {
          await state.tail;
          const link = state.link;
          if (!link || link.closed) return 0;
          const response = await fetch(relay + "/poll", { headers: { ...headers, "X-Connection": String(link.id) } });
          if (response.status === 409) return 0;
          const messages = await response.json();
          for (const message of messages) link.events.message(message);
          await state.tail; return messages.length;
        };
        game.loop.start(game.step.bind(game));
        return;
      }
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
            game.scene.add(key, new GameScene(key), false); game.scene.start(key, { replica: replay,
              ...(input ? { viewActorId: role, input: state.client } : {}) });
            state.scene = game.scene.getScene(key);
            if (input && !game.loop.running) game.loop.start(game.step.bind(game));
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
    }, { token: tokens[role], relay, role, input, connection });
  }
  const pump = async () => {
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      let count = 0;
      for (const role of roles) count += await pages[role].evaluate(() => window.headlessTest.poll());
      let catchingUp = false;
      for (const role of roles) catchingUp ||= await pages[role].evaluate(() => !!window.headlessTest.client.catchingUp);
      if (!count && roles.every(role => !queues[role].length) && !catchingUp) return;
      if (catchingUp) await new Promise(resolve => setTimeout(resolve, 2));
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
  const click = async (role, target) => {
    const point = await pages[role].evaluate(async target => {
      const scene = target.reselect ? window.__testGame.scene.getScene("CardSelectScene") : window.headlessTest.scene;
      const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = await import("/src/config.ts");
      let point;
      if (target.cell) point = { x: BOARD_X + (target.cell[1] + .5) * CELL_WIDTH, y: BOARD_Y + (target.cell[0] + .5) * CELL_HEIGHT };
      else {
        const object = target.reselect ? target.card ? scene.cardFrames.get(target.card) : scene[target.button] :
          target.card ? scene.cardList.cards.find(card => card.state.definition.id === target.card).frame : scene.ui[target.button];
        const rect = object.getBounds(); point = { x: rect.centerX, y: rect.centerY };
      }
      const camera = scene.cameras.main;
      point = camera.matrix.transformPoint(point.x - camera.scrollX, point.y - camera.scrollY);
      const rect = window.__testGame.canvas.getBoundingClientRect();
      return { x: rect.x + point.x * rect.width / scene.scale.width, y: rect.y + point.y * rect.height / scene.scale.height };
    }, target);
    await pages[role].mouse.click(point.x, point.y);
    await pages[role].waitForTimeout(70);
    await pages[role].evaluate(() => window.headlessTest.tail);
  };
  for (const levelId of input ? ["AE-EX-2"] : ["IF-1", "5-10", "AE-EX-2", "AE-10"]) {
    host?.close(); authority?.close();
    runtime = createIndependentBattle({ version: BATTLE_RULES_VERSION, difficultyVersion: DIFFICULTY_VERSION,
      levelId, difficulty: 3, unlimitedFirepower: false, seed: 810, selectedCards: ["A", "B", "X", "m", "u", "S"],
      debug: true, policy: ownership ? { ...LEGACY_BATTLE_POLICY, towerAccess: "owner", ...(economy ? { walletMode: "individual" } : {}),
        ...(resources ? { resourceMode: "individual" } : {}) } : LEGACY_BATTLE_POLICY,
      ...(resources ? { playerLoadouts: [{ actorId: "a", cards: ["A", "B", "S"] }, { actorId: "b", cards: ["A", "B", "X"] },
        { actorId: "local", cards: ["A", "B", "X", "m", "u", "S"] }] } : {}),
      participants: [{ id: "local", permissions: BATTLE_PERMISSIONS }, { id: "a", permissions: BATTLE_PERMISSIONS },
        { id: "b", permissions: ["build"] }] });
    // A captured mid-battle fixture with reselection ready. No display-specific preparation.
    runtime.world.loadout.reselection.restore({ readyAt: 0, cards: [] });
    if (resources) runtime.players.get("a").loadout.reselection.restore({ readyAt: 0, cards: [] });
    authority = new BattleAuthority(randomUUID(), runtime.session, {
      available: () => !runtime.world.gameOver, inputTime: () => performance.now(), execute: command => runtime.executeCommand(command)
    });
    authority.submitTrusted("local", control({ type: "debugChars" }));
    if (economy) authority.submitTrusted("a", control({ type: "debugChars" }));
    authority.submitTrusted("local", control({ type: "autoUpgradeEnabled", enabled: false }));
    if (resources) for (const role of roles) runtime.players.get(role).auto.autoUpgradeEnabled = false;
    host = new BattleSyncHost(runtime.session, authority, {
      checkpoint: () => runtime.session.checkpointReplay(captureBattleSnapshot(runtime.snapshot(runtime.world.loadout.ids[0])), runtime.world.loadout.ids),
      checksum, inputTime: () => performance.now()
    });
    for (const role of roles) {
      queues[role].length = 0; await pages[role].evaluate(() => window.headlessTest.reset());
      if (!connection) peers[role] = host.connect(role, send(role));
    }
    await pump(); await equal("join");
    if (input) {
      for (const role of roles) {
        const view = await pages[role].evaluate(() => {
          const scene = window.headlessTest.scene;
          return { cards: scene.cardList.cards.map(card => card.state.definition.id), chars: scene.effectiveChars(),
            raw: scene.playerView.rawChars, shift: scene.shifter.cooldownRatio() };
        });
        assert.deepEqual(view.cards, runtime.players.get(role).loadout.ids);
        assert.equal(view.chars, runtime.world.effectiveChars(role));
        assert.equal(view.raw, runtime.world.economy.balance(role));
        assert.equal(view.shift, 1);
      }
      const before = runtime.world.effectiveChars("b");
      await click("a", { card: "A" }); await click("a", { cell: [1, 2] });
      assert.equal(runtime.world.towers.length, 1);
      // Transport sends may already have reached the host, but clients only apply polled frames.
      assert.equal(await pages.a.evaluate(() => window.headlessTest.scene.towers.length), 0);
      await pump(); await equal("pointer deploy");
      assert.equal(runtime.world.towers[0].ownerId, "a");
      assert.equal(runtime.world.effectiveChars("b"), before);
      await click("b", { card: "A" }); await click("b", { cell: [2, 2] }); await pump();
      await equal("other player same card"); assert.equal(runtime.world.towers.length, 2);
      await click("a", { button: "shifterButton" });
      assert.equal(await pages.a.evaluate(() => window.headlessTest.scene.shifter.isActive()), true, "pointer activates shifter");
      await click("a", { cell: [1, 2] });
      assert.equal(await pages.a.evaluate(() => window.headlessTest.scene.shifter.selectedTowers().length), 1, "pointer selects owned tower");
      await click("a", { cell: [1, 4] });
      await pump(); await equal("pointer shift");
      assert.equal(runtime.world.towers.find(t => t.ownerId === "a").column, 4);
      assert.equal(await pages.a.evaluate(() => window.headlessTest.scene.shifter.cooldownRatio()), 0);
      assert.equal(await pages.b.evaluate(() => window.headlessTest.scene.shifter.cooldownRatio()), 1);
      loseReceipt = true;
      await click("a", { card: "B" }); await click("a", { cell: [3, 3] }); await pump(); await equal("pointer lost receipt");
      assert.equal(await pages.a.evaluate(() => window.headlessTest.client.busy), true);
      const sequence = runtime.session.nextCommandSequence;
      await click("a", { button: "eraserButton" }); await click("a", { cell: [2, 2] }); await pump();
      assert.equal(runtime.session.nextCommandSequence, sequence, "pending receipt blocks duplicate inputs");
      if (connection) {
        await pages.a.evaluate(() => window.headlessTest.link.events.closed());
        assert.equal(await pages.a.evaluate(() => window.headlessTest.scene.connectionText.visible), true);
        await pages.a.screenshot({ path: "logs/connection-reconnecting.png" });
      } else await pages.a.evaluate(() => window.headlessTest.client.disconnect());
      await click("a", { cell: [1, 4] }); await pump();
      assert.equal(runtime.session.nextCommandSequence, sequence, "disconnected input cannot mutate replica or host");
      if (connection) {
        await pages.a.waitForFunction(() => window.headlessTest.links.length === 2);
      } else {
        host.disconnect(peers.a);
        await pages.a.evaluate(() => window.headlessTest.connect()); peers.a = host.connect("a", send("a"));
      }
      await pump(); await equal("input reconnect");
      if (connection) {
        assert.equal(await pages.a.evaluate(() => window.headlessTest.scene.connectionText.visible), false);
        await pages.a.evaluate(() => { const old = window.headlessTest.links[0]; old.events.message("bad stale input"); old.events.closed(false); });
        assert.equal(await pages.a.evaluate(() => window.headlessTest.client.status), "ready");
      }
      assert.equal(await pages.a.evaluate(() => window.headlessTest.client.busy), false);
      assert.equal(runtime.world.towers.filter(t => t.type === "B").length, 1, "lost receipt retry does not deploy twice");
      await click("a", { button: "eraserButton" }); await click("a", { cell: [2, 2] }); await pump();
      assert.equal(runtime.session.nextCommandSequence, sequence, "foreign towers are not locally selected for erase");
      assert.equal(await pages.a.evaluate(() => window.headlessTest.scene.cardList.cards.find(c => c.state.definition.id === "A").state.readyAt),
        runtime.players.get("a").loadout.byId.get("A").readyAt);
      await click("a", { button: "autoUpgradeEnabledBox" }); await pump(); await equal("player settings pointer");
      assert.equal(runtime.players.get("a").auto.autoUpgradeEnabled, true);
      assert.equal(runtime.players.get("b").auto.autoUpgradeEnabled, false);
      await click("a", { button: "reselectButton" });
      assert.equal(await pages.a.evaluate(() => window.__testGame.scene.isActive("CardSelectScene")), true);
      await click("a", { reselect: true, card: "B" });
      await pages.a.screenshot({ path: "logs/player-reselect.png" });
      assert.deepEqual(await pages.a.evaluate(() => window.__testGame.scene.getScene("CardSelectScene").selectedCards), ["A", "S"], "reselect card pointer");
      await click("a", { reselect: true, button: "startButton" }); await pump(); await equal("pointer reselection");
      assert.deepEqual(runtime.players.get("a").loadout.ids, ["A", "S"]);
      assert.deepEqual(await pages.a.evaluate(() => window.headlessTest.scene.cardList.cards.map(c => c.state.definition.id)), ["A", "S"]);
      assert.deepEqual(await pages.b.evaluate(() => window.headlessTest.scene.cardList.cards.map(c => c.state.definition.id)), ["A", "B", "X"]);
      await pages.a.keyboard.press("Escape");
      assert.equal(await pages.a.evaluate(() => window.headlessTest.scene.menuOpen), true);
      // Let Phaser drain the opening key event before another key toggles the DOM modal.
      await pages.a.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await pages.a.keyboard.press("Escape");
      assert.equal(await pages.a.evaluate(() => window.headlessTest.scene.menuOpen), false);
      await pages.a.screenshot({ path: "logs/player-input.png" });
      for (const role of roles) assert.equal(await pages[role].evaluate(() => JSON.stringify(localStorage) === window.headlessTest.profile), true);
      if (connection) {
        for (let i = 0; i < 3; i++) {
          await pages.a.evaluate(() => window.headlessTest.client.reconnect()); await pump(); await equal("scene replacement " + i);
          assert.equal(await pages.a.evaluate(() => window.__testGame.scene.getScenes(false).filter(s => s.sys.settings.key.startsWith("RemoteBattle-")).length), 1);
          assert.equal(await pages.a.locator(".pause-menu-backdrop").count(), 1);
          assert.equal(await pages.a.evaluate(() => window.headlessTest.timerCount()), 0);
        }
        await pages.b.evaluate(() => { window.headlessTest.scene.world.gainChars(1, "b"); });
        advance(6); await pump(); await equal("owned connection divergence repair");
        assert.equal(await pages.b.evaluate(() => window.headlessTest.client.status), "ready");
        assert.equal(await pages.b.locator(".pause-menu-backdrop").count(), 1);
        await pages.b.evaluate(() => window.headlessTest.link.events.message("{}"));
        assert.equal(await pages.b.evaluate(() => window.headlessTest.client.status), "failed");
        assert.equal(await pages.b.evaluate(() => window.headlessTest.scene.connectionText.visible), true);
        await pages.b.screenshot({ path: "logs/connection-failed.png" });
        await pages.b.evaluate(() => window.headlessTest.client.reconnect()); await pump(); await equal("manual protocol-error recovery");
        await pages.a.keyboard.press("Escape");
        await pages.a.locator(".pause-menu button").nth(3).click();
        await pages.a.evaluate(() => window.headlessTest.tail);
        assert.equal(await pages.a.evaluate(() => window.headlessTest.client.status), "closed");
        assert.equal(await pages.a.evaluate(() => window.headlessTest.exits), 1);
        assert.equal(await pages.a.evaluate(() => window.headlessTest.timerCount()), 0);
        assert.equal(await pages.a.locator(".pause-menu-backdrop").count(), 0);
        assert.equal(await pages.a.evaluate(() => window.__testGame.scene.getScenes(false).filter(s => s.sys.settings.key.startsWith("RemoteBattle-")).length), 0);
        await pages.a.evaluate(() => { window.__testGame.scene.stop("MainMenuScene"); window.headlessTest.reset(); });
        await pump(); await equal("new connection owner");
        await pages.a.evaluate(() => window.__testGame.scene.stop(window.headlessTest.scene.sys.settings.key));
        await pages.a.evaluate(() => window.headlessTest.tail);
        assert.equal(await pages.a.evaluate(() => window.headlessTest.client.status), "closed");
        assert.equal(await pages.a.evaluate(() => window.headlessTest.exits), 2);
        assert.equal(await pages.a.evaluate(() => window.headlessTest.timerCount()), 0);
        assert.equal(await pages.a.locator(".pause-menu-backdrop").count(), 0);
        await pages.b.evaluate(() => window.__testGame.destroy(true));
        await pages.b.waitForFunction(() => window.headlessTest.client.status === "closed");
        await pages.b.evaluate(() => window.headlessTest.tail);
        assert.equal(await pages.b.evaluate(() => window.headlessTest.timerCount()), 0);
        assert.equal(await pages.b.locator(".pause-menu-backdrop").count(), 0);
        assert.equal(await pages.b.evaluate(() => window.headlessTest.exits), 0, "destroying the game must not reopen menu scenes");
        assert.equal(peers.a, undefined); assert.equal(peers.b, undefined);
      }
      results.push({ levelId, input: true, connection, checksum: checksum() });
      continue;
    }
    assert.equal((await request("b", control({ type: "debugChars" }))).result, "forbidden");
    const peerBalance = runtime.world.effectiveChars("b");
    assert.equal((await request("a", deploy("A", 3, 8))).result, "deployed");
    if (economy) assert.equal(runtime.world.effectiveChars("b"), peerBalance);
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
    assert.deepEqual(runtime.players.get(resources ? "a" : undefined).loadout.ids, ["B", "A", "S"]);
    if (resources) assert.deepEqual(runtime.players.get("b").loadout.ids, ["A", "B", "X"]);
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
    await pages.b.evaluate(() => { window.headlessTest.scene.world.gainChars(1, "b"); });
    advance(6); await pump(); await equal("divergence repair");
    assert.ok(await pages.b.evaluate(() => window.headlessTest.statuses.includes("resync")));
    for (const role of roles) assert.equal(await pages[role].evaluate(() => JSON.stringify(localStorage) === window.headlessTest.profile), true);
    results.push({ levelId, tick: runtime.session.clock.tick, checksum: checksum() });
  }
  assert.deepEqual(errors, []);
  console.log("Independent Node authority and real browser replicas over authenticated HTTP", { engines, ownership, economy, resources, results });
} finally {
  host?.close(); authority?.close();
  for (const browser of browsers) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
