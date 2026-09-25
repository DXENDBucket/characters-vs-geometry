import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { load, captureBattleSnapshot, battleChecksum } from "./helpers/battle-runtime.mjs";
const option = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const playwright = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { BattleSyncHost } = load("src/game/battleSyncHost.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { BATTLE_PERMISSIONS } = load("src/game/battleParticipants.ts");
const { getTowerSkillState } = load("src/game/skillState.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
const url = option("url") ?? "http://127.0.0.1:5173", token = randomUUID(), outbound = [], errors = [];
let runtime, host, authority, peer, browser, dropReceipt = false;
const hash = () => battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0]));
const send = message => {
  if (dropReceipt && message.type === "receipt") { dropReceipt = false; return; }
  outbound.push(JSON.stringify(message));
};
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", new URL(url).origin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
  if (req.url === "/connect") { outbound.length = 0; peer = host.connect("student", send); res.end(); return; }
  if (req.url === "/poll") { res.end(JSON.stringify(outbound.splice(0))); return; }
  if (req.url === "/disconnect") { host?.disconnect(peer); res.end(); return; }
  if (req.method !== "POST" || req.url !== "/send") { res.writeHead(404).end(); return; }
  try {
    const parts = []; let bytes = 0;
    for await (const part of req) { bytes += part.length; if (bytes > 66000) throw Error("Request too large"); parts.push(part); }
    res.writeHead(host.receiveText(peer, Buffer.concat(parts).toString("utf8")) ? 200 : 400).end();
  } catch (error) { errors.push(error.message); res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const engine = option("engine") ?? "firefox";
  browser = await playwright[engine].launch({ executablePath: engine === "chromium" ? option("browser") : undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 1410, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(url); await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async ({ relay, token }) => {
    const { RemoteBattleSession } = await import("/src/render/remoteBattleSession.ts");
    const game = window.__testGame;
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const state = window.actions = { tail: Promise.resolve(), receipts: [], profile: JSON.stringify(localStorage) };
    document.addEventListener("mousedown", event => { state.lastPointer = { button: event.button, ctrl: event.ctrlKey }; }, true);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    state.start = () => {
      state.remote = new RemoteBattleSession(game, { actorId: "student", onExit() {},
        receipt: receipt => state.receipts.push(receipt), transport: events => {
          state.link = events;
          state.tail = state.tail.then(async () => { await fetch(relay + "/connect", { method: "POST", headers }); events.open(); });
          return { send: text => {
            state.tail = state.tail.then(async () => {
              const response = await fetch(relay + "/send", { method: "POST", headers, body: text });
              if (!response.ok) throw Error("Host rejected transport");
            });
          }, close: () => { state.tail = state.tail.then(() => fetch(relay + "/disconnect", { method: "POST", headers })); } };
        } });
      state.remote.start();
    };
    state.poll = async () => {
      await state.tail;
      const messages = await (await fetch(relay + "/poll", { headers })).json();
      for (const text of messages) state.link.message(text);
      await state.tail; return messages.length;
    };
  }, { relay: `http://127.0.0.1:${server.address().port}`, token });
  const pump = async () => {
    for (let i = 0; i < 30; i++) if (!await page.evaluate(() => window.actions.poll()) && !outbound.length) {
      assert.equal(await page.evaluate(() => window.actions.remote.connection.ready), true);
      return;
    }
    throw Error("Sync did not settle");
  };
  const equal = async () => assert.equal(await page.evaluate(() => window.actions.remote.scene.battleChecksum()), hash());
  const advance = async ticks => {
    for (let i = 0; i < ticks; i++) runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
    host.publish(); await pump(); await equal();
  };
  const start = async (levelId, cards, prepare = () => {}) => {
    await page.evaluate(async () => { window.actions.remote?.close(); await window.actions.tail; });
    host?.close(); authority?.close(); outbound.length = 0;
    runtime = createIndependentBattle({ version: BATTLE_RULES_VERSION, difficultyVersion: 2,
      levelId, seed: 555, difficulty: 3, unlimitedFirepower: false, debug: false, selectedCards: cards,
      policy: LEGACY_BATTLE_POLICY, participants: [{ id: "student", permissions: BATTLE_PERMISSIONS }] });
    prepare();
    authority = new BattleAuthority(randomUUID(), runtime.session, {
      available: () => !runtime.world.gameOver, inputTime: () => performance.now(), execute: command => runtime.executeCommand(command)
    });
    host = new BattleSyncHost(runtime.session, authority, { inputTime: () => performance.now(), checksum: hash,
      checkpoint: () => runtime.session.checkpointReplay(captureBattleSnapshot(runtime.snapshot(cards[0])), runtime.world.loadout.ids) });
    await page.evaluate(() => window.actions.start()); await pump(); await equal();
  };
  const click = async (target, { ctrl = false, button = "left" } = {}) => {
    const point = await page.evaluate(async target => {
      const scene = window.actions.remote.scene, { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = await import("/src/config.ts");
      let p;
      if (target.cell) p = { x: BOARD_X + (target.cell[1] + .5) * CELL_WIDTH, y: BOARD_Y + (target.cell[0] + .5) * CELL_HEIGHT };
      else {
        const object = target.tutorial ? scene.tutorialView.button : target.card
          ? scene.cardList.cards.find(card => card.state.definition.id === target.card).frame : scene.ui[target.button];
        const rect = object.getBounds(); p = { x: rect.centerX, y: rect.centerY };
      }
      p = scene.cameras.main.matrix.transformPoint(p.x - scene.cameras.main.scrollX, p.y - scene.cameras.main.scrollY);
      const rect = window.__testGame.canvas.getBoundingClientRect();
      return { x: rect.x + p.x * rect.width / scene.scale.width, y: rect.y + p.y * rect.height / scene.scale.height };
    }, target);
    if (ctrl) await page.keyboard.down("Control");
    try { await page.mouse.click(point.x, point.y, { button }); } finally { if (ctrl) await page.keyboard.up("Control"); }
    await page.waitForTimeout(60); await page.evaluate(() => window.actions.tail);
    await pump(); await equal();
  };
  const tutorialStep = step => assert.equal(runtime.world.tutorial.snapshot().step, step);
  await start("0-5", ["A", "B"]);
  await click({ tutorial: true }); tutorialStep("deploy");
  await click({ card: "A" }); await click({ cell: [1, 2] }); await advance(601);
  await click({ cell: [3, 2] }); await click({ card: "B" }); await click({ cell: [4, 3] });
  await advance(1); tutorialStep("singleTool");
  await click({ button: "shifterButton" }); await advance(1); tutorialStep("singleSelect");
  await click({ cell: [1, 2] }); await advance(1); tutorialStep("singleMove");
  await click({ cell: [1, 5] }); await advance(1); tutorialStep("cooldown");
  assert.deepEqual(runtime.world.tutorialInteraction, { tool: "none", selected: [] });
  await advance(901); tutorialStep("multiTool");
  await click({ button: "shifterButton" }); await advance(1); tutorialStep("multiFirst");
  await click({ cell: [3, 2] }); await advance(1); tutorialStep("multiSecond");
  await click({ cell: [4, 3] }, { ctrl: true });
  assert.equal(runtime.world.tutorialInteraction.tool, "shifter", JSON.stringify(await page.evaluate(() => window.actions.lastPointer)));
  await advance(1); tutorialStep("multiMove");
  dropReceipt = true;
  await click({ cell: [3, 7] });
  const movedSequence = runtime.session.nextCommandSequence;
  await page.evaluate(() => window.actions.remote.connection.reconnect()); await pump(); await equal();
  assert.equal(runtime.session.nextCommandSequence, movedSequence + 1, "Restored view must finish the pending tutorial observation exactly once");
  await advance(1); tutorialStep("complete");
  assert.ok(runtime.world.towers.some(t => t.type === "B" && t.lane === 4 && t.column === 8));
  await click({ tutorial: true }); assert.equal(runtime.world.result.outcome, "victory");

  // Real click/aim paths for both targeted SP skills. Only initial fixture preparation is direct.
  await start("IF-1", ["A", "S", "#"], () => {
    runtime.world.chars = 100000; runtime.session.controls.autoUpgradeEnabled = false;
    for (const [card, lane, column] of [["S", 1, 2], ["#", 3, 2], ["A", 3, 3]]) {
      assert.equal(runtime.executeOperation("student", { type: "deploy", card, cell: { lane, column }, expected: null }), "deployed");
    }
    getTowerSkillState(runtime.world.towers[0], "spellMortar").sp = 30;
    getTowerSkillState(runtime.world.towers[1], "push").sp = 30;
  });
  await click({ card: "A" });
  const beforeAim = runtime.session.nextCommandSequence;
  await click({ cell: [1, 2] });
  assert.equal(runtime.session.nextCommandSequence, beforeAim, "Aiming must stay local");
  assert.equal(runtime.skills.snapshotFlights().length, 0);
  await click({ cell: [2, 7] }, { button: "right" });
  assert.equal(await page.evaluate(() => window.actions.remote.scene.towerSkills.hasSpellMortarTargeting()), false);
  assert.equal(runtime.session.nextCommandSequence, beforeAim, "Right-click cancellation must stay local");
  await click({ cell: [1, 2] });
  dropReceipt = true;
  await click({ cell: [2, 7] });
  const firedSequence = runtime.session.nextCommandSequence;
  assert.equal(firedSequence, beforeAim + 1);
  const fired = runtime.session.recordedCommands(beforeAim)[0].command.operation;
  assert.equal(fired.type, "skill"); assert.equal(fired.skill, "S");
  assert.ok(Math.abs(fired.point.x - (BOARD_X + 7.5 * CELL_WIDTH)) < 1);
  assert.ok(Math.abs(fired.point.y - (BOARD_Y + 2.5 * CELL_HEIGHT)) < 1);
  assert.equal(getTowerSkillState(runtime.world.towers[0], "spellMortar").sp, 0);
  assert.equal(await page.evaluate(() => window.actions.remote.connection.busy), true);
  await click({ cell: [2, 7] }); assert.equal(runtime.session.nextCommandSequence, firedSequence);
  await page.evaluate(() => window.actions.remote.connection.reconnect()); await pump(); await equal();
  assert.equal(runtime.session.nextCommandSequence, firedSequence, "Lost receipt replayed skill");
  assert.equal(await page.evaluate(() => window.actions.remote.connection.busy), false);
  await advance(31);
  await click({ cell: [3, 2] });
  assert.equal(runtime.session.nextCommandSequence, firedSequence, "Push targeting must stay local");
  await click({ cell: [3, 3] }); await advance(31);
  assert.ok(runtime.world.towers.some(t => t.type === "A" && t.lane === 3 && t.column === 4));
  assert.equal(getTowerSkillState(runtime.world.towers.find(t => t.type === "#"), "push").sp < 1, true);
  await page.screenshot({ path: "logs/remote-actions.png" });
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage) === window.actions.profile), true);
  assert.deepEqual(errors, []);
  console.log("Remote tutorial single/group move and targeted skills passed", { engine, checksum: hash() });
} finally {
  if (browser) await browser.close();
  host?.close(); authority?.close();
  await new Promise(resolve => server.close(resolve));
}
