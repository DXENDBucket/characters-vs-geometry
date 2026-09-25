import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const mod = path => import(performance.getEntriesByType("resource").map(entry => entry.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const { setLanguage } = await mod("/src/i18n.ts"); setLanguage("zh-CN");
    const progress = await mod("/src/progress.ts"); progress.resetProgress(); progress.completeLevel("0-1");
    const game = window.__testGame; game.loop.stop();
    for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
    game.scene.start("GameScene", { levelId: "0-2", difficulty: 9, unlimitedFirepower: true, selectedCards: ["S"], seed: 71 });
    const scene = game.scene.getScene("GameScene");
    const check = (ok, message) => { if (!ok) throw Error(message); };
    check(scene.selectedCardIds.join() === "A,X,B", "Loadout is not fixed");
    check(scene.chars === 350, "Incorrect starting funds");
    check(!scene.unlimitedFirepower && scene.difficultyConfig.weightMultiplier === 1 && scene.difficultyConfig.finalDamageReduction === 0, "Tutorial difficulty is not fixed");
    check(scene.sealedCells.size === 78 && scene.sealedCellMarks.size === 78, "Missing sealed cells/marks");
    for (let lane = 0; lane < 7; lane++) for (let column = 0; column < 13; column++) {
      check(scene.cellIsDeployable(lane, column) === (lane === 3), "Incorrect deployable row");
    }
    check(scene.spawnGeneratedTower("A", 2, 1, 1) === null, "Generated tower bypassed cell ban");
    check(scene.deployment.useCard(scene.getDefinition("A"), 2, 1) === "occupied", "Card bypassed cell ban");
    const x = scene.spawnGeneratedTower("X", 3, 1, 1);
    check(x?.inPlay, "Middle row cannot accept towers");
    scene.levelElapsed = 30000; scene.stepBattle(1000 / 60);
    check(scene.wave === 0 && !scene.enemies.length, "Waves started before the introduction was dismissed");
    scene.battlePaused = true;
    game.loop.start(game.step.bind(game));
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/practice-tutorial-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/practice-tutorial-small.png" });
  const result = await page.evaluate(async () => {
    const game = window.__testGame; game.loop.stop();
    const scene = game.scene.getScene("GameScene"); scene.battlePaused = false;
    scene.submitPlayerControl("local", { type: "tutorialAdvance" });
    const budgets = [];
    for (let wave = 1; wave <= 5; wave++) {
      scene.world.updateWaveSchedule(30000 + wave * 30000, wave * 30000, scene.worldSystems);
      if (scene.wave !== wave || !scene.enemies.length || scene.enemies.some(enemy => enemy.lane !== 3 || !["circle", "triangle"].includes(enemy.kind))) throw Error("Incorrect practice wave");
      budgets.push(scene.waveTracker.totalWeight);
      for (const enemy of scene.enemies) enemy.body.destroy();
      scene.enemies = []; scene.waveTracker.defeatedWeight = scene.waveTracker.totalWeight;
    }
    scene.world.updateWaveSchedule(210000, 210000, scene.worldSystems);
    if (!scene.gameOver) throw Error("Practice did not finish after five cleared waves");
    return budgets;
  });
  assert.equal(result.length, 5);
  result.forEach((weight, index) => assert.ok(weight <= 10 + index * 5 && weight > 0));
  assert.deepEqual(errors, []);
  console.log("Practice tutorial checks passed", result);
} finally { await browser.close(); }
