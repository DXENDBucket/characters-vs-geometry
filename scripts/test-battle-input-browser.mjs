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
    const { dispatchBattleUi: input, assertSemanticRecording } = await import("/scripts/helpers/battle-ui.mjs");
    const game = window.__testGame, check = (value, message) => { if (!value) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    let serial = 0;
    const start = data => {
      const key = `SemanticInput${serial++}`;
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, data); return game.scene.getScene(key);
    };
    const tick = (scene, count = 1) => { for (let i = 0; i < count; i++) scene.update(0, 1000 / 60); };
    const click = (scene, lane, column, extra = {}) => input(scene, { type: "pointer", pointer: {
      x: cfg.BOARD_X + (column + .5) * cfg.CELL_WIDTH, y: cfg.BOARD_Y + (lane + .5) * cfg.CELL_HEIGHT,
      shift: false, ctrl: false, right: false, ...extra
    } });
    const card = (scene, id) => scene.cardList.onSelect(id);
    const tool = (scene, name) => scene.ui[name].emit("pointerdown");
    const next = scene => scene.tutorial.view.button.emit("pointerdown");
    const key = (scene, code) => scene.input.keyboard.emit("keydown", { code, key: code === "Space" ? " " : code.slice(-1), preventDefault() {} });
    const until = (scene, expected, limit = 3000) => {
      let count = 0;
      while (scene.tutorial.step !== expected && !scene.gameOver && count++ < limit) tick(scene);
      check(scene.tutorial.step === expected, `${scene.levelId}: expected ${expected}, got ${scene.tutorial.step}`);
    };
    const ordinary = start({ levelId: "IF-1", seed: 804, selectedCards: ["A", "B"] });
    const before = ordinary.battleChecksum();
    for (let i = 0; i < 20; i++) {
      card(ordinary, i % 2 ? "A" : "B"); tool(ordinary, "autoUpgradeButton");
      tool(ordinary, "eraserButton"); tool(ordinary, "shifterButton");
      key(ordinary, "Digit1"); key(ordinary, "Digit2"); key(ordinary, "Digit3");
      click(ordinary, 2, 2, { right: true });
    }
    check(ordinary.exportReplay().commands.length === 0, "Local selection was recorded");
    check(ordinary.battleChecksum() === before, "Local selection mutated battle");
    key(ordinary, "Space"); check(ordinary.battlePaused, "Keyboard pause did not execute");
    card(ordinary, "A"); click(ordinary, 3, 2);
    check(ordinary.towers.some(t => t.inPlay && t.type === "A"), "Paused construction stopped working");
    check(assertSemanticRecording(ordinary).commands.filter(c => c.command.type === "operation").length === 1, "Deployment recorded more than once");
    ordinary.menuOpen = true;
    const count = ordinary.exportReplay().commands.length;
    click(ordinary, 2, 3);
    check(ordinary.exportReplay().commands.length === count, "Menu did not block local board input");
    check(ordinary.submitPlayerOperation("local", { type: "deploy", card: "B", cell: { lane: 2, column: 3 }, expected: null }) === "deployed",
      "Local modal rejected an explicit host operation");
    const inputState = JSON.stringify(ordinary.tutorialInteraction);
    check(ordinary.submitPlayerControl("local", { type: "tutorialInput", input: { tool: "erase", selected: [] } }) === "unavailable",
      "Ordinary battle accepted tutorial input");
    check(JSON.stringify(ordinary.tutorialInteraction) === inputState, "Denied tutorial input mutated state");
    game.scene.stop(ordinary.sys.settings.key);

    const results = [];
    for (const levelId of ["0-4", "0-5"]) {
      const scene = start({ levelId, seed: 804 });
      next(scene); until(scene, "deploy");
      if (levelId === "0-4") {
        click(scene, 3, 4); tick(scene, 90); click(scene, 4, 4); until(scene, "selectAuto");
        tool(scene, "autoUpgradeButton"); until(scene, "mark");
        click(scene, 3, 4); until(scene, "controls");
        next(scene); until(scene, "batchMark");
        click(scene, 4, 4, { shift: true }); until(scene, "batchClear");
        click(scene, 4, 4, { shift: true }); until(scene, "selectErase");
        tool(scene, "eraserButton"); until(scene, "erase");
        click(scene, 3, 4); until(scene, "complete");
      } else {
        card(scene, "A"); click(scene, 1, 2); tick(scene, 90); click(scene, 3, 2);
        card(scene, "B"); click(scene, 4, 3); until(scene, "singleTool");
        tool(scene, "shifterButton"); until(scene, "singleSelect");
        click(scene, 1, 2); until(scene, "singleMove");
        click(scene, 1, 5); until(scene, "cooldown"); until(scene, "multiTool");
        tool(scene, "shifterButton"); until(scene, "multiFirst");
        click(scene, 3, 2); until(scene, "multiSecond");
        click(scene, 4, 3, { ctrl: true }); until(scene, "multiMove");
        click(scene, 3, 7); until(scene, "complete");
      }
      next(scene); check(scene.gameOver, `${levelId}: tutorial did not finish`);
      const replay = assertSemanticRecording(scene), expected = scene.battleChecksum();
      check(replay.commands.some(c => c.command.control?.type === "tutorialInput"), "Missing lesson observations");
      const storage = JSON.stringify(localStorage);
      for (const delta of [1000 / 30, 1000 / 144]) {
        const replayed = start({ replay });
        check(!replayed.gameOver, "Playback rejection fixture must be an ongoing battle");
        card(replayed, "A"); tool(replayed, "shifterButton"); key(replayed, "Digit1"); click(replayed, 3, 4);
        check(!replayed.shifter.isActive() && !replayed.eraserMode && replayed.towers.length === 0,
          "Ongoing replay accepted live local input");
        let frames = 0;
        while (!replayed.gameOver && frames++ < 15000) replayed.update(0, delta);
        check(replayed.gameOver && replayed.tutorial.step === "complete", `${levelId}: semantic lesson replay stuck at ${replayed.tutorial.step}`);
        check(replayed.battleChecksum() === expected, `${levelId}: replay changed battle`);
        check(!replayed.eraserMode && !replayed.autoUpgradeMode && !replayed.shifter.isActive(), "Replay altered local tools");
        const replayCount = replayed.exportReplay().commands.length;
        card(replayed, "A"); tool(replayed, "shifterButton");
        check(replayed.exportReplay().commands.length === replayCount, "Playback accepted live input");
        game.scene.stop(replayed.sys.settings.key);
      }
      check(JSON.stringify(localStorage) === storage, "Tutorial replay changed progress");
      results.push({ levelId, ticks: replay.endTick, commands: replay.commands.length });
      game.scene.stop(scene.sys.settings.key);
    }
    return results;
  });
  assert.deepEqual(errors, []);
  console.log("Live local-input isolation and complete semantic tutorial replays passed", result);
} finally { await browser.close(); }
