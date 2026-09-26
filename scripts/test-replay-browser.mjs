import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ headless: true, executablePath: option("browser") });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("characters-vs-geometry-language", "zh-CN"));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.isActive("MainMenuScene"));
  assert.deepEqual(await page.evaluate(() => window.__testGame.scene.getScene("MainMenuScene").items.map(item => item.label.text)),
    ["单人游戏", "多人游戏", "图鉴", "设置", "回放", "存档", "退出游戏"]);
  await page.screenshot({ path: "logs/replays-main-desktop.png" });
  await page.evaluate(() => window.__testGame.scene.getScene("MainMenuScene").scene.start("GameScene", { levelId: "1-9", selectedCards: ["A", "B", "X"], seed: 123 }));
  await page.waitForFunction(() => window.__testGame.scene.isActive("GameScene"));
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").submitPlayerOperation("local", {
    type: "deploy", card: "A", cell: { lane: 3, column: 2 }, expected: null
  })), "deployed");
  await page.waitForTimeout(1200);
  const expected = await page.evaluate(() => {
    const s = window.__testGame.scene.getScene("GameScene");
    const result = { tick: s.session.clock.tick, hash: s.battleChecksum() };
    s.scene.start("MainMenuScene", { showReplays: true }); return result;
  });
  await page.locator(".replay-row").waitFor();
  await page.screenshot({ path: "logs/replays-library-desktop.png" });
  const data = await page.evaluate(async () => {
    const { replayLibrary, exportReplayFile } = await import("/src/replays.ts");
    return exportReplayFile((await replayLibrary.recent())[0]);
  });
  const recordedTick = JSON.parse(data).replay.endTick;
  const progress = await page.evaluate(() => localStorage.getItem("characters-vs-geometry-progress-v1"));
  await page.getByRole("button", { name: "观看", exact: true }).click();
  await page.locator(".replay-controls").waitFor();
  await page.getByRole("button", { name: "暂停回放", exact: true }).click();
  const pausedTick = await page.evaluate(() => window.__testGame.scene.getScene("GameScene").session.clock.tick);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").session.clock.tick), pausedTick);
  await page.getByRole("button", { name: "播放回放", exact: true }).click();
  await page.waitForFunction(() => window.__testGame.scene.getScene("GameScene").session.playbackComplete);
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").session.clock.tick), recordedTick);
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").battleChecksum()), expected.hash);
  await page.screenshot({ path: "logs/replays-playing.png" });
  await page.getByRole("button", { name: "重新播放", exact: true }).first().click();
  await page.waitForFunction(() => window.__testGame.scene.getScene("GameScene").session.clock.tick < 15);
  await page.getByRole("button", { name: "返回回放列表", exact: true }).click();
  await page.locator(".replay-row").waitFor();
  assert.equal(await page.locator(".replay-row").count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("characters-vs-geometry-progress-v1")), progress);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "导入回放", exact: true }).click();
  await (await chooser).setFiles({ name: "battle.json", mimeType: "application/json", buffer: Buffer.from(data) });
  await page.locator(".replay-imported .replay-row").waitFor();
  assert.equal(await page.locator(".replay-row").count(), 2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出", exact: true }).first().click();
  assert.match((await download).suggestedFilename(), /^Charset-replay-/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "logs/replays-library-mobile.png" });
  assert.equal(await page.locator(".replay-menu").evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.screenshot({ path: "logs/replays-main-mobile.png" });
  for (const [itemIndex, sceneKey] of [[0, "ChapterGroupSelectScene"], [3, "SettingsScene"]]) {
    await page.evaluate(index => window.__testGame.scene.getScene("MainMenuScene").items[index].action(), itemIndex);
    await page.waitForFunction(key => window.__testGame.scene.isActive(key), sceneKey);
    await page.evaluate(key => window.__testGame.scene.getScene(key).goBack(), sceneKey);
    await page.waitForFunction(() => window.__testGame.scene.isActive("MainMenuScene"));
    assert.equal(await page.locator(".replay-menu").count(), 0, `${sceneKey} return must not reopen replays`);
    assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("MainMenuScene").input.enabled), true);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "recent replay, playback, pause, restart, import/export, mobile layout and menu return passed", recordedTick, expected }));
} finally { await browser.close(); }
