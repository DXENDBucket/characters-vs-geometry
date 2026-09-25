import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  await mkdir("logs", { recursive: true });
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
    const module = async path => import(performance.getEntriesByType("resource").map(entry => entry.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const progress = await module("/src/progress.ts");
    const { levelNodes, getLevelConfig } = await module("/src/data/levels.ts");
    const { spawnEnemyAt } = await module("/src/game/enemyRuntime.ts");
    const { palette, uiTextColors } = await module("/src/config.ts");
    const game = window.__testGame;
    game.loop.stop();
    const check = (value, message) => { if (!value) throw Error(message); };
    const start = (key, data = {}) => {
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start(key, data);
      return game.scene.getScene(key);
    };
    const battle = (id, data = {}) => start("GameScene", { levelId: id, selectedCards: ["A"], difficulty: 0, seed: 10, ...data });
    progress.resetProgress();
    let scene = battle("1-1");
    scene.endLevel();
    check(progress.bestFlawlessDifficulty("1-1") === 0, "Difficulty zero flawless not awarded");
    scene = battle("1-2");
    spawnEnemyAt(scene.combatRuntime(), { kind: "circle", waveNumber: 1, time: 0, lane: 0, x: 300, waveWeight: 0, finalDamageReduction: 0 });
    scene.handleEnemyReachedBase(scene.enemies.at(-1));
    scene.baseIntegrity = 6;
    scene.endLevel();
    check(progress.isLevelCompleted("1-2") && progress.bestFlawlessDifficulty("1-2") === undefined, "Healing erased breach history");
    scene = battle("1-3");
    scene.debugModeEnabled = true;
    scene.executingCommand = true;
    scene.grantDebugChars();
    scene.executingCommand = false;
    scene.endLevel();
    check(progress.bestFlawlessDifficulty("1-3") === undefined, "Debug resources awarded flawless");
    for (const mode of ["normal", "super"]) {
      scene = battle("1-4");
      scene.debugDamageMode = mode;
      scene.applyDebugDamage(300, 200);
      scene.endLevel();
      check(progress.bestFlawlessDifficulty("1-4") === undefined, "Debug damage awarded flawless");
    }
    scene = battle("1-5", { unlimitedFirepower: true });
    scene.endLevel();
    check(progress.bestFlawlessDifficulty("1-5") === undefined, "Unlimited firepower awarded flawless");
    scene = battle("1-6");
    const replay = scene.exportReplay();
    scene = start("GameScene", { replay });
    scene.endLevel();
    check(!progress.isLevelCompleted("1-6"), "Playback wrote progress");
    scene = battle("1-3", { difficulty: 7 });
    scene.debugModeEnabled = true;
    scene.endLevel();
    check(progress.bestFlawlessDifficulty("1-3") === 7, "Unused debug controls or prior run poisoned next run");
    progress.completeAllLevels();
    for (const node of levelNodes) {
      if (!getLevelConfig(node.id).survival) progress.completeLevel(node.id, { difficulty: node.id.startsWith("0-") ? 0 : 7, flawless: true });
    }
    progress.reloadProgress();
    check(progress.bestFlawlessDifficulty("1-3") === 7, "Reload lost flawless record");

    window.__flawlessStart = (key, data) => {
      game.loop.stop();
      const scene = start(key, data);
      const containers = key === "ChapterGroupSelectScene" ? scene.strip.list : [scene.mapContainer];
      for (const container of containers) {
        const gold = container.list.filter(item => item.name === "flawless-mark");
        const blue = container.list.filter(item => item.name === "completion-mark");
        check(gold.length === blue.length, "Original clear check was replaced");
        for (let i = 0; i < gold.length; i++) {
          check(blue[i].style.color === uiTextColors.completed, "Clear check is not blue");
          check(gold[i].getBounds().right < blue[i].getBounds().left, "Flawless mark must sit left of clear check");
        }
      }
      if (key === "ChapterGroupSelectScene") {
        scene.highlight(0); scene.highlight(-1);
        check(scene.frames[0].strokeColor === palette.gold, "Hover lost group gold frame");
        check(!scene.strip.list[1].list.some(item => item.name === "flawless-mark"), "Endless group has flawless mark");
      }
      game.loop.wake();
    };
  });

  for (const [size, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, small: { width: 800, height: 600 } })) {
    await page.setViewportSize(viewport);
    for (const [key, data] of [
      ["LevelSelectScene", { chapterId: "1" }],
      ["ChapterSelectScene", { groupId: "main" }],
      ["ChapterGroupSelectScene", { groupId: "main" }]
    ]) {
      await page.evaluate(({ key, data }) => window.__flawlessStart(key, data), { key, data });
      await page.waitForTimeout(250);
      await page.screenshot({ path: `logs/flawless-${key}-${size}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log("Flawless outcomes, cheats, replay exclusion, persistence and all three selection views passed.");
} finally {
  await browser.close();
}
