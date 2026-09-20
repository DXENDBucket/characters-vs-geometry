// Requires Vite; accepts the same options as test-battle-determinism-browser.mjs.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const modulePath = option("playwright");
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const game = window.__testGame;
    // Reuse Vite's current module URL so HMR query strings don't create a second progress cache.
    const progressUrl = performance.getEntriesByType("resource").map(entry => entry.name)
      .find(url => new URL(url).pathname === "/src/progress.ts");
    const progress = await import(progressUrl ?? "/src/progress.ts");
    const { palette, uiTextColors } = await import("/src/config.ts");
    game.loop.stop();
    const check = (value, message) => { if (!value) throw Error(message); };
    const start = (key, data = {}) => {
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start(key, data);
      return game.scene.getScene(key);
    };
    const exercise = (scene, frame, label = frame, enabled = true) => {
      const parent = frame.parentContainer ?? scene.children;
      const listeners = scene.events.listenerCount("postupdate");
      const original = frame.strokeColor;
      label.emit("pointerover");
      const outline = parent.list.find(item => item.name === "button-hover" && item.visible);
      check(!!outline === enabled, "Wrong enabled hover state");
      if (outline) {
        check(outline.strokeColor === palette.green && !outline.isFilled && !outline.input, "Hover must be a noninteractive outline");
        check(outline.x === frame.x && outline.y === frame.y && outline.width === frame.width, "Misaligned hover");
      }
      frame.setStrokeStyle(3, palette.gold);
      scene.events.emit("postupdate");
      label.emit("pointerout");
      check(!outline?.visible && frame.strokeColor === palette.gold, "Hover overwrote persistent button state");
      check(scene.events.listenerCount("postupdate") === listeners, "Hover leaked update listener");
      frame.setStrokeStyle(2, original);
    };
    let scene = start("SettingsScene");
    exercise(scene, scene.languageButtons[0].frame, scene.languageButtons[0].label);
    exercise(scene, scene.rows[0].button, scene.rows[0].keyText);
    const baseline = scene.events.listenerCount("postupdate");
    for (let i = 0; i < 12; i++) {
      const row = scene.rows.find(row => row.actionId.startsWith("card:"));
      row.keyText.emit("pointerover");
      scene.setCardCase(i % 2 ? "uppercase" : "lowercase");
      check(scene.events.listenerCount("postupdate") === baseline, "Rebuilt controls leaked hover updates");
    }
    progress.resetProgress();
    scene = start("ChapterSelectScene", { groupId: "main" });
    const locked = scene.chapterCards.find(card => !progress.isChapterUnlocked(card.definition.id));
    check(locked, "Missing locked chapter fixture");
    exercise(scene, locked.frame, locked.label, false);
    progress.completeAllLevels(); progress.unlockAllCards();
    scene = start("ChapterSelectScene", { groupId: "main" });
    check(scene.chapterCards.every(card => card.frame.strokeColor === palette.completed && card.meta.style.color === uiTextColors.completed),
      `Chapter completion color: ${JSON.stringify(scene.chapterCards.map(card => [card.definition.id, card.frame.strokeColor, card.meta.style.color, progress.isChapterCompleted(card.definition.id)]))}; ${palette.completed}`);
    scene = start("LevelSelectScene", { chapterId: "1" });
    const completed = scene.mapContainer.list.filter(item => item.type === "Rectangle" && item.width === 150);
    check(completed.length > 0 && completed.every(item => item.strokeColor === palette.completed), "Level completion color");
    check(completed.every(frame => frame.lineWidth === 2), "Selected level retained a thick idle border");
    const frame = completed[0];
    const bounds = frame.getBounds();
    scene.input.activePointer.x = bounds.centerX;
    scene.input.activePointer.y = bounds.centerY;
    frame.emit("pointerover");
    const hover = scene.mapContainer.list.find(item => item.name === "button-hover" && item.visible);
    check(hover?.lineWidth === 3 && hover.strokeColor === palette.green, "Level hover color and width must activate together");
    scene.selectedLevelId = "1-2";
    scene.updateSelection();
    frame.emit("pointerout");
    check(!hover.visible && completed.every(frame => frame.lineWidth === 2 && frame.strokeColor === palette.completed),
      "Moving away must remove both green and bold borders, preserving completion color");
    exercise(scene, scene.startButton, scene.startText);
    scene = start("CardSelectScene", { levelId: "AE-2", chapterId: "AE" });
    scene.clearLoadout();
    exercise(scene, scene.startButton, scene.startText, false);
    exercise(scene, scene.clearButton, scene.clearText, false);
    exercise(scene, scene.cardPoolCaseButtons[0].frame, scene.cardPoolCaseButtons[0].label);
    scene.encyclopedia.open("towers");
    exercise(scene, scene.encyclopedia.tabs[0].frame, scene.encyclopedia.tabs[0].label);
    exercise(scene, scene.encyclopedia.cardCaseButtons[0].frame, scene.encyclopedia.cardCaseButtons[0].label);
    scene = start("GameScene", { levelId: "AE-2", selectedCards: ["A", "@"] });
    const ui = scene.ui;
    exercise(scene, ui.reselectButton, ui.reselectText, false);
    exercise(scene, ui.shifterButton, ui.shifterText);
    scene = start("SettingsScene");
    window.__hoverScene = scene;
    game.loop.start(game.step.bind(game));
  });
  const position = await page.evaluate(() => {
    const game = window.__testGame, frame = window.__hoverScene.languageButtons[0].frame;
    const canvas = game.canvas.getBoundingClientRect();
    return { x: canvas.x + (frame.x + frame.width / 2) * canvas.width / game.scale.width,
      y: canvas.y + frame.y * canvas.height / game.scale.height };
  });
  await page.mouse.move(position.x, position.y);
  await page.waitForFunction(() => window.__hoverScene.children.list.some(item => item.name === "button-hover" && item.visible));
  await page.screenshot({ path: "logs/button-hover-desktop.png" });
  await page.mouse.move(1, 1);
  await page.waitForFunction(() => !window.__hoverScene.children.list.some(item => item.name === "button-hover" && item.visible));
  await page.mouse.move(position.x, position.y);
  await page.waitForFunction(() => window.__hoverScene.children.list.some(item => item.name === "button-hover" && item.visible));
  await page.mouse.move(1, 1);
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/button-hover-small.png" });
  assert.deepEqual(errors, []);
  console.log("Button hover, disabled controls, lifecycle and completion colors passed");
} finally { await browser.close(); }
