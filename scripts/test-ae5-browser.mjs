// Requires Vite; accepts --playwright=<module path> and --browser=<executable>.
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
  const result = await page.evaluate(async () => {
    const progress = await import("/src/progress.ts");
    const c = await import("/src/config.ts");
    const { createEnemy } = await import("/src/game/enemyFactory.ts");
    const { collectParenthesisPassengers: collect } = await import("/src/game/parenthesisEnemies.ts");
    const { syncPassengerPositions } = await import("/src/game/enemyContainers.ts");
    const { damageEnemy } = await import("/src/game/unitLifecycle.ts");
    const { enemyAttackDamage } = await import("/src/game/combatStats.ts");
    const { initializeEnemyHealthLinks } = await import("/src/game/enemyHealth.ts");
    const { getBlockingTowerFromOccupied } = await import("/src/game/targeting.ts");
    const { getCardDefinition } = await import("/src/registry/cards.ts");
    const { hasStatusEffect, applyStatusEffect } = await import("/src/game/statusEffects.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await import("/src/survivalSaves.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (value, message) => { if (!value) throw Error(message); };
    let scene;
    const start = (levelId = "AE-5") => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId, seed: 417, selectedCards: ["A", "B", "q", "w"] });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000; return scene;
    };
    const spawn = (kind, x = c.BOARD_X + 700, lane = 3) => {
      const enemy = createEnemy(scene, { kind, x, lane, time: scene.battleTime, waveNumber: 1, waveWeight: 1, finalDamageReduction: 0 });
      scene.enemies.push(enemy); return enemy;
    };
    const advance = (seconds = .1) => { scene.battleTime += seconds * 1000; scene.updateEnemies(scene.battleTime, seconds); };

    start();
    const host = spawn("parentheses"), triangle = spawn("triangle", host.x + 5), square = spawn("square", host.x + 8), extra = spawn("circle", host.x + 9);
    host.hp /= 2; collect(host, scene.enemies, 0);
    check(host.parenthesisCargo.length === 2 && host.parenthesisCargo[0] === triangle && extra.inPlay, "Capacity or boarding order wrong");
    check(host.maxHp === 5000 + .35 * (triangle.maxHp + square.maxHp) && host.hp === host.maxHp / 2, "Boarding did not preserve HP ratio");
    check(enemyAttackDamage(host, 0) === 600 + .35 * (triangle.damage + square.damage), "Passenger attack bonus wrong");
    check(triangle.x > square.x && triangle.body.visible && !triangle.inPlay && !scene.enemies.includes(triangle), "Passenger seat/protection wrong");
    const before = triangle.hp;
    check(!damageEnemy(scene.unitLifecycleRuntime(), triangle, 1000, "true") && triangle.hp === before, "Cargo accepted damage");
    const seats = host.parenthesisCargo.map(enemy => ({ enemy, x: enemy.x, y: enemy.y }));
    damageEnemy(scene.unitLifecycleRuntime(), host, 1e9, "true");
    check(!host.inPlay && seats.every(({ enemy, x, y }) => enemy.inPlay && !enemy.parenthesisCarrier && enemy.x === x && enemy.y === y && scene.enemies.includes(enemy)), "Destruction lost or relocated passengers");

    start();
    const protectedHost = spawn("parentheses"), arrow = spawn("burrowArrow", protectedHost.x);
    advance(); check(protectedHost.inPlay && !arrow.burrowCargo.length, "Burrow arrow loaded Parentheses");
    const q = scene.spawnGeneratedTower("q", 3, 5, 1);
    protectedHost.x = q.x + 30; protectedHost.body.x = protectedHost.x;
    const qHp = q.hp;
    check(getBlockingTowerFromOccupied(scene.occupied, protectedHost) === q, "q setup did not block carrier");
    scene.storage.storeBlockedEnemies(q, getCardDefinition("q"));
    check(protectedHost.inPlay && scene.storage.count === 0 && q.hp === qHp, "q stored Parentheses or charged self damage");
    const equals = spawn("equals", protectedHost.x);
    initializeEnemyHealthLinks(equals, scene.enemies);
    check(!protectedHost.healthPool && !equals.healthPool, "Equals linked Parentheses");
    collect(protectedHost, scene.enemies, scene.battleTime);
    check(!protectedHost.parenthesisCargo.length, "Parentheses captured Equals or leader");

    start();
    const sky = spawn("parentheses3"), angel = spawn("angelPentagon", sky.x), ram = spawn("triangleRam3", sky.x), gun = spawn("shootingTriangle", sky.x);
    collect(sky, scene.enemies, 0); angel.skills.wings = { sp: 15, spBuffer: 0, activeUntil: 0 };
    ram.spawnX = ram.x + 7 * c.CELL_WIDTH; gun.attackAt = 0;
    advance();
    check(hasStatusEffect(sky, "flying", scene.battleTime) && sky.body.y < sky.y, "Passenger wings failed to lift carrier");
    check(sky.finalStats.speed >= ram.baseStats.speed * 7.99, "Passenger ram acceleration/flight did not transfer");
    check(sky.parenthesisCargo.every(p => p.body.y === sky.body.y), "Passenger flight display desynchronized");
    scene.actionQueue.update(scene.battleTime, action => scene.executeBattleAction(action));
    check(scene.enemyProjectiles.length > 0, "Ranged passenger could not shoot");
    const oldX = sky.x; applyStatusEffect(sky, "frozen", 2000, scene.battleTime); advance();
    check(sky.x === oldX, "Frozen host moved using passenger speed");

    start();
    const blocker = scene.spawnGeneratedTower("B", 3, 5, 1), melee = spawn("parentheses", blocker.x + 45), passenger = spawn("triangle", melee.x);
    collect(melee, scene.enemies, 0); melee.attackAt = 0; passenger.attackAt = 0;
    const attacks = []; const runtime = { ...scene.combatRuntime() };
    runtime.damageTower = (_tower, amount) => attacks.push(amount);
    const { advanceEnemies } = await import("/src/game/enemyRuntime.ts");
    advanceEnemies(runtime, 100, .1);
    check(attacks.length === 1 && attacks[0] === 810, "Blocked passenger dealt extra melee damage");

    start();
    const swept = spawn("parentheses"), fast = spawn("triangle3", swept.x + 100);
    fast.baseStats.speed = 3000;
    advance(.1); check(fast.parenthesisCarrier === swept, "Fast contact passed through carrier");

    start("IF-1");
    const saved = spawn("parentheses3"), savedAngel = spawn("angelPentagon", saved.x); spawn("hexMace2", saved.x); spawn("shootingTriangle", saved.x);
    collect(saved, scene.enemies, 0); savedAngel.skills.wings = { sp: 15, spBuffer: 0, activeUntil: 0 };
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards: ["A", "B", "q", "w"], graph: snapshot });
    const run = step => {
      start("IF-1"); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
      const restored = scene.enemies.find(e => e.kind === "parentheses3");
      check(restored.parenthesisCargo.length === 3 && restored.parenthesisCargo.every(p => p.parenthesisCarrier === restored && p.body.visible), "Save lost passenger links or visuals");
      scene.battlePaused = false;
      while (scene.simulation.tick < 120) scene.update(0, step);
      return scene.battleChecksum();
    };
    const hash = run(1000 / 60); check(run(1000 / 144) === hash, "Passenger simulation differs with frame rate");
    const cargoBodies = scene.enemies.flatMap(e => e.parenthesisCargo ?? []).map(e => e.body);
    scene.clearEnemiesForBossPhaseTransition();
    check(cargoBodies.every(body => !body.scene), "Phase cleanup leaked passenger bodies");

    start();
    for (let rank = 1; rank <= 3; rank++) {
      const visual = spawn(rank === 1 ? "parentheses" : `parentheses${rank}`, c.BOARD_X + 600, rank * 2 - 1);
      const kinds = ["triangle", "angelPentagon", "triangleRam", "hexMace"];
      for (let index = 0; index < rank + 1; index++) spawn(kinds[index], visual.x, visual.lane);
      collect(visual, scene.enemies, 0); syncPassengerPositions(visual);
    }
    scene.battlePaused = true; scene.updateHud(); game.loop.start(game.step.bind(game));
    return { hash };
  });
  await page.waitForTimeout(150); await page.screenshot({ path: "logs/ae5-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/ae5-small.png" });
  assert.deepEqual(errors, []); console.log("AE-5 browser checks passed", result);
} finally { await browser.close(); }
