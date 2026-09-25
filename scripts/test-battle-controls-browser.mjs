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
    const cfg = await mod("/src/config.ts"), progress = await mod("/src/progress.ts");
    const { towerOperationRef, edgeOperationRef } = await mod("/src/game/battleOperations.ts");
    const { executeBattleControl } = await mod("/src/game/battleControls.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const game = window.__testGame, check = (value, message) => { if (!value) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const data = { levelId: "IF-1", seed: 1127, selectedCards: ["A", "B", "X", "=", "?A"] };
    const start = (key, options = data) => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options); return game.scene.getScene(key);
    };
    const a = start("ControlUI"), b = start("ControlCommands");
    const calls = [], oldApply = a.applyPlayerControl.bind(a);
    a.applyPlayerControl = (actor, control) => { calls.push(control.type); return oldApply(actor, control); };
    const equal = label => check(a.battleChecksum() === b.battleChecksum(), `${label}: ${a.battleChecksum()} / ${b.battleChecksum()}`);
    const send = (control, expected = "handled", scene = b) => {
      const result = scene.submitPlayerControl("local", structuredClone(control));
      check(result === expected, `${control.type}: ${result}, expected ${expected}`);
    };
    const op = (scene, operation, expected = "handled") => check(scene.submitPlayerOperation("local", operation) === expected, operation.type);
    a.submitBattleCommand({ type: "debugMode", enabled: true }); send({ type: "debugMode", enabled: true });
    a.grantDebugChars(); send({ type: "debugChars" }); equal("debug grant");
    a.toggleAutoUpgradeEnabled(); send({ type: "autoUpgradeEnabled", enabled: false }); equal("auto disabled");
    for (const scene of [a, b]) {
      op(scene, { type: "deploy", card: "A", cell: { lane: 3, column: 0 }, expected: null }, "deployed");
      op(scene, { type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 3, column: 0 }, expected: null });
      op(scene, { type: "autoUpgrade", enabled: true, targets: [towerOperationRef(scene.towers[0]), edgeOperationRef(scene.edgeTowers[0])] });
      scene.submitPlayerControl("local", { type: "debugChars" });
    }
    a.submitBattleCommand({ type: "selectCard", id: "A" }); b.submitBattleCommand({ type: "selectCard", id: "B" }); equal("different local cards");
    a.focusAutoUpgradeReserveInput(); const countBeforeTyping = a.exportReplay().commands.length;
    for (const key of ["5", "0", "0"]) a.handleAutoUpgradeReserveKey({ key, preventDefault() {} });
    check(a.autoUpgradeReserveInputFocused && a.autoUpgradeReserveDraft === 500 && a.autoUpgradeReserveChars === 0, "Draft leaked into authoritative reserve");
    check(a.exportReplay().commands.length === countBeforeTyping, "Draft keystrokes were recorded as battle changes"); equal("local reserve typing");
    const oldLevel = a.towers[0].level, oldEdge = a.edgeTowers[0].level;
    send({ type: "autoUpgradeEnabled", enabled: true }, "handled", a); send({ type: "autoUpgradeEnabled", enabled: true });
    check(a.towers[0].level > oldLevel && a.edgeTowers[0].level > oldEdge, "Focused reserve field still suspended tower/edge auto upgrade");
    check(a.autoUpgradeReserveInputFocused, "Remote setting cleared a local draft"); equal("upgrade despite local focus");
    a.handleAutoUpgradeReserveKey({ key: "Enter", preventDefault() {} }); send({ type: "reserve", value: 500 }); equal("reserve commit");
    a.requestGameSpeed(2.5); send({ type: "speed", speed: 2.5 });
    check(a.time.timeScale === 2.5 && b.time.timeScale === 2.5, "Speed did not reach live adapter");
    a.toggleBattlePause(); send({ type: "pause", paused: true });
    const pausedTick = a.simulation.tick;
    for (let i = 0; i < 20; i++) { a.update(0, 1000 / 60); b.update(0, 1000 / 60); }
    check(a.simulation.tick === pausedTick && b.simulation.tick === pausedTick, "Paused controls allowed a combat tick");
    a.toggleBattlePause(); send({ type: "pause", paused: false }); a.requestGameSpeed(1); send({ type: "speed", speed: 1 });
    a.toggleSuperDebugDamageMode();
    const point = { x: cfg.BOARD_X + 5.5 * cfg.CELL_WIDTH, y: cfg.BOARD_Y + 3.5 * cfg.CELL_HEIGHT };
    a.submitBattleCommand({ type: "pointer", pointer: { ...point, shift: false, ctrl: false, right: false } });
    send({ type: "debugDamage", mode: "super", point }); equal("debug damage");
    send({ type: "reselect", cards: ["X"] }, "cooldown");
    for (let i = 0; i < 14500; i++) { a.update(0, 1000 / 60); b.update(0, 1000 / 60); }
    equal("simulation with different local tools");
    const requested = { type: "reselect", cards: ["B", "?A", "="] };
    const runtime = b.createPlayerControlRuntime(), before = b.battleChecksum(); runtime.slotCount = 1;
    check(executeBattleControl("local", requested, runtime) === "forbidden", "Slot policy bypassed");
    check(b.battleChecksum() === before, "Rejected loadout spent reselection cooldown");
    runtime.slotCount = 10; runtime.cardAllowed = id => id !== "?A";
    check(executeBattleControl("local", requested, runtime) === "forbidden", "Card unlock policy bypassed");
    check(b.battleChecksum() === before, "Locked card partially changed loadout");
    b.cardList.cards.find(card => card.state.definition.id === "?A").displayTime = -10000;
    a.submitBattleCommand(requested); send(requested); equal("reselection ignores stale display clock");
    check(b.selectedCardIds.join() === "B,?A,=", "Loadout was not applied exactly");
    const checkpoint = structuredClone(captureBattleSnapshot(b.battleState())), restored = start("RestoredControls");
    // The save's loadout is normally provided by the save envelope before constructing the scene.
    game.scene.stop(restored.sys.settings.key); game.scene.start(restored.sys.settings.key, { ...data, selectedCards: b.selectedCardIds });
    restored.applyBattleSave(restoreBattleSnapshot(restored, checkpoint)); restored.battlePaused = false;
    check(restored.debugModeEnabled === b.debugModeEnabled, "Saved debug control was lost");
    send({ type: "debugChars" }, "handled", a); send({ type: "debugChars" }); send({ type: "debugChars" }, "handled", restored);
    equal("debug after checkpoint"); check(b.battleChecksum() === restored.battleChecksum(), "Restored controls diverged");
    for (let i = 0; i < 120; i++) { a.update(0, 1000 / 60); b.update(0, 1000 / 60); restored.update(0, 1000 / 60); }
    equal("final"); check(b.battleChecksum() === restored.battleChecksum(), "Restored continuation diverged");
    const replay = b.exportReplay(), expected = b.battleChecksum();
    for (const [index, delta] of [1000 / 30, 1000 / 144].entries()) {
      const scene = start(`ControlReplay${index}`, { replay });
      for (let i = 0; scene.simulation.tick < replay.endTick && i < 80000; i++) scene.update(0, delta);
      check(scene.simulation.tick === replay.endTick && scene.battleChecksum() === expected,
        `Control replay ${index} diverged: ${scene.simulation.tick}/${replay.endTick} ${scene.battleChecksum()}/${expected}`);
    }
    const menu = start("MenuControl"), menuHash = menu.battleChecksum(); menu.openPauseMenu();
    check(menu.submitPlayerControl("visitor", { type: "debugMode", enabled: true }) === "forbidden", "Unknown controller accepted");
    check(menu.battleChecksum() === menuHash, "Menu state changed combat checksum");
    send({ type: "reserve", value: 321 }, "handled", menu);
    check(menu.autoUpgradeReserveChars === 321 && menu.menuOpen, "Local menu blocked an authorized control"); menu.closePauseMenu();
    send({ type: "debugMode", enabled: true }, "handled", menu); menu.toggleSuperDebugDamageMode();
    send({ type: "debugMode", enabled: false }, "handled", menu);
    check(menu.debugDamageMode === null, "Disabling debug left a hidden damage picker active");
    const tutorial = start("TutorialControl", { levelId: "0-1", seed: 81 });
    check(tutorial.submitPlayerControl("local", { type: "tutorialAdvance" }) === "handled", "Tutorial did not use control executor");
    check(tutorial.submitPlayerControl("local", { type: "reselect", cards: ["A"] }) === "forbidden", "Tutorial loadout could be replaced");
    for (const type of ["debugMode", "debugChars", "debugDamage", "pause", "speed", "reserve", "autoUpgradeEnabled", "reselect"]) {
      check(calls.includes(type), `UI bypassed ${type}`);
    }
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    return { ticks: replay.endTick, checksum: expected, controlKinds: new Set(calls).size, checkpoint: true };
  });
  assert.deepEqual(errors, []); console.log("Live global controls, local UI isolation and replay passed", result);
} finally { await browser.close(); }
