import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const mod = path => import(performance.getEntriesByType("resource").map(entry => entry.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const progress = await mod("/src/progress.ts");
    const { t } = await mod("/src/i18n.ts");
    const check = (ok, message) => { if (!ok) throw Error(message); };
    progress.completeAllLevels();
    for (const [difficulty, count] of [[0, 80], [3, 40], [9, 12]]) {
      progress.recordCompletedWaves("IF-1", count, difficulty);
      progress.recordDefeatedBossRank("IF-BE-1", count, difficulty);
    }
    const game = window.__testGame;
    const start = (key, data) => {
      game.loop.stop();
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start(key, data);
      return game.scene.getScene(key);
    };
    for (const [chapterId, id, key] of [["IF", "IF-1", "label.bestWave"], ["IFB", "IF-BE-1", "label.bestBossRank"]]) {
      const scene = start("LevelSelectScene", { chapterId, difficulty: 3 });
      const label = scene.endlessRecordLabels.get(id);
      check(label?.text === t(key, { count: 40 }), "Initial difficulty record mismatch");
      for (const [difficulty, count] of [[0, 80], [9, 12], [1, 0], [3, 40]]) {
        scene.setDifficultyFromX(172 + difficulty / 9 * 360, 172, 360);
        check(label.text === t(key, { count }), "Difficulty slider did not refresh record");
      }
    }
    const waves = start("GameScene", { levelId: "IF-1", difficulty: 7, seed: 811, selectedCards: [] });
    waves.wave = 23;
    waves.world.updateWaveSchedule(0, 0, waves.worldSystems);
    check(progress.bestWaveForLevel("IF-1", 7) === 23, "Battle used incorrect wave difficulty");
    check(progress.bestWaveForLevel("IF-1", 3) === 40, "Battle overwrote another difficulty");
    const bosses = start("GameScene", { levelId: "IF-BE-1", difficulty: 7, seed: 811, selectedCards: [] });
    check(bosses.boss, "Boss did not spawn");
    bosses.handleBossDefeated(bosses.boss);
    check(progress.bestBossRankForLevel("IF-BE-1", 7) === 1, "Battle used incorrect Boss difficulty");
    check(progress.bestBossRankForLevel("IF-BE-1", 3) === 40, "Boss battle overwrote another difficulty");
    check(bosses.boss.rank === 2, "Endless Boss progression stopped");
    start("LevelSelectScene", { chapterId: "IFB", difficulty: 7 });
    game.loop.start(game.step.bind(game));
  });
  await page.waitForTimeout(100);
  assert.deepEqual(errors, []);
  console.log("Endless difficulty records: selectors and battle recording passed.");
} finally {
  await browser.close();
}
