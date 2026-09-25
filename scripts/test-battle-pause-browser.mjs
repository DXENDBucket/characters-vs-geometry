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
    const { GameScene } = await mod("/src/scenes/GameScene.ts"), progress = await mod("/src/progress.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await mod("/src/game/validateBattleSave.ts");
    const { towerOperationRef: ref } = await mod("/src/game/battleOperations.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { decodeSaveGraph } = await mod("/src/game/saveGraph.ts");
    const cfg = await mod("/src/config.ts"), game = window.__testGame;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const data = { levelId: "IF-BE-4", seed: 829, selectedCards: ["A", "B", "F", "S", "b", "t"] };
    const start = (key, options = data) => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options); return game.scene.getScene(key);
    };
    const control = (scene, value) => check(scene.submitPlayerControl("local", value) === "handled", value.type);
    const operation = (scene, value, expected = "handled") =>
      check(scene.submitPlayerOperation("local", value) === expected, value.type);
    const point = (lane, column) => ({ x: cfg.BOARD_X + (column + .5) * cfg.CELL_WIDTH,
      y: cfg.BOARD_Y + (lane + .5) * cfg.CELL_HEIGHT });
    const original = start("PausedOriginal");
    control(original, { type: "debugMode", enabled: true });
    control(original, { type: "debugChars" }); control(original, { type: "debugChars" });
    control(original, { type: "autoUpgradeEnabled", enabled: false });
    control(original, { type: "reserve", value: 500 }); control(original, { type: "speed", speed: 2.5 });
    control(original, { type: "pause", paused: true });
    const place = (card, lane, column) => {
      operation(original, { type: "deploy", card, cell: { lane, column }, expected: null }, "deployed");
      return original.occupied.get(`${lane}:${column}`);
    };
    const a = place("A", 0, 0), b = place("B", 1, 0), f = place("F", 6, 0), s = place("S", 2, 0);
    s.skills.spellMortar = { sp: 30, spBuffer: 0, activeUntil: 0 };
    operation(original, { type: "trigger", target: ref(f), behavior: "F" });
    operation(original, { type: "skill", skill: "S", targets: [ref(s)], point: point(3, 9) });
    for (const [card, tower] of [["b", a], ["t", b]]) {
      operation(original, { type: "effect", card, cell: { lane: tower.lane, column: tower.column }, target: ref(tower) });
    }
    // Seed enemy/Boss deferred attacks at known deadlines, then use the actual production dispatcher.
    for (const [lane, kind, type] of [[0, "diamond", "enemyShot"], [1, "shootingPentagon", "enemyLaser"], [2, "mortarTriangle", "enemyMortar"]]) {
      spawnEnemyAt(original.combatRuntime(), { kind, lane, x: point(lane, 10).x, waveNumber: 0,
        time: original.battleTime, waveWeight: 0, finalDamageReduction: 0 });
      const enemy = original.enemies.at(-1);
      original.scheduleBattleAction(250, { type, enemy, time: original.battleTime, hitCount: 2 });
    }
    original.scheduleBattleAction(500, { type: "bossReinforcements", boss: original.boss, kind: "slopeTriangle", lanes: [6] });
    original.scheduleBattleAction(750, { type: "volley", tower: a, hitCount: 2, copyRevision: a.copyRevision });
    const pending = original.actionQueue.snapshot(), counts = {};
    for (const { action } of pending) counts[action.type] = (counts[action.type] ?? 0) + 1;
    for (const type of ["shock", "spellMortar", "targetedEffect", "enemyShot", "enemyLaser", "enemyMortar", "bossReinforcements", "volley"]) {
      check(counts[type] > 0, `Missing pending ${type}`);
    }
    check(!f.inPlay && !original.towers.includes(f), "Shock source should already be removed");
    const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(original.battleState()))), pausedHash = original.battleChecksum();
    validateBattleSave(graph, original.wave, original.levelConfig.bossKind);
    const invalid = structuredClone(graph);
    const controlsNode = invalid.nodes.find(n => Object.hasOwn(n.data, "paused") && Object.hasOwn(n.data, "reserveChars"));
    controlsNode.data.speed = 100;
    let rejected = false; try { validateBattleSave(invalid, original.wave, original.levelConfig.bossKind); } catch { rejected = true; }
    check(rejected, "Save validator accepted invalid controls");
    check(original.saveSurvivalBattle(), "Paused save failed");
    const restored = start("PausedResume", { levelId: data.levelId, resume: true });
    game.scene.processQueue();
    check(restored.menuOpen && game.scene.isPaused("PausedResume"), "Resume did not show a local paused menu");
    restored.closePauseMenu(); game.scene.processQueue();
    check(restored.battlePaused && restored.battleChecksum() === pausedHash, "Closing local menu changed saved authoritative pause");
    const direct = start("PausedDirect");
    if (direct.boss) { direct.boss.body.destroy(); direct.boss = null; }
    direct.applyBattleSave(restoreBattleSnapshot(direct, graph));
    check(direct.battlePaused && direct.battleChecksum() === pausedHash && !direct.menuOpen, "Direct restore changed controls or opened local UI");
    const restoredShock = restored.actionQueue.snapshot().find(e => e.action.type === "shock").action.tower;
    check(!restoredShock.inPlay && restoredShock.entityId === f.entityId, "Pending shock lost its removed source identity");
    const noResume = start("PausedPlayback", { replay: restored.exportReplay() });
    for (let i = 0; i < 10; i++) for (const scene of [original, restored, direct, noResume]) scene.update(0, 10000);
    for (const scene of [original, restored, direct, noResume]) {
      check(scene.simulation.tick === 0 && scene.battleChecksum() === pausedHash, "Paused save advanced or dispatched attacks");
    }
    game.scene.stop("PausedPlayback");
    const trace = scene => {
      const events = [], execute = scene.executeBattleAction.bind(scene);
      scene.executeBattleAction = action => {
        events.push([scene.simulation.tick, action.type, action.tower?.entityId ?? action.enemy?.entityId ?? action.boss?.entityId]);
        execute(action);
      };
      return events;
    };
    const traces = [original, restored, direct].map(trace);
    control(original, { type: "pause", paused: false }); control(direct, { type: "pause", paused: false });
    restored.openPauseMenu(); game.scene.processQueue();
    restored.pauseMenu.buttons.find(button => button.key === "button.resume").element.click(); game.scene.processQueue();
    check(!restored.battlePaused && restored.exportReplay().commands.length === 1 &&
      restored.exportReplay().commands[0].command.control.type === "pause", "Continue did not record an explicit resume command");
    for (let i = 0; i < 240; i++) {
      for (const scene of [original, restored, direct]) scene.update(0, (1000 / 60) / scene.gameSpeed);
      if (i === 0) check(restored.occupied.get("0:0")?.facingDirection === -1, "b effect was not applied");
    }
    const hash = original.battleChecksum(), eventLog = JSON.stringify(traces[0]);
    for (const [index, scene] of [original, restored, direct].entries()) {
      check(scene.simulation.tick === 240 && scene.battleChecksum() === hash, `Continuation ${index} diverged`);
      check(JSON.stringify(traces[index]) === eventLog, `Pending action order/count changed in ${index}`);
    }
    check(traces[0].filter(e => e[1] === "shock").length === counts.shock, "Shock volley duplicated or lost");
    check(traces[0].filter(e => e[1] === "targetedEffect").length === 2, "Attachments resolved more than once");
    check(traces[0].filter(e => e[1] === "spellMortar").length === counts.spellMortar, "S salvo duplicated or lost");
    const replay = restored.exportReplay(), storage = JSON.stringify(localStorage);
    for (const [index, delta] of [1000 / 30, 1000 / 144].entries()) {
      const played = start(`PauseReplay${index}`, { replay }), events = trace(played);
      for (let i = 0; i < 10000 && !played.session.playbackComplete; i++) played.update(0, delta);
      check(played.battleChecksum() === hash && JSON.stringify(events) === eventLog, `Paused checkpoint replay ${index} diverged`);
      game.scene.stop(played.sys.settings.key);
    }
    check(JSON.stringify(localStorage) === storage, "Playback wrote profile state");
    const legacy = decodeSaveGraph(graph, () => ({})); delete legacy.simulation.controls;
    const migrated = start("LegacyPausedSave");
    if (migrated.boss) { migrated.boss.body.destroy(); migrated.boss = null; }
    migrated.applyBattleSave(restoreBattleSnapshot(migrated, captureBattleSnapshot(legacy)));
    check(!migrated.battlePaused && migrated.gameSpeed === 2.5 && migrated.autoUpgradeReserveChars === 500 &&
      !migrated.autoUpgradeEnabled && migrated.debugModeEnabled, "Legacy control migration changed saved settings");
    // A normal running save opens a local menu without inventing a pause/resume command pair.
    check(restored.saveSurvivalBattle(), "Running save failed");
    const runningResume = start("RunningResume", { levelId: data.levelId, resume: true }); game.scene.processQueue();
    check(runningResume.menuOpen && !runningResume.battlePaused && runningResume.battleChecksum() === hash, "Local resume hold changed battle data");
    runningResume.pauseMenu.buttons.find(button => button.key === "button.resume").element.click(); game.scene.processQueue();
    check(runningResume.exportReplay().commands.length === 0, "Closing an ordinary resume menu wrote a battle command");
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    return { hash, pending: counts, pausedRestore: true, replayRates: [30, 144], legacyMigration: true };
  });
  assert.deepEqual(errors, []); console.log("Live paused action snapshots passed", result);
} finally { await browser.close(); }
