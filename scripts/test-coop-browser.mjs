import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const url = option("url") ?? "http://127.0.0.1:5173", server = option("server") ?? "http://127.0.0.1:5180";
const browser = await chromium.launch({ headless: true, executablePath: option("browser") });
const errors = [];
const pages = [];
try {
  for (const [name, completed] of [["Host", ["1-1"]], ["Guest", []]]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(completed => {
      localStorage.setItem("characters-vs-geometry-progress-v1", JSON.stringify({ version: 1, tutorialOrderVersion: 2,
        completedLevelIds: completed, allCardsUnlocked: false, seenEnemyKinds: [], seenBossKinds: [], bestWaves: {}, bestBossRanks: {},
        bestWavesByDifficulty: {}, bestBossRanksByDifficulty: {}, flawlessDifficulties: {} }));
    }, completed);
    const page = await context.newPage(); pages.push(page); page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.route("**/src/main.ts*", async route => {
      const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__testGame?.scene.isActive("MainMenuScene"));
    await page.evaluate(() => window.__testGame.scene.getScene("MainMenuScene").scene.start("CoopScene"));
    await page.locator("#coop-name").fill(name); await page.locator("#coop-address").fill(server);
  }
  const [host, guest] = pages;
  await host.getByRole("button", { name: "创建房间", exact: true }).click();
  await host.waitForFunction(() => window.__testGame.scene.getScene("CoopScene").state?.code);
  const code = await host.evaluate(() => window.__testGame.scene.getScene("CoopScene").state.code);
  await guest.locator("#coop-code").fill(code);
  await guest.getByRole("button", { name: "加入房间", exact: true }).click();
  await guest.waitForFunction(() => window.__testGame.scene.getScene("CoopScene").state?.players.length === 2);
  await host.waitForFunction(() => window.__testGame.scene.getScene("CoopScene").state?.players.length === 2);
  const levels = await host.locator("#coop-level option").allTextContents();
  assert.ok(levels.includes("1-1")); assert.equal(levels.includes("1-2"), false);
  await host.locator("#coop-level").selectOption("1-1");
  await guest.waitForFunction(() => window.__testGame.scene.getScene("CoopScene").state?.levelId === "1-1");
  assert.equal(await guest.locator("#coop-level").isDisabled(), true);
  await host.screenshot({ path: "logs/coop-lobby-desktop.png" });
  await guest.setViewportSize({ width: 390, height: 844 });
  assert.equal(await guest.evaluate(() => document.querySelector(".coop-content").scrollWidth <= innerWidth), true);
  await guest.screenshot({ path: "logs/coop-lobby-mobile.png" });
  await guest.setViewportSize({ width: 800, height: 600 });
  const clickScene = async (page, what) => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const point = await page.evaluate(async what => {
      const game = window.__testGame, scene = what.cell ? game.scene.getScenes(true).find(s => s.sys.settings.key.startsWith("RemoteBattle-")) : game.scene.getScene("CardSelectScene");
      let p;
      if (what.cell) {
        const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = await import("/src/config.ts");
        p = { x: BOARD_X + (what.cell[1] + .5) * CELL_WIDTH, y: BOARD_Y + (what.cell[0] + .5) * CELL_HEIGHT };
      } else {
        const bounds = (what.card ? scene.cardFrames.get(what.card) : scene.startButton).getBounds(); p = { x: bounds.centerX, y: bounds.centerY };
      }
      const transformed = scene.cameras.main.matrix.transformPoint(p.x - scene.cameras.main.scrollX, p.y - scene.cameras.main.scrollY);
      const rect = game.canvas.getBoundingClientRect(); return { x: rect.x + transformed.x * rect.width / scene.scale.width,
        y: rect.y + transformed.y * rect.height / scene.scale.height };
    }, what);
    await page.mouse.click(point.x, point.y);
  };
  for (const [page, card] of [[host, "A"], [guest, "B"]]) {
    await page.getByRole("button", { name: "选择字符", exact: true }).click();
    await page.waitForFunction(() => window.__testGame.scene.isActive("CardSelectScene"));
    await clickScene(page, { card });
    assert.deepEqual(await page.evaluate(() => window.__testGame.scene.getScene("CardSelectScene").selectedCards), [card]);
    await clickScene(page, { start: true });
    await page.waitForFunction(() => window.__testGame.scene.getScene("CoopScene").state.players.find(p => p.id === window.__testGame.scene.getScene("CoopScene").actorId).cards.length === 1);
    await page.getByRole("button", { name: "准备", exact: true }).click();
  }
  await host.getByRole("button", { name: "开始战斗", exact: true }).click();
  for (const page of pages) await page.waitForFunction(() => window.__testGame.scene.getScenes(true).some(s => s.sys.settings.key.startsWith("RemoteBattle-") && s.inputPort?.ready));
  await host.evaluate(() => window.__testGame.scene.getScenes(true).find(s => s.sys.settings.key.startsWith("RemoteBattle-")).inputPort.request({ type: "control", control: { type: "pause", paused: true } }));
  for (const page of pages) await page.waitForFunction(() => window.__testGame.scene.getScenes(true).some(s => s.sys.settings.key.startsWith("RemoteBattle-") && s.runtime.session.controls.paused && !s.inputPort.busy));
  await clickScene(host, { cell: [3, 2] }); await clickScene(guest, { cell: [4, 2] });
  for (const page of pages) await page.waitForFunction(() => window.__testGame.scene.getScenes(true).some(s => s.sys.settings.key.startsWith("RemoteBattle-") && s.runtime.world.towers.length === 2));
  const states = await Promise.all(pages.map(page => page.evaluate(() => {
    const scene = window.__testGame.scene.getScenes(true).find(s => s.sys.settings.key.startsWith("RemoteBattle-"));
    return { checksum: scene.battleChecksum(), owners: scene.runtime.world.towers.map(t => t.ownerId).sort() };
  })));
  assert.deepEqual(states[0], states[1]); assert.deepEqual(states[0].owners, ["guest", "host"]);
  await host.screenshot({ path: "logs/coop-battle-desktop.png" });
  await guest.screenshot({ path: "logs/coop-battle-small.png" });
  await host.evaluate(() => window.__testGame.scene.getScenes(true).find(s => s.sys.settings.key.startsWith("RemoteBattle-")).onRemoteExit());
  await host.waitForFunction(() => window.__testGame.scene.isActive("MainMenuScene"));
  await guest.waitForFunction(() => !document.querySelector(".coop-connection")?.hidden);
  await guest.getByRole("button", { name: "退出联机" }).click();
  await guest.waitForFunction(() => window.__testGame.scene.isActive("MainMenuScene"));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "two-player lobby, local cards, deployment, sync and exit passed", ...states[0] }));
} catch (error) {
  for (const [index, page] of pages.entries()) {
    console.log(await page.evaluate(() => {
      const lobby = window.__testGame?.scene.getScene("CoopScene"), cards = window.__testGame?.scene.getScene("CardSelectScene");
      return { error: lobby?.error, busy: lobby?.busy, choosing: lobby?.choosing, state: lobby?.state,
        selected: cards?.selectedCards, selectionFinished: cards?.selectionFinished,
        scenes: window.__testGame?.scene.getScenes(true).map(s => s.sys.settings.key) };
    }));
    await page.screenshot({ path: `logs/coop-failure-${index}.png` });
  }
  console.log(errors); throw error;
} finally {
  for (const page of pages) await page.evaluate(() => window.__testGame?.scene.getScene("CoopScene")?.client?.request("leave", {}).catch(() => {})).catch(() => {});
  await browser.close();
}
