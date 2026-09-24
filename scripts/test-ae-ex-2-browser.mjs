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
    const { createTower } = await mod("/src/game/towers.ts");
    const { syncTowerOccupancy } = await mod("/src/game/towerOccupancy.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await mod("/src/game/validateBattleSave.ts");
    const { waveScheduleAction } = await mod("/src/game/waves.ts");
    const { setLanguage } = await mod("/src/i18n.ts");
    const check = (ok, message) => { if (!ok) throw Error(message); };
    progress.completeAllLevels(); progress.unlockAllCards();
    const game = window.__testGame;
    const start = (key, data) => {
      game.loop.stop();
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start(key, data);
      return game.scene.getScene(key);
    };
    const scene = start("GameScene", { levelId: "AE-EX-2", seed: 778, difficulty: 1, selectedCards: ["A", "B", "()", "="] });
    scene.battlePaused = true; scene.autoUpgradeEnabled = false;
    check(scene.chars === 2000 && scene.levelConfig.totalWaves === 20, "Wrong stage defaults");
    const place = (id, time, lane, column) => {
      const tower = createTower(scene, scene.getDefinition(id), lane, column, time, ++scene.towerOrder);
      scene.towers.push(tower); return tower;
    };
    let a = place("B", 0, 3, 3), b = place("A", 5000, 3, 5), shell = place("()", 7000, 3, 3);
    const edge = { type: "=", axis: "horizontal", lane: 3, column: 3, mode: "=", level: 1, autoUpgrade: false };
    scene.edgeTowers.push(edge);
    syncTowerOccupancy(scene.towers, scene.occupied); scene.updateLevelAuras();
    const stepAt = time => { scene.battleTime = time; scene.stepBattle(); };
    stepAt(59900);
    check(a.inPlay && b.inPlay && shell.inPlay, "NUL started early");
    stepAt(60000);
    check(a.nullified && !a.body.visible && b.inPlay && shell.inPlay, "First tower was not independently suspended");
    check(!scene.cellIsDeployable(3, 3), "NUL cell is deployable");
    check(scene.occupied.get("3:3") === shell, "Active shell disappeared with its inner tower");
    stepAt(65000); stepAt(67000);
    check(a.nullified && b.nullified && shell.nullified && scene.edgeTowers[0] === edge, "Staggered NUL or edge exemption failed");
    const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateBattleSave(graph, scene.wave);
    const restored = restoreBattleSnapshot(scene, graph);
    for (const t of [...scene.towers, ...scene.nullification.snapshot().towers]) t.body.destroy();
    for (const enemy of scene.enemies) enemy.body.destroy();
    scene.applyBattleSave(restored);
    [a, b, shell] = scene.nullification.snapshot().towers;
    check(a.deployedAt === 0 && b.deployedAt === 5000 && a.nextNullificationAt === 120000, "Snapshot lost periodic clocks");
    stepAt(70050);
    check(a.inPlay && b.nullified && shell.nullified, "Recovery was not independent");
    check(!scene.cellIsDeployable(3, 3), "Cell reservation disappeared before shell recovered");
    stepAt(75050); check(b.inPlay && shell.nullified, "Second recovery failed");
    stepAt(77050); check(shell.inPlay && !scene.nullification.snapshot(), "Shell did not recover");
    check(a.parenthesisGuard === shell && scene.cellIsDeployable(3, 3), "Shell links or placement did not recover");
    stepAt(120000); check(a.nullified && b.inPlay, "Second cycle drifted to 130 seconds");
    const waves = start("GameScene", { levelId: "AE-EX-2", seed: 777, difficulty: 1, selectedCards: [] });
    for (let wave = 1; wave <= 20; wave++) {
      for (const enemy of waves.enemies) enemy.body.destroy(); waves.enemies.length = 0;
      waves.spawnWave(wave * 30000, wave * 30000);
      check(waves.enemies.every(enemy => waves.levelConfig.enemyKinds.includes(enemy.kind)), "Wrong natural enemy pool");
    }
    check(waveScheduleAction(waves.levelConfig, 20, waves.waveTracker, 0, 900000) === "complete", "Stage did not finish at 20 waves");
    window.__previewEx2 = language => {
      setLanguage(language);
      const preview = start("CardSelectScene", { levelId: "AE-EX-2", chapterId: "AE2", difficulty: 3 });
      const text = preview.enemyPreviewList.list.find(item => item.name === "level-environment-description");
      check(text?.text.includes("60") && text.text.includes("10") && text.text.includes("NUL"), "Missing environment description");
      check(preview.enemyPreviewLinks.length === 6, "Wrong preview families");
      check(text.width <= preview.enemyPreviewViewport.width - 12, "Environment text overflows preview");
      check(preview.enemyPreviewLinks.every(link => link.top >= text.y + text.height), "Environment text overlaps enemy preview");
      game.loop.start(game.step.bind(game));
    };
  });
  for (const language of ["zh-CN", "en"]) {
    await page.evaluate(language => window.__previewEx2(language), language);
    for (const [width, height] of [[1440, 900], [800, 600]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
      await page.screenshot({ path: `logs/ae-ex-2-${language}-${width}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log("AE-EX-2: independent NUL, repeated cycles, shell overlap, snapshot restore, 20 waves and previews passed.");
} finally { await browser.close(); }
