import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const result = await page.evaluate(async () => {
    const mod = path => import(performance.getEntriesByType("resource").map(e => e.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const { GameScene } = await mod("/src/scenes/GameScene.ts");
    const progress = await mod("/src/progress.ts");
    const { NO_PROJECTILE_PRESENTATION } = await mod("/src/game/projectilePresentation.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const cfg = await mod("/src/config.ts");
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const data = { levelId: "5-5", seed: 916, selectedCards: ["A", "E", "C", "V", "x", "R", "N", "j"] };
    const start = key => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, data);
      return game.scene.getScene(key);
    };
    const displayed = start("ProjectileDisplayed"), silent = start("ProjectileSilent");
    silent.projectileRuntime().presentation = NO_PROJECTILE_PRESENTATION;
    for (const scene of [displayed, silent]) {
      scene.submitPlayerControl("local", { type: "debugMode", enabled: true });
      scene.submitPlayerControl("local", { type: "debugChars" });
      scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
      for (const [type, lane, column] of [["A", 0, 2], ["E", 1, 2], ["C", 2, 2], ["x", 3, 2],
        ["R", 4, 6], ["N", 3, 6], ["V", 5, 2], ["j", 4, 2]]) {
        check(scene.submitPlayerOperation("local", { type: "deploy", card: type, cell: { lane, column }, expected: null }) === "deployed",
          `Missing ${type} fixture`);
      }
      for (const [kind, lane] of [["shootingTriangle", 0], ["diamond", 1], ["mortarTriangle", 4], ["pentagon", 5], ["chevronLeader", 6]]) {
        spawnEnemyAt(scene.combatRuntime(), { kind, lane, x: cfg.BOARD_X + 9.5 * cfg.CELL_WIDTH,
          time: scene.battleTime, waveNumber: 1, waveWeight: 0, finalDamageReduction: 0 });
      }
    }
    let observed = { friendly: 0, hostile: 0, mortar: 0 }, gathering = false;
    const tick = scenes => {
      for (const scene of scenes) scene.update(0, 1000 / 60);
      observed.friendly = Math.max(observed.friendly, displayed.projectiles.length);
      observed.hostile = Math.max(observed.hostile, displayed.enemyProjectiles.length);
      observed.mortar = Math.max(observed.mortar, displayed.mortarProjectiles.length);
    };
    for (let i = 0; i < 1200; i++) {
      if (i === 660) for (const scene of [displayed, silent]) {
        const j = scene.towers.find(tower => tower.type === "j");
        check(j, "Gathering tower disappeared before activation");
        check(scene.submitPlayerOperation("local", { type: "skill", skill: "j",
          targets: [{ kind: "tower", id: j.entityId }], point: null }) === "handled", "Gathering activation failed");
        gathering = true;
      }
      tick([displayed, silent]);
      if (i % 60 === 0) check(displayed.battleChecksum() === silent.battleChecksum(), `Presentation changed combat at ${i}`);
    }
    const restored = start("ProjectileRestored");
    restored.applyBattleSave(restoreBattleSnapshot(restored, captureBattleSnapshot(displayed.battleState())));
    restored.projectileRuntime().presentation = NO_PROJECTILE_PRESENTATION;
    for (let i = 0; i < 600; i++) tick([displayed, silent, restored]);
    const hash = displayed.battleChecksum();
    check(hash === silent.battleChecksum() && hash === restored.battleChecksum(), "Presentation/checkpoint continuation diverged");
    check(Object.values(observed).every(count => count > 0), "Fixture missed a projectile family");
    for (const scene of [displayed, silent, restored]) game.scene.stop(scene.sys.settings.key);
    return { tick: displayed.simulation.tick, checksum: hash, observed, gathering, restored: true };
  });
  assert.deepEqual(errors, []);
  console.log("Actual combat is unchanged with projectile presentation detached", result);
} finally { await browser.close(); }
