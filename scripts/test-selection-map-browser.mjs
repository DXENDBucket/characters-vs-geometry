import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const modulePath = option("playwright");
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  await mkdir("logs", { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").map(entry => entry.name)
      .find(url => new URL(url).pathname === "/src/progress.ts");
    (await import(url ?? "/src/progress.ts")).completeAllLevels();
  });

  for (const [size, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, small: { width: 800, height: 600 } })) {
    await page.setViewportSize(viewport);
    let baseline;
    for (const [key, data, name] of [
      ["ChapterSelectScene", { groupId: "main" }, "chapters"],
      ["LevelSelectScene", { chapterId: "1" }, "levels"]
    ]) {
      const geometry = await page.evaluate(({ key, data }) => {
        const game = window.__testGame;
        for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
        game.scene.start(key, data);
        const scene = game.scene.getScene(key);
        const v = scene.mapViewport;
        if (!scene.children.getByName("selection-map-frame") || !scene.mapContainer.mask) throw Error("Missing frame or clipping mask");
        if (scene.startButton && scene.startButton.getBounds().top <= v.bottom) throw Error("Footer overlaps map");
        return { x: v.x, y: v.y, width: v.width, height: v.height };
      }, { key, data });
      baseline ??= geometry;
      assert.deepEqual(geometry, baseline, "Chapter and level map frames must match");
      await page.waitForTimeout(200);
      await page.screenshot({ path: `logs/selection-map-${name}-${size}.png` });

      const point = await page.evaluate(() => {
        const game = window.__testGame, canvas = game.canvas.getBoundingClientRect();
        return { x: canvas.x + 640 * canvas.width / 1280, y: canvas.y + 560 * canvas.height / 760 };
      });
      const offset = () => page.evaluate(key => window.__testGame.scene.getScene(key).mapContainer.x, key);
      await page.mouse.move(point.x, point.y);
      const before = await offset();
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(200);
      assert((await offset()) < before, `${name}: wheel scroll failed`);
      const beforeDrag = await offset();
      await page.mouse.down();
      await page.waitForTimeout(180);
      await page.mouse.move(point.x - 80, point.y, { steps: 8 });
      await page.mouse.up();
      assert((await offset()) < beforeDrag, `${name}: drag scroll failed`);
    }
  }
  assert.deepEqual(errors, []);
  console.log("Selection map geometry, footer spacing, wheel and drag passed at desktop and small viewports.");
} finally {
  await browser.close();
}
