import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const result = await page.evaluate(async () => {
    const mod = path => import(performance.getEntriesByType("resource").map(e => e.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const { GameScene } = await mod("/src/scenes/GameScene.ts");
    const { dispatchBattleUi: input, assertSemanticRecording } = await import("/scripts/helpers/battle-ui.mjs");
    const config = await mod("/src/config.ts"), progress = await mod("/src/progress.ts");
    const { battleChecksum } = await mod("/src/game/battleChecksum.ts");
    const { towerOperationRef, edgeOperationRef } = await mod("/src/game/battleOperations.ts");
    const { executeLiveBattleOperation } = await mod("/src/game/battleOperationRuntime.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const check = (value, message) => { if (!value) throw Error(message); };
    const data = { levelId: "IF-1", seed: 592, selectedCards: ["A", "B", "0", "=", "b", "()", "m", "1"] };
    const start = (key, options = data) => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options);
      return game.scene.getScene(key);
    };
    const a = start("PointerWorld"), b = start("OperationWorld");
    const calls = [], oldApply = a.applyPlayerOperation.bind(a);
    a.applyPlayerOperation = (actor, operation) => { calls.push(operation.type); return oldApply(actor, operation); };
    const pointer = (lane, column, extra = {}) => ({ type: "pointer", pointer: {
      x: config.BOARD_X + (column + .5) * config.CELL_WIDTH,
      y: config.BOARD_Y + (lane + .5) * config.CELL_HEIGHT, shift: false, ctrl: false, right: false, ...extra
    } });
    const edgePointer = (lane, column, extra = {}) => pointer(lane, column, {
      x: config.BOARD_X + (column + 1) * config.CELL_WIDTH, ...extra
    });
    const tool = (scene, action) => input(scene, { type: "tool", action: `tool:${action}` });
    const tower = (scene, type, lane, column) => scene.towers.find(t => t.inPlay && t.type === type && t.lane === lane && t.column === column);
    const send = (operation, expected = "handled", actor = "local") => {
      const result = b.submitPlayerOperation(actor, JSON.parse(JSON.stringify(operation)));
      check(result === expected, `${operation.type}: expected ${expected}, got ${result}`); return result;
    };
    const hash = scene => battleChecksum(scene.battleState());
    const equal = label => check(hash(a) === hash(b), `UI/operation mismatch after ${label}: ${hash(a)} / ${hash(b)}`);
    for (const scene of [a, b]) { input(scene, { type: "debugMode", enabled: true }); tool(scene, "debugChars"); }
    const resetCards = () => { tool(a, "debugChars"); tool(b, "debugChars"); };
    const deploy = (card, lane, column, expected = null) => {
      input(a, { type: "selectCard", id: card }); input(a, pointer(lane, column));
      input(b, { type: "selectCard", id: "B" });
      send({ type: "deploy", card, cell: { lane, column }, expected }, "deployed"); equal(`deploy ${card}`);
    };
    deploy("A", 3, 1); deploy("()", 3, 1);
    resetCards(); deploy("A", 3, 1, towerOperationRef(tower(b, "A", 3, 1)));
    deploy("m", 3, 2);
    deploy("1", 0, 5);
    check(tower(b, "A", 3, 3)?.mirrorGroupId, "Real mirror network was not formed");
    const restricted = b.createPlayerOperationRuntime(), beforeDeniedUpgrade = b.battleChecksum();
    restricted.authorize = (_actor, _op, affected) => !affected.towers.includes(tower(b, "A", 3, 3));
    check(executeLiveBattleOperation(restricted, "local", { type: "deploy", card: "A", cell: { lane: 3, column: 1 },
      expected: towerOperationRef(tower(b, "A", 3, 1)) }) === "forbidden", "Mirror upgrade skipped authorization of the other member");
    check(b.battleChecksum() === beforeDeniedUpgrade, "Denied mirror upgrade mutated state");
    input(a, { type: "selectCard", id: "b" }); input(a, pointer(3, 1));
    send({ type: "effect", card: "b", cell: { lane: 3, column: 1 }, target: towerOperationRef(tower(b, "A", 3, 1)) });
    equal("targeted effect");
    input(a, { type: "selectCard", id: "=" }); input(a, edgePointer(0, 0));
    send({ type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 0, column: 0 }, expected: null });
    equal("edge placement");
    resetCards();
    input(a, { type: "selectCard", id: "=" }); input(a, edgePointer(0, 0));
    send({ type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 0, column: 0 }, expected: edgeOperationRef(b.edgeTowers[0]) });
    equal("edge upgrade");
    input(a, { type: "selectCard", id: "B" }); input(a, edgePointer(0, 0));
    send({ type: "edgeMode", target: edgeOperationRef(b.edgeTowers[0]), mode: ">" }); equal("edge direction");
    tool(a, "autoUpgrade"); input(a, pointer(3, 1, { shift: true }));
    send({ type: "autoUpgrade", enabled: true, targets: b.towers.filter(t => t.inPlay && t.type === "A").map(towerOperationRef) });
    equal("group auto upgrade");
    input(a, pointer(3, 1, { shift: true }));
    send({ type: "autoUpgrade", enabled: false, targets: b.towers.filter(t => t.inPlay && t.type === "A").map(towerOperationRef) });
    equal("disable group auto upgrade");
    tool(a, "shifter");
    for (let column = 1; column <= 3; column++) input(a, pointer(3, column, { ctrl: column > 1 }));
    const sources = [1, 2, 3].map(column => {
      const target = b.towers.find(t => t.inPlay && t.lane === 3 && t.column === column && t.type !== "()");
      return { target: towerOperationRef(target), lane: 3, column };
    });
    input(a, pointer(5, 4));
    b.shifter.setActive(true); b.shifter.handlePointer(0, 5, tower(b, "1", 0, 5), false);
    send({ type: "move", sources, destination: { lane: 5, column: 4 } }, "moved"); equal("mirror move");
    check(b.shifter.isActive() && b.shifter.selectedTowers()[0] === tower(b, "1", 0, 5), "Explicit move cleared unrelated local selection");
    b.shifter.deactivate();
    const edge = edgeOperationRef(b.edgeTowers[0]);
    tool(a, "erase"); input(a, edgePointer(0, 0));
    send({ type: "erase", target: edge }); equal("edge erase");
    const original = towerOperationRef(tower(b, "A", 5, 4));
    tool(a, "erase"); input(a, pointer(5, 4));
    send({ type: "erase", target: original }); equal("mirror erase");
    check(!b.towers.some(t => t.inPlay && t.type === "A"), "Mirror erase did not propagate");
    const before = b.battleChecksum();
    send({ type: "erase", target: original }, "stale");
    send({ type: "edgeMode", target: edge, mode: "=" }, "stale");
    send({ type: "deploy", card: "A", cell: { lane: 5, column: 4 }, expected: original }, "stale");
    send({ type: "deploy", card: "A", cell: { lane: 0, column: 0 }, expected: null }, "forbidden", "visitor");
    send({ type: "deploy", card: "U", cell: { lane: 0, column: 0 }, expected: null }, "forbidden");
    send({ type: "deploy", card: "b", cell: { lane: 0, column: 0 }, expected: null }, "invalid");
    send({ type: "effect", card: "A", cell: { lane: 0, column: 0 }, target: null }, "invalid");
    send({ type: "edgeCard", card: "A", position: { axis: "horizontal", lane: 0, column: 0 }, expected: null }, "invalid");
    send({ type: "autoUpgrade", targets: [towerOperationRef(tower(b, "m", 5, 5)), towerOperationRef(tower(b, "1", 0, 5))], enabled: true }, "invalid");
    check(b.battleChecksum() === before, "Rejected request spent resources or mutated battle");
    check(["deploy", "effect", "edgeCard", "edgeMode", "autoUpgrade", "move", "erase"].every(type => calls.includes(type)), "UI bypassed semantic gate");
    const step = 1000 / 60;
    for (let i = 0; i < 240; i++) { a.update(0, step); b.update(0, step); }
    equal("continued combat");
    const expected = b.battleChecksum(), replay = b.exportReplay(), uiReplay = assertSemanticRecording(a);
    check(replay.commands.some(entry => entry.command.type === "operation"), "Semantic commands were not recorded");
    for (const [mode, recording] of [["UI", uiReplay], ["API", replay]]) {
      for (const [index, delta] of [1000 / 30, 1000 / 144].entries()) {
        const scene = start(`Replay${mode}${index}`, { replay: recording });
        for (let i = 0; scene.simulation.tick < recording.endTick && i < 3000; i++) scene.update(0, delta);
        check(scene.battleChecksum() === expected, `${mode} semantic replay diverged`);
      }
    }
    const checkpoint = JSON.parse(JSON.stringify(captureBattleSnapshot(b.battleState()))), c = start("RestoredOperations");
    c.applyBattleSave(restoreBattleSnapshot(c, checkpoint)); c.battlePaused = false;
    const target = b.towers.find(t => t.inPlay && t.type === "m"), request = { type: "erase", target: towerOperationRef(target) };
    check(c.submitPlayerOperation("local", request) === b.submitPlayerOperation("local", request), "Restored explicit target did not resolve");
    check(c.battleChecksum() === b.battleChecksum(), "Restored operation changed identity or state");
    const unlimited = start("ColumnAuthorization", { ...data, unlimitedFirepower: true });
    input(unlimited, { type: "debugMode", enabled: true }); tool(unlimited, "debugChars");
    check(unlimited.submitPlayerOperation("local", { type: "deploy", card: "A", cell: { lane: 3, column: 2 }, expected: null }) === "deployed",
      "Unlimited deployment failed");
    check(unlimited.towers.filter(t => t.type === "A").length === config.LANES, "Missing column fixture");
    const columnRuntime = unlimited.createPlayerOperationRuntime(), columnHash = unlimited.battleChecksum();
    columnRuntime.authorize = (_actor, _op, affected) => !affected.towers.some(t => t.lane === 6);
    const recipient = towerOperationRef(tower(unlimited, "A", 3, 2));
    for (const operation of [{ type: "deploy", card: "A", cell: { lane: 3, column: 2 }, expected: recipient },
      { type: "effect", card: "b", cell: { lane: 3, column: 2 }, target: recipient }]) {
      check(executeLiveBattleOperation(columnRuntime, "local", operation) === "forbidden", "Column operation authorized only the clicked row");
      check(unlimited.battleChecksum() === columnHash, "Denied column operation partially executed");
    }
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    return { operationKinds: new Set(calls).size, ticks: 240, checksum: expected,
      commands: replay.commands.filter(entry => entry.command.type === "operation").length, restore: true };
  });
  assert.deepEqual(errors, []);
  console.log("UI/semantic battle operation checks passed", result);
} finally { await browser.close(); }
