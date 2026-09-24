import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  await mkdir("logs", { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1.5 });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => { if (message.type() === "warning" || message.type() === "error") console.log(message.text()); });
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const { setLanguage } = await import("/src/i18n.ts"); setLanguage("zh-CN");
    const progressUrl = performance.getEntriesByType("resource").map(entry => entry.name)
      .find(url => new URL(url).pathname === "/src/progress.ts");
    const progress = window.__testProgress = await import(progressUrl ?? "/src/progress.ts"); progress.resetProgress();
    for (const id of ["0-1", "0-2", "0-3", "0-4", "0-5"]) progress.completeLevel(id);
    window.__tutorialStart = levelId => {
      const g = window.__testGame;
      for (const s of g.scene.getScenes(true)) g.scene.stop(s.sys.settings.key);
      g.scene.start("GameScene", { levelId, selectedCards: ["A"], seed: 123 });
    };
  });
  const start = async id => { await page.evaluate(id => window.__tutorialStart(id), id); await page.waitForTimeout(650); };
  const click = async (x, y, shift = false) => {
    const p = await page.evaluate(({ x, y }) => {
      const g = window.__testGame, r = g.canvas.getBoundingClientRect();
      return { x: r.x + x * r.width / g.scale.width, y: r.y + y * r.height / g.scale.height };
    }, { x, y });
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.click(p.x, p.y);
    if (shift) await page.keyboard.up("Shift");
    await page.waitForTimeout(60);
  };
  const step = expected => page.waitForFunction(expected => window.__testGame.scene.getScene("GameScene").tutorial.step === expected, expected);
  const advance = () => click(118, 693);
  const tool = async name => {
    const p = await page.evaluate(name => {
      const b = window.__testGame.scene.getScene("GameScene").ui[name]; return { x: b.x, y: b.y };
    }, name); await click(p.x, p.y);
  };
  await start("0-6");
  await advance();
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction(i => window.__testGame.scene.getScene("GameScene").tutorial.index === i, i);
    await advance();
    assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").tutorial.fired), true);
    await page.screenshot({ path: `logs/tutorial-damage-${i}.png` });
    if (i === 3) {
      await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(650);
      await page.screenshot({ path: "logs/tutorial-damage-small.png" });
    }
    await advance();
  }
  await advance();
  assert(await page.evaluate(() => window.__testProgress.isLevelCompleted("0-6")));
  assert.equal(await page.evaluate(() => window.__testProgress.isCardUnlocked("I")), false);

  await page.setViewportSize({ width: 1280, height: 760 });
  await start("0-4"); await advance(); await step("deploy");
  await click(240 + 4.5 * 78, 138 + 3.5 * 78);
  await page.waitForTimeout(1100);
  await click(240 + 4.5 * 78, 138 + 4.5 * 78);
  await step("selectAuto"); await tool("autoUpgradeButton"); await step("mark");
  await click(240 + 4.5 * 78, 138 + 3.5 * 78); await step("controls");
  await advance(); await step("batchMark");
  await page.screenshot({ path: "logs/tutorial-auto-shift.png" });
  await click(240 + 4.5 * 78, 138 + 4.5 * 78, true); await step("batchClear");
  await click(240 + 4.5 * 78, 138 + 4.5 * 78, true); await step("selectErase");
  await tool("eraserButton"); await step("erase");
  await click(240 + 4.5 * 78, 138 + 3.5 * 78); await step("complete");
  await advance();

  await start("1-3");
  await page.evaluate(async () => {
    const p = window.__testProgress; p.completeLevel("1-1"); p.completeLevel("1-2");
  });
  await page.evaluate(() => window.__testGame.scene.getScene("GameScene").endLevel());
  await page.screenshot({ path: "logs/tutorial-unlock.png" });
  const rewardClick = async name => {
    const p = await page.evaluate(name => {
      const s = window.__testGame.scene.getScene("GameScene"), b = s.overlay.details.getByName(name);
      return { x: b.x, y: b.y };
    }, name); await click(p.x, p.y);
  };
  const checkRewardPixels = async () => {
    const pixels = await page.evaluate(() => new Promise(resolve => {
      const g = window.__testGame;
      g.renderer.snapshot(image => {
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        resolve([[640, 80], [120, 380]].map(([x, y]) => [...ctx.getImageData(
          Math.round(x * canvas.width / g.scale.width), Math.round(y * canvas.height / g.scale.height), 1, 1).data]));
      });
    }));
    assert(pixels.every(color => color[0] > 180 && color[1] > 180), "Reward frame disappeared");
  };
  await rewardClick("unlock-card-I");
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").rewardEncyclopedia.selectedEntryId), "tower:I");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").rewardEncyclopedia.isOpen()), false);
  assert(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").overlay.container.visible));
  await page.evaluate(async () => {
    const p = window.__testProgress, { levelNodes } = await import("/src/data/levels.ts");
    for (const node of levelNodes.filter(n => /^[1-4]-/.test(n.id))) p.completeLevel(node.id);
    for (const id of ["AE-1", "AE-2", "AE-3"]) p.completeLevel(id);
  });
  await start("AE-4");
  await page.evaluate(() => window.__testGame.scene.getScene("GameScene").endLevel());
  await page.waitForTimeout(300);
  await checkRewardPixels();
  await page.screenshot({ path: "logs/tutorial-unlock-before-page.png" });
  await rewardClick("unlock-next");
  await page.waitForTimeout(500);
  await checkRewardPixels();
  await page.screenshot({ path: "logs/tutorial-unlock-page2.png" });
  const id = await page.evaluate(() => window.__testGame.scene.getScene("GameScene").overlay.details.list.find(x => x.name.startsWith("unlock-card-")).name);
  await rewardClick(id);
  assert(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").rewardEncyclopedia.isOpen()));
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").rewardEncyclopedia.cardCase), "ascii");
  assert.deepEqual(errors, []);
  console.log("Damage tutorial, Shift marking, unlock paging and encyclopedia return passed.");
} finally { await browser.close(); }
