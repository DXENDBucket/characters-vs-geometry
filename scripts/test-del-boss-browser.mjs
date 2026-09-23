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
  const result = await page.evaluate(async () => {
    const moduleFor = path => import(performance.getEntriesByType("resource").map(r => r.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const config = await moduleFor("/src/config.ts");
    const progress = await moduleFor("/src/progress.ts");
    const { updateCubeBossMotion } = await moduleFor("/src/bosses/cubeBoss.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await moduleFor("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await moduleFor("/src/game/validateBattleSave.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.completeAllLevels(); progress.unlockAllCards();
    for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
    game.scene.start("GameScene", { levelId: "AE-10", seed: 512, difficulty: 1, selectedCards: ["A", "B", "O"] });
    const scene = game.scene.getScene("GameScene"), boss = scene.boss;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    check(boss?.kind === "del", "DEL did not spawn");
    check(boss.hp === 120000 && boss.baseStats.armor === 150 && boss.baseStats.magicResistance === 20, "Wrong panel");
    check(boss.hitboxWidth === config.CELL_WIDTH * 3 && boss.hitboxHeight === config.CELL_HEIGHT * 3, "Wrong hitbox");
    check(!boss.hasSkills && !boss.labelText.visible, "Placeholder skills or duplicate label visible");
    const position = [boss.x, boss.y];
    updateCubeBossMotion(boss, 60, 1, 60000);
    check(boss.x === position[0] && boss.y === position[1], "Stationary boss moved");
    const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateBattleSave(graph, scene.wave, "del");
    const restored = restoreBattleSnapshot(scene, graph);
    check(restored.boss.kind === "del" && restored.boss.hp === boss.hp, "Snapshot lost DEL");
    restored.boss.body.destroy();
    scene.combatRuntime().damageBoss(1000, "physical");
    check(boss.hp < 120000 && boss.hp > 119000, "DEL cannot receive damage");
    scene.battlePaused = true;
    window.__drawDelAt = time => updateCubeBossMotion(boss, 0, 1, time);
    window.__drawDelAt(500);
    game.loop.start(game.step.bind(game));
    return { hp: boss.maxHp, hitbox: [boss.hitboxWidth, boss.hitboxHeight] };
  });
  for (const [name, width, height] of [["desktop", 1440, 900], ["small", 800, 600]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    const images = [];
    for (const time of [500, 3300]) {
      await page.evaluate(time => window.__drawDelAt(time), time);
      await page.waitForTimeout(100);
      await page.screenshot({ path: `logs/del-${name}-${time}.png` });
      const clip = await page.evaluate(() => {
        const game = window.__testGame, boss = game.scene.getScene("GameScene").boss;
        const bounds = game.canvas.getBoundingClientRect(), sx = bounds.width / game.scale.gameSize.width;
        const sy = bounds.height / game.scale.gameSize.height;
        return { x: bounds.x + (boss.x - boss.hitboxWidth / 2) * sx,
          y: bounds.y + (boss.y - boss.hitboxHeight / 2) * sy,
          width: boss.hitboxWidth * sx, height: boss.hitboxHeight * sy };
      });
      const image = await page.screenshot({ clip });
      const bright = await page.evaluate(async base64 => {
        const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, image.width, image.height).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] > 130 && data[i + 1] > 130 && data[i + 2] > 130) count++;
        return count;
      }, image.toString("base64"));
      assert.ok(bright > 100, `${name}: empty DEL rendering`);
      images.push(image);
    }
    assert.notDeepEqual(images[0], images[1], `${name}: animation is static`);
  }
  assert.deepEqual(errors, []);
  console.log("DEL browser checks passed", result);
} finally {
  await browser.close();
}
