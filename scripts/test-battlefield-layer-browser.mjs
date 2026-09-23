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
    window.__clipProbe = scene.add.rectangle(640, 380, 1280, 760, 0x12ef56).setDepth(1e9);
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
      const sample = (x, y) => [...ctx.getImageData(Math.floor(rect.x + x * rect.width / 1280),
        Math.floor(rect.y + y * rect.height / 760), 1, 1).data].slice(0, 3);
      return [[640, 400], [204, 400], [212, 400], [640, 134], [640, 142], [1250, 400], [1258, 400], [640, 680], [640, 688]].map(([x,y]) => sample(x,y));
    }, image.toString("base64"));
    for (const index of [0, 2, 4, 5, 7]) assert.deepEqual(samples[index], [18, 239, 86], `${name}: missing inside clip at sample ${index}`);
    for (const index of [1, 3, 6, 8]) assert.notDeepEqual(samples[index], [18, 239, 86], `${name}: leaked outside clip`);
  }
  await page.evaluate(() => window.__clipProbe.destroy());
  const point = async (x, y) => page.evaluate(({x,y}) => {
    const rect = window.__testGame.canvas.getBoundingClientRect();
    return { x: rect.x + x * rect.width / 1280, y: rect.y + y * rect.height / 760 };
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
    const game = window.__testGame;
    const listeners = game.scene.getScene("GameScene").events.listenerCount("addedtoscene");
    for (const levelId of ["0-1", "0-5", "AE-10"]) {
      game.scene.stop("GameScene"); game.scene.start("GameScene", { levelId, selectedCards: ["A", "B"] });
      const scene = game.scene.getScene("GameScene"); scene.battlePaused = true;
      if (scene.events.listenerCount("addedtoscene") !== listeners) throw Error("Routing listeners leaked across restart");
      if (levelId.startsWith("0-") && !scene.battlefield.uiLayer.list.some(o => o.type === "Container" && o.depth === 170))
        throw Error("Tutorial panel was clipped");
    }
  });
  await page.waitForTimeout(100);
  assert.deepEqual(errors, []);
  console.log("Battlefield clipping, UI input, tutorials and restart checks passed");
} finally { await browser.close(); }
