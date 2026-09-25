// Requires a running Vite server and Playwright (or --playwright=/path/to/playwright/index.js).
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const modulePath = option("playwright");
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const results = await page.evaluate(async () => {
    const config = await import("/src/config.ts");
    const progress = await import("/src/progress.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { battleChecksum } = await import("/src/game/battleChecksum.ts");
    const game = window.__testGame;
    game.loop.stop();
    progress.unlockAllCards();
    progress.completeAllLevels();
    const results = [];
    const start = data => {
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start("GameScene", data);
      return game.scene.getScene("GameScene");
    };
    const pointer = (lane, column, extra = {}) => ({ type: "pointer", pointer: {
      x: config.BOARD_X + (column + .5) * config.CELL_WIDTH, y: config.BOARD_Y + (lane + .5) * config.CELL_HEIGHT,
      ctrl: false, shift: false, right: false, ...extra
    } });
    const tool = action => ({ type: "tool", action: `tool:${action}` });
    const go = (scene, ticks, deltas) => {
      let i = 0;
      while (scene.simulation.tick < ticks && !scene.gameOver && i++ < ticks * 10) scene.update(0, deltas[i % deltas.length]);
      if (scene.simulation.tick !== ticks && !scene.gameOver) throw Error(`Wrong tick ${scene.simulation.tick}`);
    };
    const checkReplay = (replay, expected) => {
      const storage = JSON.stringify(localStorage);
      for (const deltas of [[1000 / 30], [1000 / 144], [7, 31, 110, 2, 19]]) {
        const scene = start({ replay });
        go(scene, replay.endTick, deltas);
        const hash = scene.battleChecksum();
        if (hash !== expected) throw Error(`${replay.levelId} diverged at ${replay.endTick}: ${expected} / ${hash}; ${deltas}`);
      }
      if (JSON.stringify(localStorage) !== storage) throw Error("Replay mutated saved progress");
    };
    for (const levelId of ["1-9", "2-10", "5-5", "5-10", "AE-1", "IF-1", "IF-BE-4"]) {
      const scene = start({ levelId, seed: 12345, selectedCards: ["X", "A", "B", "E", "S", "m", "u", "j", "#"] });
      scene.submitBattleCommand({ type: "debugMode", enabled: true });
      scene.submitBattleCommand(tool("debugChars"));
      for (const [id, lane, column] of [["X", 0, 0], ["E", 1, 2], ["B", 1, 3], ["S", 3, 2], ["A", 3, 3], ["m", 3, 4], ["u", 2, 3], ["j", 2, 2], ["#", 4, 2]]) {
        scene.submitBattleCommand({ type: "selectCard", id }); scene.submitBattleCommand(pointer(lane, column));
      }
      if (!scene.towers.some(t => t.type === "u") || !scene.towers.some(t => t.type === "j")) throw Error("Network/skill fixture missing towers");
      go(scene, 2400, [1000 / 60]);
      scene.submitBattleCommand(tool("debugChars"));
      scene.submitBattleCommand({ type: "selectCard", id: "X" });
      scene.submitBattleCommand(pointer(3, 2)); scene.submitBattleCommand(pointer(3, 10));
      scene.submitBattleCommand(tool("autoUpgradeEnabled"));
      go(scene, 2430, [1000 / 60]);
      if (!scene.towerSkills.snapshotFlights().length) throw Error(`${levelId}: S skill was not exercised`);
      const checkpoint = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
      go(scene, 3600, [1000 / 60]);
      const replay = scene.exportReplay();
      const expected = scene.battleChecksum();
      const behaviorHash = battleChecksum(scene.battleState(), { includeEntityIds: false });
      checkReplay(replay, expected);
      const resumed = start({ ...replay, replay: undefined });
      if (resumed.boss) { resumed.boss.body.destroy(); resumed.boss = null; }
      resumed.applyBattleSave(restoreBattleSnapshot(resumed, checkpoint));
      resumed.battlePaused = false;
      go(resumed, 3600, [1000 / 60]);
      if (resumed.battleChecksum() !== expected) throw Error(`${levelId}: save continuation diverged ${expected} / ${resumed.battleChecksum()}`);
      checkReplay(resumed.exportReplay(), expected);
      results.push({ levelId, ticks: replay.endTick, hash: expected, behaviorHash, commands: replay.commands.length });
    }
    const reselect = start({ levelId: "IF-1", seed: 51 });
    reselect.submitBattleCommand({ type: "debugMode", enabled: true });
    reselect.submitBattleCommand(tool("debugChars"));
    go(reselect, 14500, [1000 / 60]);
    reselect.submitBattleCommand({ type: "reselect", cards: ["#", "B", "A"] });
    reselect.submitBattleCommand(tool("superDebugDamage"));
    for (let column = 0; column < config.COLUMNS; column++) reselect.submitBattleCommand(pointer(3, column));
    reselect.submitBattleCommand({ type: "selectCard", id: "#" }); reselect.submitBattleCommand(pointer(3, 1));
    reselect.submitBattleCommand({ type: "selectCard", id: "B" }); reselect.submitBattleCommand(pointer(3, 2));
    go(reselect, 16400, [1000 / 60]);
    reselect.submitBattleCommand({ type: "selectCard", id: "A" });
    const pushed = reselect.towers.find(tower => tower.type === "B" && tower.inPlay);
    if (!pushed) throw Error("Push fixture lost its target");
    reselect.submitBattleCommand(pointer(3, 1)); reselect.submitBattleCommand(pointer(3, 2));
    if (pushed.column !== 3) throw Error("Push command was not executed: " + JSON.stringify(reselect.towers.map(t => ({ type: t.type, lane: t.lane, column: t.column, skills: t.skills }))));
    reselect.submitBattleCommand(tool("shifter"));
    reselect.submitBattleCommand(pointer(3, 3)); reselect.submitBattleCommand(pointer(4, 2));
    if (pushed.lane !== 4 || pushed.column !== 2) throw Error("Move command was not executed");
    reselect.submitBattleCommand(tool("erase")); reselect.submitBattleCommand(pointer(4, 2));
    if (pushed.inPlay) throw Error("Erase command was not executed");
    go(reselect, 16460, [1000 / 60]);
    checkReplay(reselect.exportReplay(), reselect.battleChecksum());
    results.push({ levelId: "IF-1 reselection/push/move/erase", ticks: reselect.simulation.tick });
    // Tutorial navigation changes the simulation too, even though it is outside the board.
    const finale = start({ levelId: "5-10", seed: 91 });
    finale.submitBattleCommand({ type: "debugMode", enabled: true });
    finale.submitBattleCommand(tool("debugChars"));
    finale.submitBattleCommand(tool("superDebugDamage"));
    for (let phase = 0; phase < 3; phase++) {
      let hits = 0;
      while (finale.bossPhaseIndex === phase && hits++ < 1000) {
        if (finale.boss.invincibleUntil > finale.battleTime) go(finale, finale.simulation.tick + 960, [1000 / 60]);
        finale.submitBattleCommand({ type: "pointer", pointer: {
          x: finale.boss.x, y: finale.boss.y, ctrl: false, shift: false, right: false
        } });
      }
      if (finale.bossPhaseIndex !== phase + 1) throw Error(`Could not advance phase ${phase + 1}`);
      go(finale, finale.simulation.tick + 120, [1000 / 60]);
    }
    go(finale, finale.simulation.tick + 1800, [1000 / 60]);
    checkReplay(finale.exportReplay(), finale.battleChecksum());
    results.push({ levelId: "5-10 phases", phase: finale.bossPhaseIndex + 1 });
    const tutorial = start({ levelId: "0-1", seed: 77 });
    tutorial.submitBattleCommand({ type: "tutorialAdvance" });
    tutorial.submitBattleCommand({ type: "selectCard", id: "X" }); tutorial.submitBattleCommand(pointer(3, 1));
    go(tutorial, 120, [1000 / 60]);
    checkReplay(tutorial.exportReplay(), tutorial.battleChecksum());
    return results;
  });
  console.log(JSON.stringify(results, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
