import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
fs.mkdirSync("logs", { recursive: true });
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
    const moduleFor = path => import(performance.getEntriesByType("resource").map(r => r.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const progress = await moduleFor("/src/progress.ts");
    progress.completeAllLevels(); progress.unlockAllCards();
    const game = window.__testGame;
    for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
    game.scene.start("GameScene", { levelId: "AE-10", selectedCards: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] });
    const scene = game.scene.getScene("GameScene"); scene.battlePaused = true;
    if (scene.boss.body.displayList !== scene.battlefield.worldLayer) throw Error("Boss not routed to world");
    if (scene.cardList.container.displayList !== scene.battlefield.uiLayer) throw Error("Cards not routed to UI");
    if (scene.ui.titleText.displayList !== scene.battlefield.uiLayer) throw Error("HUD not routed to UI");
    if (game.scale.width !== 1410 || scene.cameras.main.width !== 1410) throw Error("Battle canvas did not widen");
    window.__clipProbe = scene.add.rectangle(705, 380, 1410, 760, 0x12ef56).setDepth(1e9);
    if (window.__clipProbe.displayList !== scene.battlefield.worldLayer) throw Error("Future visuals bypass world routing");
  });
  for (const [name, width, height] of [["desktop", 1440, 900], ["small", 800, 600]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const image = await page.screenshot({ path: `logs/battlefield-clip-${name}.png` });
    const samples = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      const game = window.__testGame, rect = game.canvas.getBoundingClientRect();
      const sample = (x, y) => [...ctx.getImageData(Math.floor(rect.x + x * rect.width / game.scale.width),
        Math.floor(rect.y + y * rect.height / game.scale.height), 1, 1).data].slice(0, 3);
      return [[640, 400], [204, 400], [212, 400], [640, 88], [640, 96], [1300, 400], [1390, 400], [640, 724], [640, 735]].map(([x,y]) => sample(x,y));
    }, image.toString("base64"));
    for (const index of [0, 2, 4, 5, 6, 7]) assert.deepEqual(samples[index], [18, 239, 86], `${name}: missing inside clip at sample ${index}`);
    for (const index of [1, 3, 8]) assert.notDeepEqual(samples[index], [18, 239, 86], `${name}: leaked outside clip`);
  }
  await page.evaluate(async () => {
    window.__clipProbe.destroy();
    const url = performance.getEntriesByType("resource").map(r => r.name)
      .find(url => new URL(url).pathname === "/src/game/enemyFactory.ts");
    const { createEnemy } = await import(url);
    const scene = window.__testGame.scene.getScene("GameScene");
    const enemy = createEnemy(scene, { kind: "triangleRam5", lane: 3, x: 1318, time: 0,
      waveNumber: 1, waveWeight: 675, finalDamageReduction: 0 });
    scene.enemies.push(enemy);
  });
  for (const [width, height] of [[1440, 900], [800, 600]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    const pixels = await page.evaluate(() => new Promise(resolve => {
      const game = window.__testGame;
      game.renderer.snapshot(image => {
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        const sx = image.width / game.scale.width, sy = image.height / game.scale.height;
        const data = ctx.getImageData(Math.round(1280 * sx), Math.round(370 * sy), Math.round(110 * sx), Math.round(85 * sy)).data;
        let visible = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] > 100 && data[i + 1] > 100 && data[i + 2] > 100) visible++;
        resolve(visible);
      });
    }));
    assert.ok(pixels > 40, "Enemy outside the old canvas is blank");
    await page.screenshot({ path: `logs/battlefield-entry-${width}.png` });
  }
  const point = async (x, y) => page.evaluate(({x,y}) => {
    const game = window.__testGame, rect = game.canvas.getBoundingClientRect();
    return { x: rect.x + x * rect.width / game.scale.width, y: rect.y + y * rect.height / game.scale.height };
  }, {x,y});
  const listPoint = await point(100, 400);
  await page.mouse.move(listPoint.x, listPoint.y); await page.mouse.wheel(0, 500); await page.waitForTimeout(100);
  const last = await page.evaluate(() => {
    const scene = window.__testGame.scene.getScene("GameScene"), list = scene.cardList;
    if (list.offset <= 0) throw Error("Card scrolling broke");
    const card = list.cards.at(-1);
    return { x: card.frame.x + 40, y: card.frame.y - list.offset + 30, id: card.definition.id };
  });
  const target = await point(last.x, last.y);
  await page.mouse.click(target.x, target.y); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").selectedCardId), last.id);
  const shifter = await page.evaluate(() => {
    const scene = window.__testGame.scene.getScene("GameScene");
    return { x: scene.ui.shifterButton.x, y: scene.ui.shifterButton.y };
  });
  const hover = await point(shifter.x, shifter.y);
  await page.mouse.move(hover.x, hover.y); await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").battlefield.uiLayer.list
    .some(object => object.name === "button-hover" && object.visible)), "HUD hover clipped into world");
  await page.evaluate(() => {
    const scene = window.__testGame.scene.getScene("GameScene");
    scene.selectedCardId = "B"; scene.chars = 10000;
  });
  const cell = await point(240 + 12.5 * 78, 138 + 4.5 * 78);
  await page.mouse.click(cell.x, cell.y); await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").towers.some(t => t.lane === 4 && t.column === 12)),
    "Wider canvas shifted board input");
  await page.evaluate(() => {
    const game = window.__testGame;
    const listeners = game.scene.getScene("GameScene").events.listenerCount("addedtoscene");
    for (const levelId of ["0-1", "0-5", "AE-10"]) {
      game.scene.stop("GameScene"); game.scene.start("GameScene", { levelId, selectedCards: ["A", "B"] });
      const scene = game.scene.getScene("GameScene"); scene.battlePaused = true;
      if (game.scale.width !== 1410) throw Error("Battle width accumulated across restarts");
      if (scene.events.listenerCount("addedtoscene") !== listeners) throw Error("Routing listeners leaked across restart");
      if (levelId.startsWith("0-") && !scene.battlefield.uiLayer.list.some(o => o.type === "Container" && o.depth === 170))
        throw Error("Tutorial panel was clipped");
    }
  });
  await page.evaluate(() => {
    const game = window.__testGame;
    game.scene.stop("GameScene");
    game.scene.start("LevelSelectScene", { chapterId: "AE2" });
    if (game.scale.width !== 1280 || game.scene.getScene("LevelSelectScene").cameras.main.width !== 1280)
      throw Error("Leaving battle did not restore page width");
  });
  await page.waitForTimeout(100);
  assert.deepEqual(errors, []);
  console.log("Battlefield clipping, UI input, tutorials and restart checks passed");
} finally { await browser.close(); }
