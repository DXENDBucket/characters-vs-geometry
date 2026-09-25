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
    const { enemySimulationRuntime } = await mod("/src/render/enemySimulation.ts");
    const { NO_ENEMY_SIMULATION_PRESENTATION } = await mod("/src/game/enemySimulationPresentation.ts");
    const { NO_PROJECTILE_PRESENTATION } = await mod("/src/game/projectilePresentation.ts");
    const { NO_UNIT_LIFECYCLE_PRESENTATION } = await mod("/src/game/unitLifecyclePresentation.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { enemyFamily } = await mod("/src/registry/enemies.ts");
    const cfg = await mod("/src/config.ts");
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const data = { levelId: "AE-5", seed: 923, selectedCards: ["B", "D", "R", "O", "x", "w", "A", "()"] };
    const start = key => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, data);
      return game.scene.getScene(key);
    };
    const detach = scene => {
      enemySimulationRuntime(scene.combatRuntime()).presentation = NO_ENEMY_SIMULATION_PRESENTATION;
      scene.projectileRuntime().presentation = NO_PROJECTILE_PRESENTATION;
      scene.unitLifecycleRuntime().presentation = NO_UNIT_LIFECYCLE_PRESENTATION;
    };
    const displayed = start("EnemyDisplayed"), silent = start("EnemySilent");
    detach(silent);
    const observed = { passengers: false, burrow: false, slope: false, lead: false, wings: false, ion: false,
      hostile: false, mortar: false, laser: false };
    for (const scene of [displayed, silent]) {
      scene.submitPlayerControl("local", { type: "debugMode", enabled: true });
      scene.submitPlayerControl("local", { type: "debugChars" });
      scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
      for (const [type, lane, column] of [["D", 0, 3], ["R", 1, 3], ["O", 2, 3], ["B", 3, 3],
        ["w", 4, 3], ["()", 5, 3], ["A", 5, 3], ["x", 6, 2]]) {
        check(scene.submitPlayerOperation("local", { type: "deploy", card: type, cell: { lane, column }, expected: null }) === "deployed",
          `Missing ${type} fixture`);
      }
      const spawn = (kind, lane, column) => {
        spawnEnemyAt(scene.combatRuntime(), { kind, lane, x: cfg.BOARD_X + (column + .5) * cfg.CELL_WIDTH,
          time: scene.battleTime, waveNumber: 1, waveWeight: 0, finalDamageReduction: 0 });
        return scene.enemies.at(-1);
      };
      spawn("shootingTriangle8", 0, 8).attackAt = 0;
      spawn("diamond3", 1, 8).attackAt = 0;
      spawn("shootingPentagon3", 2, 8).attackAt = 0;
      spawn("mortarTriangle3", 6, 8).attackAt = 0;
      spawn("pentagon3", 5, 8).attackAt = 0;
      spawn("chevronLeader", 6, 7).ionChargeMs = 11999;
      const slope = spawn("slopeTriangle", 3, 4);
      slope.x = cfg.BOARD_X + 3.5 * cfg.CELL_WIDTH + 38;
      spawn("triangle", 3, 4).x = slope.x + 10;
      spawn("parentheses", 4, 8);
      const angel = spawn("angelPentagon2", 4, 8);
      angel.skills.wings.sp = 15;
      const arrow = spawn("burrowArrow2", 0, 6); arrow.burrowAt = 0;
      spawn("triangle3", 0, 6);
      const heart = spawn("heart", 1, 6);
      heart.skills.lead = { sp: 5, spBuffer: 0, activeUntil: 0 };
      spawn("tilde", 2, 6);
      spawn("solarBomb", 2, 10);
      const e = enemySimulationRuntime(scene.combatRuntime());
      const originalLaser = e.presentation.laser;
      e.presentation = { ...e.presentation, laser: (...args) => { observed.laser = true; originalLaser(...args); } };
    }
    const tick = scenes => {
      for (const scene of scenes) scene.update(0, 1000 / 60);
      observed.passengers ||= displayed.enemies.some(e => e.parenthesisCargo?.length);
      observed.burrow ||= displayed.enemies.some(e => e.burrowed);
      observed.slope ||= displayed.enemies.some(e => e.highFlightTargetX !== undefined);
      observed.lead ||= displayed.enemies.some(e => enemyFamily(e.kind) === "tilde" && e.lane === 1);
      observed.wings ||= displayed.enemies.some(e => enemyFamily(e.kind) === "parentheses" && e.statusEffects.some(s => s.name === "flying"));
      observed.ion ||= displayed.enemyProjectiles.some(p => p.appearance === "ion");
      observed.hostile ||= displayed.enemyProjectiles.length > 0;
      observed.mortar ||= displayed.mortarProjectiles.length > 0;
    };
    for (let i = 0; i < 120; i++) {
      tick([displayed, silent]);
      check(displayed.battleChecksum() === silent.battleChecksum(), `Detached enemy state diverged at ${i}`);
    }
    const restored = start("EnemyRestored");
    restored.applyBattleSave(restoreBattleSnapshot(restored, captureBattleSnapshot(displayed.battleState())));
    detach(restored);
    for (let i = 120; i < 900; i++) {
      tick([displayed, silent, restored]);
      if (i % 30 === 0) check([silent, restored].every(s => s.battleChecksum() === displayed.battleChecksum()),
        `Enemy checkpoint diverged at ${i}`);
    }
    const checksum = displayed.battleChecksum();
    check([silent, restored].every(s => s.battleChecksum() === checksum), "Final continuation mismatch");
    check(Object.values(observed).every(Boolean), "Missing branch: " + JSON.stringify(observed));
    for (const scene of [displayed, silent, restored]) game.scene.stop(scene.sys.settings.key);
    return { tick: 900, checksum, observed, restored: true };
  });
  assert.deepEqual(errors, []);
  console.log("Actual enemy simulation with detached enemy/projectile/lifecycle display agrees", result);
} finally { await browser.close(); }
