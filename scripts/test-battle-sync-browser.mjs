import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const playwright = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const engines = (option("engines") ?? "chromium,firefox,webkit").split(",");
assert.equal(engines.length, 3, "Provide an engine for host and each of the two peers");
for (const engine of engines) assert.ok(["chromium", "firefox", "webkit"].includes(engine));
const url = option("url") ?? "http://127.0.0.1:5173";
const roles = ["host", "a", "b"], tokens = Object.fromEntries(roles.map(role => [role, randomUUID()]));
const mail = Object.fromEntries(roles.map(role => [role, []]));
let duplicateRequest = false, dropReceipt = false;
// Test-only authenticated relay. No battle logic, trusted actors or snapshots are created by this server.
const relay = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", new URL(url).origin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  const role = roles.find(role => req.headers.authorization === `Bearer ${tokens[role]}`);
  if (!role) { res.writeHead(403).end(); return; }
  if (req.url === "/poll" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(mail[role].splice(0))); return;
  }
  if (req.url !== "/send" || req.method !== "POST") { res.writeHead(404).end(); return; }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 17 * 1024 * 1024) throw Error("size"); chunks.push(chunk); }
    const { to, message } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!roles.includes(to) || (role !== "host" && to !== "host") || (role === "host" && to === "host")) throw Error("route");
    const packet = { from: role, text: JSON.stringify(message) };
    if (role === "host" && to === "a" && message.type === "receipt" && dropReceipt) dropReceipt = false;
    else mail[to].push(packet);
    if (role === "a" && message.type === "request" && duplicateRequest) {
      duplicateRequest = false; mail[to].push(structuredClone(packet));
    }
    res.end("ok");
  } catch { res.writeHead(400).end(); }
});
await new Promise(resolve => relay.listen(0, "127.0.0.1", resolve));
const relayUrl = `http://127.0.0.1:${relay.address().port}`;
const browsers = [];
const pages = {}, errors = [];
try {
  for (const role of roles) {
    const engine = engines[roles.indexOf(role)];
    const browser = await playwright[engine].launch({ executablePath: engine === "chromium" ? option("browser") : undefined, headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const page = pages[role] = await context.newPage();
    page.on("pageerror", error => errors.push(`${role}: ${error.message}`));
    await page.route("**/src/main.ts*", async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
    });
    await page.goto(url); await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
    await page.evaluate(async ({ role, token, relayUrl }) => {
      const mod = path => import(performance.getEntriesByType("resource").map(e => e.name)
        .find(url => new URL(url).pathname === path) ?? path);
      const { GameScene } = await mod("/src/scenes/GameScene.ts");
      const { BattleSyncClient } = await mod("/src/game/battleSyncClient.ts");
      const { BATTLE_PROTOCOL_VERSION } = await mod("/src/game/battleAuthority.ts");
      const progress = await mod("/src/progress.ts"), { BATTLE_PERMISSIONS } = await mod("/src/game/battleParticipants.ts");
      const game = window.__testGame; game.loop.stop();
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      const state = window.syncTest = { role, protocolVersion: BATTLE_PROTOCOL_VERSION, tail: Promise.resolve(), peers: {}, receipts: [], statuses: [], serial: 0 };
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      state.send = (to, message) => {
        state.tail = state.tail.then(async () => {
          const response = await fetch(`${relayUrl}/send`, { method: "POST", headers, body: JSON.stringify({ to, message }) });
          if (!response.ok) throw Error("Relay rejected message");
        });
      };
      const start = data => {
        if (state.scene) { game.scene.stop(state.scene.sys.settings.key); game.scene.remove(state.scene.sys.settings.key); }
        const key = `${role}-${state.serial++}`;
        game.scene.add(key, new GameScene(key), false); game.scene.start(key, data);
        return state.scene = game.scene.getScene(key);
      };
      state.start = start;
      if (role === "host") {
        progress.unlockAllCards(); progress.completeAllLevels();
        start({ levelId: "IF-BE-4", seed: 92, selectedCards: ["A", "B", "F", "S", "b", "t", "m", "u", "x", "j"], participants: [
          { id: "local", permissions: BATTLE_PERMISSIONS }, { id: "a", permissions: ["build", "skill", "edit", "move"] },
          { id: "b", permissions: ["build", "time", "settings"] }
        ] });
        state.scene.submitPlayerControl("local", { type: "debugMode", enabled: true });
        state.scene.submitPlayerControl("local", { type: "debugChars" });
        state.scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
        state.host = state.scene.startSynchronization();
        state.join = actor => { state.peers[actor] = state.host.connect(actor, message => state.send(actor, message)); };
      } else {
        state.profileBefore = JSON.stringify(localStorage);
        state.resetClient = () => { state.client?.disconnect(); state.client = new BattleSyncClient({
          restore: snapshot => start({ replica: snapshot.replay }),
          follow: (tick, commands) => state.scene.followSynchronizedFrame(tick, commands),
          checksum: () => state.scene.battleChecksum(), receipt: receipt => state.receipts.push(receipt)
        }); };
        state.resetClient();
        state.attach = () => state.client.connect(message => state.send("host", message)); state.attach();
      }
      state.poll = async () => {
        await state.tail;
        const response = await fetch(`${relayUrl}/poll`, { headers });
        const packets = await response.json();
        for (const packet of packets) {
          if (role === "host") state.host.receiveText(state.peers[packet.from], packet.text);
          else state.statuses.push(state.client.receiveText(packet.text));
        }
        await state.tail;
        return packets.length;
      };
    }, { role, token: tokens[role], relayUrl });
  }
  const pump = async () => {
    for (let pass = 0; pass < 40; pass++) {
      let count = 0;
      for (const role of roles) count += await pages[role].evaluate(() => window.syncTest.poll());
      if (!count && roles.every(role => !mail[role].length)) return;
    }
    throw Error("Network did not settle");
  };
  const equal = async label => {
    const hashes = [];
    for (const role of roles) hashes.push(await pages[role].evaluate(() => window.syncTest.scene.battleChecksum()));
    assert.equal(new Set(hashes).size, 1, `${label}: ${hashes}`);
    return hashes[0];
  };
  const request = async (role, intent) => {
    assert.equal(await pages[role].evaluate(intent => window.syncTest.client.request(intent), intent), true);
    await pump(); await equal(intent.type);
    return pages[role].evaluate(() => window.syncTest.receipts.at(-1));
  };
  const control = (type, values = {}) => ({ type: "control", control: { type, ...values } });
  const deploy = (card, lane, column) => ({ type: "operation", operation: { type: "deploy", card, cell: { lane, column }, expected: null } });
  await pages.host.evaluate(() => { window.syncTest.join("a"); window.syncTest.join("b"); });
  await pump(); const initial = await equal("initial join");
  duplicateRequest = true;
  assert.equal((await request("a", deploy("A", 0, 2))).result, "deployed");
  assert.equal(await pages.host.evaluate(() => window.syncTest.scene.towers.filter(t => t.type === "A").length), 1);
  assert.equal((await request("b", control("debugChars"))).result, "forbidden");
  assert.equal((await request("b", deploy("B", 1, 3))).result, "deployed");
  assert.equal((await request("a", deploy("F", 6, 0))).result, "deployed");
  const f = await pages.a.evaluate(() => {
    const tower = window.syncTest.scene.towers.find(t => t.type === "F"); return { kind: "tower", id: tower.entityId };
  });
  await request("a", { type: "operation", operation: { type: "trigger", target: f, behavior: "F" } });
  await pages.host.evaluate(async () => {
    for (let i = 0; i < 240; i++) window.syncTest.scene.update(0, 1000 / 60);
    window.syncTest.host.publish(); await window.syncTest.tail;
  });
  await pump(); const running = await equal("running combat and delayed attacks");
  await request("b", control("speed", { speed: 2.5 }));
  await request("b", control("pause", { paused: true }));
  await request("a", deploy("x", 2, 2));
  await pages.host.evaluate(() => window.syncTest.scene.update(0, 100000));
  await pump(); await equal("paused commands");
  await request("b", control("pause", { paused: false }));

  // Deliver later frames before earlier ones: client must resync, not guess missing simulation.
  await pages.host.evaluate(async () => {
    for (let i = 0; i < 30; i++) window.syncTest.scene.update(0, 1000 / 60);
    window.syncTest.host.publish(); await window.syncTest.tail;
  });
  mail.b.reverse(); await pump(); await equal("out-of-order recovery");
  assert.ok(await pages.b.evaluate(() => window.syncTest.statuses.includes("resync")));

  // The host accepts a request, but its receipt is lost. Reconnect keeps the old sequence.
  dropReceipt = true;
  assert.equal(await pages.a.evaluate(intent => window.syncTest.client.request(intent), deploy("m", 0, 3)), true);
  await pump(); assert.ok(await pages.a.evaluate(() => window.syncTest.client.pendingRequest));
  const beforeReconnect = await pages.host.evaluate(() => window.syncTest.scene.chars);
  await pages.a.evaluate(() => window.syncTest.client.disconnect());
  await pages.host.evaluate(() => window.syncTest.host.disconnect(window.syncTest.peers.a));
  await pages.a.evaluate(() => window.syncTest.attach());
  await pages.host.evaluate(() => window.syncTest.join("a"));
  await pump(); await equal("lost receipt reconnect");
  assert.equal(await pages.host.evaluate(() => window.syncTest.scene.chars), beforeReconnect);
  assert.equal(await pages.a.evaluate(() => window.syncTest.client.pendingRequest), undefined);

  // Local rendering cadence cannot advance a replica. An accidental local write is repaired by a checkpoint.
  await pages.b.evaluate(() => {
    for (let i = 0; i < 120; i++) window.syncTest.scene.update(0, 1000 / 144);
    window.syncTest.scene.chars += 1;
  });
  await pages.host.evaluate(async () => {
    for (let i = 0; i < 6; i++) window.syncTest.scene.update(0, 1000 / 60);
    window.syncTest.host.publish(); await window.syncTest.tail;
  });
  await pump();
  // Snapshot requests are bounded; a caller can retry after the ingress cooldown.
  if (!await pages.b.evaluate(() => window.syncTest.client.ready)) {
    await new Promise(resolve => setTimeout(resolve, 1050));
    await pages.b.evaluate(() => window.syncTest.client.retry()); await pump();
  }
  const recovered = await equal("checksum repair");
  const commandsBeforeForgery = await pages.host.evaluate(() => window.syncTest.scene.exportReplay().commands.length);
  await pages.a.evaluate(async () => {
    const state = window.syncTest;
    state.send("host", { type: "request", stream: state.client.stream,
      request: { version: state.protocolVersion, battleId: state.client.battleId, sequence: state.client.nextRequest,
        intent: { type: "control", actorId: "local", control: { type: "debugChars" } } } });
    await state.tail;
  });
  await pump(); await equal("forged actor rejected");
  assert.equal(await pages.host.evaluate(() => window.syncTest.scene.exportReplay().commands.length), commandsBeforeForgery);

  const content = {};
  for (const levelId of ["1-9", "2-10", "5-5", "5-10", "AE-5", "AE-4"]) {
    await pages.host.evaluate(() => window.syncTest.host.close());
    for (const role of roles) mail[role].length = 0;
    for (const role of ["a", "b"]) {
      await pages[role].evaluate(() => { window.syncTest.resetClient(); window.syncTest.attach(); });
    }
    await pages.host.evaluate(levelId => {
      const state = window.syncTest, participants = state.scene.session.snapshot().participants;
      state.start({ levelId, seed: 92, participants,
        selectedCards: levelId === "AE-4" ? ["A", "B", "m", "u", "x", "@", "&", "w"] : ["A", "B", "m", "u", "x"] });
      state.scene.submitPlayerControl("local", { type: "debugMode", enabled: true });
      state.scene.submitPlayerControl("local", { type: "debugChars" });
      state.scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
      for (const [card, lane, column] of [["A", 0, 2], ["m", 0, 3], ["B", 1, 3], ["u", 1, 2], ["x", 2, 2]]) {
        const result = state.scene.submitPlayerOperation("local", { type: "deploy", card, cell: { lane, column }, expected: null });
        if (result !== "deployed") throw Error(`Cannot prepare ${levelId}: ${card} ${result}`);
      }
      if (levelId === "AE-4") state.scene.submitPlayerControl("local", { type: "debugChars" });
      if (levelId === "AE-4") for (const [card, lane, column] of [["@", 5, 1], ["&", 5, 2], ["w", 0, 8]]) {
        const result = state.scene.submitPlayerOperation("local", { type: "deploy", card, cell: { lane, column }, expected: null });
        if (result !== "deployed") throw Error(`Cannot prepare topology fixture: ${card} ${result}`);
      }
      for (let i = 0; i < 60; i++) state.scene.update(0, 1000 / 60);
      if (state.scene.towers.filter(tower => tower.type === "A").length !== 2) throw Error("Mirror fixture is missing");
      state.host = state.scene.startSynchronization(); state.join("a"); state.join("b");
    }, levelId);
    await pump(); await equal(`${levelId} shared-relationship join`);
    if (levelId === "AE-4") {
      const target = await pages.a.evaluate(() => {
        const t = window.syncTest.scene.towers.find(t => t.type === "&"); return { kind: "tower", id: t.entityId };
      });
      assert.equal((await request("a", { type: "operation", operation: {
        type: "topology", target, cell: { lane: 0, column: 8 }
      } })).result, "handled");
      await pages.b.evaluate(() => window.syncTest.client.resync()); await pump(); await equal("copied form resync");
      for (const role of roles) assert.equal(await pages[role].evaluate(() =>
        window.syncTest.scene.towers.find(t => t.type === "@").copiedType), "w");
    }
    await pages.host.evaluate(async () => {
      for (let i = 0; i < 600; i++) window.syncTest.scene.update(0, 1000 / 60);
      window.syncTest.host.publish(); await window.syncTest.tail;
    });
    await pump(); content[levelId] = await equal(`${levelId} continuation`);
  }

  // Join with a consumed source in storage, then submit attachments and open pipes over the relay.
  await pages.host.evaluate(() => window.syncTest.host.close());
  for (const role of roles) mail[role].length = 0;
  for (const role of ["a", "b"]) await pages[role].evaluate(() => { window.syncTest.resetClient(); window.syncTest.attach(); });
  await pages.host.evaluate(async () => {
    const state = window.syncTest, participants = state.scene.session.snapshot().participants;
    state.start({ levelId: "IF-1", seed: 92, participants, selectedCards: ["A", "F", "0", "1", "=", "t"] });
    const scene = state.scene;
    scene.submitPlayerControl("local", { type: "debugMode", enabled: true });
    scene.submitPlayerControl("local", { type: "debugChars" });
    scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
    for (const [type, lane, column, level] of [["F", 0, 1, 1], ["0", 0, 2, 1], ["1", 0, 6, 1],
      ["A", 1, 1, 7], ["0", 1, 2, 1], ["1", 1, 4, 1]]) scene.spawnGeneratedTower(type, lane, column, level);
    for (const [lane, last] of [[0, 6], [1, 4]]) for (let column = 1; column < last; column++) {
      scene.edgeTowers.push(scene.world.entityIds.identify("edge", {
        type: "=", axis: "horizontal", lane, column, level: 10, mode: column === last - 1 ? "!=" : ">"
      }));
    }
    scene.numbers.sync();
    scene.triggerShockTower(scene.towers.find(t => t.type === "F"));
    const a = scene.towers.find(t => t.type === "A");
    scene.executeBattleAction({ type: "volley", tower: a, copyRevision: a.copyRevision, hitCount: 2 });
    if (scene.towers.some(t => t.type === "F") || !scene.towers.some(t => t.projectileBank?.shots.some(s => s.action?.type === "F"))) {
      throw Error("Consumed-source pipe fixture is missing");
    }
    const { spawnEnemyAt } = await import("/src/game/enemyRuntime.ts");
    const outlet = scene.towers.find(t => t.type === "1" && t.lane === 0);
    spawnEnemyAt(scene.combatRuntime(), { kind: "trapezoid3", lane: 0, x: outlet.x, time: 0,
      waveNumber: 1, waveWeight: 0, finalDamageReduction: 0 });
    state.pipelineEnemy = scene.enemies.at(-1);
    state.host = scene.startSynchronization(); state.join("a"); state.join("b");
  });
  await pump(); await equal("stored pipeline action join");
  const pipeTarget = await pages.a.evaluate(() => {
    const t = window.syncTest.scene.towers.find(t => t.type === "A");
    return { target: { kind: "tower", id: t.entityId }, cell: { lane: t.lane, column: t.column } };
  });
  assert.equal((await request("a", { type: "operation", operation: { type: "effect", card: "t", ...pipeTarget } })).result, "handled");
  await pages.a.evaluate(() => window.syncTest.client.disconnect());
  await pages.host.evaluate(() => window.syncTest.host.disconnect(window.syncTest.peers.a));
  await pages.a.evaluate(() => window.syncTest.attach()); await pages.host.evaluate(() => window.syncTest.join("a"));
  await pump(); await equal("pending attachment reconnect");
  const closedEdges = await pages.a.evaluate(() => window.syncTest.scene.edgeTowers
    .filter(e => e.mode === "!=").map(e => ({ kind: "edge", id: e.entityId })));
  for (const target of closedEdges) assert.equal((await request("a", {
    type: "operation", operation: { type: "edgeMode", target, mode: ">" }
  })).result, "handled");
  await pages.host.evaluate(async () => {
    const state = window.syncTest;
    for (let i = 0; i < 600; i++) state.scene.update(0, 1000 / 60);
    const outlet = state.scene.towers.find(t => t.type === "1" && t.lane === 1);
    if (!outlet || outlet.trueDamageUntil <= state.scene.battleTime || state.pipelineEnemy.hp >= state.pipelineEnemy.maxHp) {
      throw Error("Routed attachment or stored explosion did not execute");
    }
    state.host.publish(); await state.tail;
  });
  await pump(); content.pipeline = await equal("network pipeline continuation");

  // Peers move and push real layered towers; resync during an unfinished push.
  await pages.host.evaluate(() => window.syncTest.host.close());
  for (const role of roles) mail[role].length = 0;
  for (const role of ["a", "b"]) await pages[role].evaluate(() => { window.syncTest.resetClient(); window.syncTest.attach(); });
  await pages.host.evaluate(async () => {
    const state = window.syncTest, participants = state.scene.session.snapshot().participants;
    state.start({ levelId: "IF-1", seed: 94, participants, selectedCards: ["B", "[]", "m", "#", "s"] });
    const scene = state.scene;
    scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
    for (const [type, lane, column] of [["B", 3, 1], ["[]", 3, 1], ["m", 3, 2], ["m", 3, 4],
      ["#", 1, 0], ["B", 1, 1], ["[]", 1, 1]]) {
      scene.spawnGeneratedTower(type, lane, column, 1); scene.mirrors.syncMirrors();
    }
    const source = scene.spawnGeneratedTower("s", 4, 8, 3, -1); source.lastFire = -20000;
    const { getTowerSkillState } = await import("/src/game/skillState.ts");
    getTowerSkillState(scene.towers.find(t => t.type === "#"), "push").sp = 30;
    state.host = scene.startSynchronization(); state.join("a"); state.join("b");
  });
  await pump(); await equal("layered movement join");
  const pushTarget = await pages.a.evaluate(() => {
    const t = window.syncTest.scene.towers.find(t => t.type === "#"); return { kind: "tower", id: t.entityId };
  });
  assert.equal((await request("a", { type: "operation", operation: { type: "push", target: pushTarget, cell: { lane: 1, column: 1 } } })).result, "handled");
  const shift = await pages.b.evaluate(() => ({
    type: "move", destination: { lane: 0, column: 2 },
    sources: window.syncTest.scene.towers.filter(t => t.lane === 3 && t.column <= 3).map(t => ({
      target: { kind: "tower", id: t.entityId }, lane: t.lane, column: t.column
    }))
  }));
  assert.equal((await request("b", { type: "operation", operation: shift })).result, "forbidden");
  assert.equal((await request("a", { type: "operation", operation: shift })).result, "moved");
  assert.equal((await request("a", { type: "operation", operation: shift })).result, "stale");
  await pages.b.evaluate(() => window.syncTest.client.resync()); await pump(); await equal("mid-movement resync");
  for (const role of roles) assert.equal(await pages[role].evaluate(() => {
    const scene = window.syncTest.scene;
    return !!scene.towers.find(t => t.type === "B" && t.lane === 0 && t.column === 2)?.parenthesisGuard &&
      !!scene.towers.find(t => t.type === "B" && t.lane === 1 && t.column === 2)?.moveVisual &&
      scene.shifter.cooldownRatio() === 0;
  }), true);
  await pages.host.evaluate(async () => {
    const state = window.syncTest;
    for (let i = 0; i < 600; i++) state.scene.update(0, 1000 / 60);
    if (!state.scene.towers.some(t => t.type === "a" && t.lane === 4 && t.level === 3 && t.facingDirection === -1)) {
      throw Error("Generated tower did not inherit source state");
    }
    state.host.publish(); await state.tail;
  });
  await pump(); content.movement = await equal("network movement continuation");

  // A new battle gets new clients/connection scopes. Complete the actual damage tutorial at tick zero.
  await pages.host.evaluate(() => window.syncTest.host.close());
  for (const role of ["a", "b"]) {
    mail[role].length = 0;
    await pages[role].evaluate(() => { window.syncTest.resetClient(); window.syncTest.attach(); });
  }
  await pages.host.evaluate(() => {
    const state = window.syncTest, participants = state.scene.session.snapshot().participants;
    state.start({ levelId: "0-6", seed: 92, participants });
    state.host = state.scene.startSynchronization(); state.join("a"); state.join("b");
  });
  await pump(); await equal("tutorial join");
  await pages.host.evaluate(async () => {
    const state = window.syncTest;
    for (let i = 0; i < 20 && !state.scene.gameOver; i++) state.scene.submitPlayerControl("local", { type: "tutorialAdvance" });
    if (!state.scene.gameOver) throw Error("Tutorial did not reach terminal state");
    await state.tail;
  });
  await pump(); const terminal = await equal("terminal commands at one tick");
  for (const role of ["a", "b"]) assert.equal(await pages[role].evaluate(() => window.syncTest.scene.gameOver), true);
  await pages.b.evaluate(() => window.syncTest.client.resync()); await pump(); await equal("terminal resync");
  for (const role of ["a", "b"]) {
    assert.equal(await pages[role].evaluate(() => JSON.stringify(localStorage) === window.syncTest.profileBefore), true, `${role} profile changed`);
    assert.equal(await pages[role].evaluate(() => window.syncTest.scene.submitPlayerControl("local", { type: "debugChars" })), "unavailable");
  }
  assert.deepEqual(errors, []);
  console.log("Three independent browser processes synchronized over authenticated HTTP", { engines, initial, running, recovered, terminal, content });
} finally {
  for (const browser of browsers) await browser.close();
  await new Promise(resolve => relay.close(resolve));
}
