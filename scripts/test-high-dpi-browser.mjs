import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  await mkdir("logs", { recursive: true });
  for (const [mode, dpr] of [["webgl", 1], ["webgl", 2], ["canvas", 2]]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/src/main.ts*", async route => {
      const response = await route.fetch();
      let source = await response.text();
      if (mode === "canvas") source = source.replace("type: Phaser.AUTO", "type: Phaser.CANVAS");
      await route.fulfill({ response, body: source + "\nwindow.__testGame=game;" });
    });
    await page.goto(option("url") ?? "http://127.0.0.1:5173");
    await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
    await page.evaluate(async () => {
      const url = performance.getEntriesByType("resource").map(entry => entry.name).find(url => new URL(url).pathname === "/src/progress.ts");
      const progress = await import(url ?? "/src/progress.ts"); progress.completeAllLevels(); progress.unlockAllCards();
      window.__dpiStart = (key, data) => {
        const game = window.__testGame;
        for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
        game.scene.start(key, data);
      };
    });
    const start = async (key, data = {}) => {
      await page.evaluate(({ key, data }) => window.__dpiStart(key, data), { key, data });
      await page.waitForTimeout(650);
    };
    const at = (x, y) => page.evaluate(({ x, y }) => {
      const game = window.__testGame, bounds = game.canvas.getBoundingClientRect();
      return { x: bounds.x + x * bounds.width / game.scale.width, y: bounds.y + y * bounds.height / game.scale.height };
    }, { x, y });
    const click = async (x, y) => { const p = await at(x, y); await page.mouse.click(p.x, p.y); };
    const metrics = () => page.evaluate(async () => {
      const g = window.__testGame, rect = g.canvas.getBoundingClientRect();
      const { renderSizeForViewport } = await import("/src/render/renderResolution.ts");
      const expected = renderSizeForViewport({ logicalWidth: g.scale.width, logicalHeight: g.scale.height,
        displayWidth: rect.width, displayHeight: rect.height, devicePixelRatio });
      if (g.canvas.width !== expected.width || g.canvas.height !== expected.height) throw Error(`Wrong framebuffer ${g.canvas.width}x${g.canvas.height}; expected ${JSON.stringify(expected)}`);
      if (g.renderer.width !== g.canvas.width || g.renderer.height !== g.canvas.height) throw Error("Renderer/canvas mismatch");
      return { logical: [g.scale.width, g.scale.height], pixels: [g.canvas.width, g.canvas.height], css: [rect.width, rect.height], dpr: devicePixelRatio, renderer: g.renderer.type };
    });
    await start("ChapterSelectScene", { groupId: "main" });
    const initial = await metrics();
    assert.deepEqual(initial.logical, [1280, 760]);
    assert(initial.pixels[0] > 1280, "Desktop must use more than the old framebuffer");
    console.log(mode, initial);
    assert.equal(initial.renderer, mode === "canvas" ? 1 : 2);
    await click(520, 430);
    await page.waitForFunction(() => window.__testGame.scene.isActive("LevelSelectScene"));
    assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("LevelSelectScene").selectedChapterId), "1");
    await metrics();
    await page.screenshot({ path: `logs/high-dpi-${mode}-${dpr}-desktop.png` });

    await start("ChapterSelectScene", { groupId: "main" });
    await page.evaluate(() => {
      const s = window.__testGame.scene.getScene("ChapterSelectScene");
      const shape = s.add.rectangle(600, 550, 160, 100, 0xff0000).setDepth(500);
      const mask = s.add.graphics().fillStyle(0xffffff).fillRect(560, 530, 80, 40).setVisible(false);
      shape.setMask(mask.createGeometryMask());
    });
    const mask = await page.evaluate(() => new Promise(resolve => {
      const game = window.__testGame;
      game.renderer.snapshot(image => {
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        const pixel = (x, y) => [...ctx.getImageData(Math.round(x * canvas.width / game.scale.width), Math.round(y * canvas.height / game.scale.height), 1, 1).data];
        resolve({ inside: pixel(600, 550), outside: pixel(540, 550) });
      });
    }));
    assert(mask.inside[0] > 240 && mask.inside[1] < 10, "Mask misplaced or canvas blank");
    assert(!(mask.outside[0] > 240 && mask.outside[1] < 10), "Mask leaked outside logical bounds");

    await start("GameScene", { levelId: "1-1", selectedCards: ["A"], difficulty: 0, seed: 42 });
    await page.evaluate(() => { const s = window.__testGame.scene.getScene("GameScene"); s.battlePaused = true; s.chars = 10000; });
    await click(240 + 2.5 * 78, 138 + 3.5 * 78);
    assert.deepEqual(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").towers.map(t => [t.column, t.lane])), [[2, 3]]);
    await page.evaluate(() => {
      const game = window.__testGame;
      game.scene.getScene("GameScene").scene.launch("CardSelectScene", { levelId: "1-1", reselect: { selectedCards: ["A"], onComplete: () => {} } });
    });
    await page.waitForTimeout(200);
    const button = await page.evaluate(() => {
      const s = window.__testGame.scene.getScene("CardSelectScene"), frame = s.clearButton;
      return s.cameras.main.matrix.transformPoint(frame.x, frame.y);
    });
    await click(button.x, button.y);
    assert.deepEqual(await page.evaluate(() => window.__testGame.scene.getScene("CardSelectScene").selectedCards), []);
    await page.screenshot({ path: `logs/high-dpi-${mode}-${dpr}-overlay.png` });

    await start("ChapterGroupSelectScene", { groupId: "main" });
    await metrics();
    await start("LevelSelectScene", { chapterId: "1" });
    await metrics();
    if (dpr === 2 && mode === "webgl") {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1.25, mobile: false });
      await page.waitForTimeout(650);
      assert.equal((await metrics()).dpr, 1.25);
      await cdp.send("Emulation.clearDeviceMetricsOverride"); await cdp.detach();
    }
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(650);
    await metrics();
    await page.evaluate(() => window.__testGame.scene.getScene("LevelSelectScene").add.rectangle(1100, 720, 40, 20, 0xff0000).setDepth(1000));
    const bottomPixel = await page.evaluate(() => new Promise(resolve => {
      const game = window.__testGame;
      game.renderer.snapshot(image => {
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        resolve([...ctx.getImageData(Math.round(1100 * canvas.width / game.scale.width), Math.round(720 * canvas.height / game.scale.height), 1, 1).data]);
      });
    }));
    assert(bottomPixel[0] > 240 && bottomPixel[1] < 10, "Framebuffer resize clipped the bottom of the scene");
    await page.screenshot({ path: `logs/high-dpi-${mode}-${dpr}-small.png` });
    const point = await at(700, 580); await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
    assert(await page.evaluate(() => window.__testGame.scene.getScene("LevelSelectScene").mapContainer.x < 0));
    await page.evaluate(() => window.__testGame.destroy(true));
    await page.waitForTimeout(100);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("High-DPI framebuffer, input, masks, overlay zoom, scene resize, live DPR and Canvas fallback passed.");
} finally { await browser.close(); }
