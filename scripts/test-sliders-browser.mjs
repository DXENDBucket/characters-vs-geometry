import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const progress = await import("/src/progress.ts");
    progress.unlockAllCards(); progress.completeAllLevels();
  });
  const start = async (key, data = {}) => {
    await page.evaluate(({ key, data }) => {
      for (const scene of window.__testGame.scene.getScenes(true)) window.__testGame.scene.stop(scene.sys.settings.key);
      window.__testGame.scene.start(key, data);
    }, { key, data });
    await page.waitForFunction(key => window.__testGame.scene.isActive(key), key);
    await page.waitForTimeout(100);
  };
  const at = (x, y) => page.evaluate(({ x, y }) => {
      const game = window.__testGame, rect = game.canvas.getBoundingClientRect();
      return { x: rect.x + x * rect.width / game.scale.width, y: rect.y + y * rect.height / game.scale.height };
    }, { x, y });
  const move = async (x, y) => {
    const point = await at(x, y);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(35);
  };
  const difficulty = () => page.evaluate(() => window.__testGame.scene.getScene("LevelSelectScene").difficulty);
  const speed = () => page.evaluate(() => window.__testGame.scene.getScene("GameScene").gameSpeed);

  for (const viewport of [{ width: 1440, height: 960 }, { width: 960, height: 640 }]) {
    await page.setViewportSize(viewport);
    await start("LevelSelectScene", { chapterId: "1", difficulty: 3 });
    await move(252, 715); await page.mouse.down();
    assert.equal(await difficulty(), 2, "Track click should update immediately");
    await move(452, 695);
    assert.equal(await difficulty(), 7, "Track click must continue into drag, even off track");
    await move(570, 695);
    assert.equal(await difficulty(), 9, "Clamp at upper endpoint");
    await page.mouse.up(); await move(172, 715);
    assert.equal(await difficulty(), 9, "Release stops drag");
    await page.mouse.click(1, 1);
    await move(537, 715); await page.mouse.down();
    assert.equal(await difficulty(), 9, "Grabbing thumb off-center should not jump");
    await move(457, 715); await page.mouse.up();
    assert.equal(await difficulty(), 7);
    await move(212, 715); await page.mouse.down({ button: "right" }); await move(292, 715); await page.mouse.up({ button: "right" });
    assert.equal(await difficulty(), 7, "Right click is not a drag");
    await move(332, 715); await page.mouse.down();
    await page.evaluate(() => window.__testGame.events.emit("blur"));
    await move(492, 715); await page.mouse.up();
    assert.equal(await difficulty(), 4, "Focus loss cancels drag");
    await page.evaluate(() => window.__testGame.scene.getScene("LevelSelectScene").encyclopediaPanel.open("towers"));
    await move(252, 715); await page.mouse.down(); await move(452, 715); await page.mouse.up();
    assert.equal(await difficulty(), 4, "Overlay must block the slider below");

    await start("GameScene", { levelId: "1-1", selectedCards: ["A", "B"] });
    await move(392, 120); await page.mouse.down();
    assert.equal(await speed(), 1.4);
    await move(524, 140);
    assert.equal(await speed(), 4, "Speed track supports continuous drag");
    await move(348, 140); await page.mouse.up();
    assert.equal(await speed(), 0.5);
    await move(500, 120);
    assert.equal(await speed(), 0.5);

    await start("EncyclopediaScene");
    await page.evaluate(() => {
      const panel = window.__testGame.scene.getScene("EncyclopediaScene").panel;
      panel.setTab("towers"); panel.setCardCase("uppercase"); panel.setGridScroll(0);
    });
    await move(304, 520); await page.mouse.down();
    const before = await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.gridScrollY);
    assert.ok(before > 0, "Scrollbar track click jumps");
    await move(314, 650); await page.mouse.up();
    assert.ok(await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.gridScrollY) > before, "Scrollbar continues dragging off track");
    await page.evaluate(async () => {
      const panel = window.__testGame.scene.getScene("EncyclopediaScene").panel;
      const { towerEncyclopediaEntries } = await import("/src/encyclopedia.ts");
      panel.selectEntry(towerEncyclopediaEntries().find(entry => entry.card.id === "w")); panel.setDetailScroll(0);
    });
    await move(1242, 685); await page.mouse.down();
    const detailBefore = await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.detailScrollY);
    assert.ok(detailBefore > 0);
    await move(1254, 360); await page.mouse.up();
    assert.ok(await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.detailScrollY) < detailBefore);
    await page.screenshot({ path: `logs/sliders-${viewport.width}.png` });
  }
  await start("LevelSelectScene", { chapterId: "1", difficulty: 3 });
  const session = await page.context().newCDPSession(page);
  const touch = async (type, x, y) => {
    const point = type === "touchEnd" ? undefined : await at(x, y);
    await session.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [{ ...point, id: 0 }] : [] });
    await page.waitForTimeout(35);
  };
  await touch("touchStart", 212, 715);
  assert.equal(await difficulty(), 1);
  await touch("touchMove", 452, 700);
  assert.equal(await difficulty(), 7, "Touch track press must continue dragging");
  await touch("touchEnd");
  await session.detach();
  await move(252, 715); await page.mouse.down();
  await page.mouse.move(1, 1); await page.mouse.up();
  const released = await difficulty();
  await move(532, 715);
  assert.equal(await difficulty(), released, "Release outside canvas must stop dragging");
  const blurListeners = await page.evaluate(() => window.__testGame.events.listenerCount("blur"));
  for (let i = 0; i < 3; i++) await start("LevelSelectScene", { chapterId: "1", difficulty: 3 });
  assert.equal(await page.evaluate(() => window.__testGame.events.listenerCount("blur")), blurListeners, "Scene restart must clean up slider listeners");
  assert.deepEqual(errors, []);
  console.log("Slider desktop/small viewport, touch, release and cleanup checks passed");
} finally {
  await browser.close();
}
