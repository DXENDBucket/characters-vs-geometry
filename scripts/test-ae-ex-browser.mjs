import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
fs.mkdirSync("logs", { recursive: true });
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
    const { getLevelConfig } = await mod("/src/data/levels.ts");
    const { setLanguage } = await mod("/src/i18n.ts");
    const { waveWeightLimit, waveScheduleAction } = await mod("/src/game/waves.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await mod("/src/game/validateBattleSave.ts");
    const c = await mod("/src/config.ts");
    const check = (ok, message) => { if (!ok) throw Error(message); };
    progress.completeAllLevels(); progress.unlockAllCards();
    const game = window.__testGame;
    const start = (key, data) => {
      game.loop.stop();
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start(key, data);
      return game.scene.getScene(key);
    };
    const level = getLevelConfig("AE-EX-1");
    window.__previewExLevel = () => {
      const map = start("LevelSelectScene", { chapterId: "AE2", difficulty: 1 });
      const node = map.chapterNodes().find(node => node.id === level.id);
      const label = map.mapContainer.list.find(item => item.text === level.id);
      check(label && label.x === node.x && label.y === node.y - 3, "Long ordinary level label is not centered");
      check(label.width < c.LEVEL_NODE_WIDTH - 12, "Level label overflows frame");
      game.loop.start(game.step.bind(game));
    };
    window.__previewExLevel();
    const scene = start("GameScene", { levelId: level.id, seed: 771, difficulty: 1, selectedCards: ["A", "B"] });
    check(scene.chars === 2000, "Wrong initial funds");
    const budgets = [30, 65, 105, 150, 200, 255, 315, 380, 450, 1050];
    for (let wave = 1; wave <= 10; wave++) {
      for (const enemy of scene.enemies) enemy.body.destroy();
      scene.enemies.length = 0;
      scene.spawnWave(wave * 30000, wave * 30000);
      const extra = scene.enemies.filter(enemy => enemy.kind === "chevronLeader");
      check(extra.length === 1 && extra[0].lane === 3 && extra[0].y === c.BOARD_Y + 3.5 * c.CELL_HEIGHT,
        `Wave ${wave}: extra leader count/lane`);
      check(extra[0].maxHp === 32000 && extra[0].weight === 0 && extra[0].waveNumber === wave,
        `Wave ${wave}: wrong leader rank or weight`);
      const ordinary = scene.enemies.filter(enemy => enemy !== extra[0]);
      check(ordinary.every(enemy => level.enemyKinds.includes(enemy.kind)), "Unexpected ordinary enemy");
      check(waveWeightLimit(level, c.difficultyConfigs[1], wave) === budgets[wave - 1], "Wrong weight growth");
      check(scene.waveTracker.totalWeight === ordinary.reduce((sum, enemy) => sum + enemy.weight, 0), "Extra leader consumed weight");
      if (wave <= 4) check(ordinary.every(enemy => !enemy.kind.startsWith("triangleRam")), "Early ram bypassed restriction");
    }
    check(waveScheduleAction(level, 10, scene.waveTracker, 1, 500000) === "wait", "Finished with leader alive");
    check(waveScheduleAction(level, 10, scene.waveTracker, 0, 500000) === "complete", "Did not finish after ten waves");
    const graph = captureBattleSnapshot(scene.battleState());
    validateBattleSave(graph, 10);
    const restored = restoreBattleSnapshot(scene, graph);
    check(restored.enemies.filter(enemy => enemy.kind === "chevronLeader").length === 1, "Snapshot lost extra leader");
    for (const enemy of restored.enemies) enemy.body.destroy();
    const ex3 = getLevelConfig("AE-EX-3");
    const runEx3 = () => {
      const battle = start("GameScene", { levelId: ex3.id, seed: 772, difficulty: 3, selectedCards: [] });
      const results = [], seen = new Set();
      check(battle.chars === 2000 && ex3.totalWaves === 30, "EX-3 template mismatch");
      for (let wave = 1; wave <= 30; wave++) {
        for (const enemy of battle.enemies) enemy.body.destroy();
        battle.enemies.length = 0;
        battle.spawnWave(wave * 30000, wave * 30000);
        const extra = battle.enemies.filter(enemy => enemy.kind === "archangelHeptagon");
        check(extra.length === 1 && extra[0].weight === 0 && extra[0].maxHp === 4000,
          `EX-3 wave ${wave}: missing or duplicate rank-I archangel`);
        check(extra[0].lane >= 0 && extra[0].lane < c.LANES, "Extra leader lane out of bounds");
        const ordinary = battle.enemies.filter(enemy => enemy !== extra[0]);
        check(ordinary.every(enemy => ex3.enemyKinds.includes(enemy.kind)), "EX-3 wrong enemy pool");
        check(ordinary.filter(enemy => enemy.kind === "chevronLeader").length === (wave % 10 === 0 ? 1 : 0),
          "EX-3 greater-than leader did not follow flag rules");
        if (wave <= 4) check(!ordinary.some(enemy => enemy.kind.startsWith("triangleRam")), "EX-3 early siege ram");
        check(battle.waveTracker.totalWeight === ordinary.reduce((sum, enemy) => sum + enemy.weight, 0),
          "EX-3 extra spawn consumed wave budget");
        for (const enemy of ordinary) seen.add(enemy.kind);
        results.push(battle.enemies.map(enemy => [enemy.kind, enemy.lane, enemy.x]));
      }
      for (const kind of ["tilde4", "tilde5", "triangleRam4", "triangleRam5"]) check(seen.has(kind), `Missing ${kind}`);
      check(new Set(results.map(wave => wave.at(-1)[1])).size > 1, "Extra archangel always uses the same row");
      check(waveScheduleAction(ex3, 30, battle.waveTracker, 1, 1000000) === "wait", "EX-3 ends with enemies alive");
      check(waveScheduleAction(ex3, 30, battle.waveTracker, 0, 1000000) === "complete", "EX-3 fails to end after wave 30");
      validateBattleSave(captureBattleSnapshot(battle.battleState()), 30);
      return JSON.stringify(results);
    };
    check(runEx3() === runEx3(), "Extra-spawn row selection is not deterministic");
    window.__previewEnvironment = (levelId, language, boss = false) => {
      setLanguage(language);
      const config = getLevelConfig(levelId), previousBoss = config.bossKind;
      if (boss) config.bossKind = "del";
      let preview;
      try { preview = start("CardSelectScene", { levelId, difficulty: 1 }); }
      finally { if (previousBoss) config.bossKind = previousBoss; else delete config.bossKind; }
      const descriptions = preview.enemyPreviewList.list.filter(item => item.name === "level-environment-description");
      check(descriptions.length === 1, "Missing environment description");
      const text = descriptions[0];
      check(text.width <= preview.enemyPreviewViewport.width - 12 && !text.text.includes("\n"), "Environment text overflow");
      const enemyLink = preview.enemyPreviewLinks.find(link => link.enemyKind);
      check(text.y + text.height <= enemyLink.top, "Environment overlaps enemies");
      if (boss) {
        const bossLink = preview.enemyPreviewLinks.find(link => link.bossKind);
        check(bossLink && text.y >= bossLink.bottom, "Environment must follow Boss display");
      }
      if (levelId === level.id) check(preview.enemyPreviewLinks.some(link => link.enemyKind === "chevronLeader"), "Missing extra enemy preview");
      if (levelId === ex3.id) {
        for (const kind of ["tilde3", "triangleRam3", "archangelHeptagon"]) {
          check(preview.enemyPreviewLinks.some(link => link.enemyKind === kind), `Missing EX-3 preview: ${kind}`);
        }
      }
      game.loop.start(game.step.bind(game));
      return text.text;
    };
  });
  for (const language of ["zh-CN", "en"]) {
    for (const [levelId, boss] of [["AE-EX-1", false], ["AE-EX-3", false], ["5-9", false], ["AE-EX-1", true]]) {
      console.log(await page.evaluate(({ levelId, language, boss }) => window.__previewEnvironment(levelId, language, boss), { levelId, language, boss }));
      for (const [width, height] of [[1440, 900], [800, 600]]) {
        await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
        await page.screenshot({ path: `logs/ae-ex-${levelId}-${language}-${boss}-${width}.png` });
      }
    }
  }
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.__previewExLevel());
  for (const [width, height] of [[1440, 900], [800, 600]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    await page.screenshot({ path: `logs/ae-ex-level-label-${width}.png` });
  }
  console.log("AE-EX-1/3 wave counts, fixed/random extra leaders, ranks, determinism, weights, completion, save and previews passed");
} finally { await browser.close(); }
