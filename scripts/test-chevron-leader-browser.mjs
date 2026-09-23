import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
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
    const c = await moduleFor("/src/config.ts"), progress = await moduleFor("/src/progress.ts");
    const { createEnemy } = await moduleFor("/src/game/enemyFactory.ts");
    const { advanceEnemies } = await moduleFor("/src/game/enemyRuntime.ts");
    const { createIonProjectile, createReflectedProjectile } = await moduleFor("/src/game/projectiles.ts");
    const { updateEnemyProjectiles } = await moduleFor("/src/game/projectileRuntime.ts");
    const { applyStatusEffect, removeStatusEffect } = await moduleFor("/src/game/statusEffects.ts");
    const { syncChevronVisual } = await moduleFor("/src/render/chevronLeader.ts");
    const { syncEnemyFacingVisual } = await moduleFor("/src/game/enemyBehaviors.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await moduleFor("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await moduleFor("/src/survivalSaves.ts");
    const { getRangedHighestAttackTarget } = await moduleFor("/src/game/targeting.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const close = (a, b) => Math.abs(a - b) < 1e-6;
    const selectedCards = ["A", "B", "O", "()", "[]", "V", "*"];
    let scene;
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-1", seed: 512, selectedCards });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000;
    };
    const spawn = (rank = 1, lane = 3, direction = -1, multiplier = 1) => {
      const enemy = createEnemy(scene, { kind: rank === 1 ? "chevronLeader" : `chevronLeader${rank}`, lane,
        x: c.BOARD_X + 10.5 * c.CELL_WIDTH, waveNumber: 1, waveWeight: 0, time: scene.battleTime,
        finalDamageReduction: 0, movementDirection: direction, environmentHpMultiplier: multiplier });
      scene.enemies.push(enemy); return enemy;
    };
    const advance = (seconds, step = .02) => {
      for (let i = 0; i < Math.round(seconds / step); i++) {
        scene.battleTime += step * 1000;
        advanceEnemies(scene.combatRuntime(), scene.battleTime, step);
      }
    };
    const place = (id, col = 5, lane = 3) => {
      scene.cardStatesById.get(id).readyAt = 0;
      check(scene.deployment.useCard(scene.getDefinition(id), lane, col) === "deployed", `Failed to place ${id}`);
      return scene.towers.find(t => t.type === id && t.column === col && t.lane === lane);
    };
    const hurt = (enemy, amount, type = "true") => scene.combatRuntime().damageEnemy(enemy, amount, type);
    start(); let enemy = spawn(); const originalX = enemy.x;
    advance(6); check(close(enemy.x, originalX - 90) && close(enemy.ionChargeMs, 6000), "Base speed or charging is wrong");
    applyStatusEffect(enemy, "frozen", 10000, scene.battleTime);
    advance(1); check(close(enemy.ionChargeMs, 6000), "Frozen enemy continued charging");
    removeStatusEffect(enemy, "frozen");
    applyStatusEffect(enemy, "highFlying", 10000, scene.battleTime);
    advance(1); check(close(enemy.ionChargeMs, 6000), "High-flying enemy continued charging");
    removeStatusEffect(enemy, "highFlying");
    advance(5.98); check(scene.enemyProjectiles.length === 0, "Ion cannon fired before full charge");
    advance(.02); let shot = scene.enemyProjectiles[0];
    check(scene.enemyProjectiles.length === 1 && shot.damage === 4500 && shot.damageType === "magic" && shot.vx === -430 &&
      close(shot.splashRadius, 2.4 * c.CELL_WIDTH), "Ion projectile panel mismatch");
    advance(12); check(scene.enemyProjectiles.length === 2, "Cannon failed to repeat");

    start(); enemy = spawn(2, 3, 1, 1.7);
    enemy.ionChargeMs = 11000; syncEnemyFacingVisual(enemy);
    check(enemy.shape.getData("ionCharge").x === 12, "Reverse-facing charge stayed on the wrong side");
    shot = createIonProjectile(scene, enemy, 0); check(shot.vx === 430, "Reverse shot fired left"); shot.body.destroy();
    const hp = enemy.hp; hurt(enemy, hp / 2);
    check(enemy.chevronAssault && close(enemy.hp, hp / 2) && close(enemy.maxHp, 48000 * 1.7), "Half-HP transformation changed HP or ignored scaling");
    check(enemy.baseStats.armor === 260 && enemy.baseStats.speed === 30 && enemy.damageType === "magic" &&
      enemy.maceFacingDirection === 1 && enemy.ionChargeMs === 0, "Assault panel, facing or cancellation wrong");
    hurt(enemy, 1000, "physical"); check(close(enemy.hp, hp / 2 - 740), "New armor did not apply immediately");
    enemy.hp = enemy.maxHp; advance(.1);
    check(enemy.chevronAssault && enemy.maceVelocity > 0 && scene.enemyProjectiles.length === 0, "Healing reverted phase or assault shot cannon");

    start(); const blocker = place("B"); enemy = spawn();
    enemy.x = blocker.x + 38; enemy.body.setX(enemy.x); advance(1);
    check(blocker.hp === blocker.maxHp, "Cannon form dealt ordinary melee damage");
    hurt(enemy, 16000); enemy.maceVelocity = -30;
    advance(.02); check(close(blocker.hp, blocker.maxHp - 1350) && enemy.maceVelocity > 0,
      "Assault collision did not deal speed-scaled magic damage and rebound");

    start(); const inner = place("A"), guard = place("[]"), neighbor = place("B", 5, 4), outside = place("B", 5, 0);
    enemy = spawn(); shot = createIonProjectile(scene, enemy, 0);
    shot.x = inner.x; shot.y = inner.y; scene.enemyProjectiles.push(shot);
    updateEnemyProjectiles(scene.projectileRuntime(), 0);
    check(!guard.inPlay && inner.inPlay && inner.hp === inner.maxHp, "Splash damaged a wrapped cell twice or spilled through");
    check(close(neighbor.hp, neighbor.maxHp - 4500 * (1 - c.CELL_HEIGHT / (2.4 * c.CELL_WIDTH))) && outside.hp === outside.maxHp,
      "Splash falloff or radius incorrect");
    check(scene.enemyProjectiles.length === 0, "Detonated projectile remained active");
    const reflected = createReflectedProjectile(scene, createIonProjectile(scene, enemy, 0));
    check(reflected.type === "shell" && reflected.damage === 4500 && reflected.splashRadius === 2.4 * c.CELL_WIDTH,
      "Reflection lost the blast"); reflected.body.destroy();

    start(); const v = place("V", 2); enemy = spawn();
    const ram = createEnemy(scene, { kind: "triangleRam", lane: 3, x: enemy.x - 100, waveNumber: 1, waveWeight: 0, time: 0, finalDamageReduction: 0 });
    scene.enemies.push(ram);
    check(getRangedHighestAttackTarget(v, scene.getDefinition("V"), scene.enemies, 0) === enemy, "Cannon not classified as ranged");
    hurt(enemy, 16000);
    check(getRangedHighestAttackTarget(v, scene.getDefinition("V"), scene.enemies, 0) === ram, "Assault still classified as ranged");

    start(); enemy = spawn(3, 2); enemy.ionChargeMs = 8100;
    const assault = spawn(1, 4); hurt(assault, 16000); assault.maceVelocity = -47;
    scene.enemyProjectiles.push(createIonProjectile(scene, enemy, 0));
    const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards, graph });
    start(); scene.applyBattleSave(restoreBattleSnapshot(scene, graph));
    check(scene.enemies[0].ionChargeMs === 8100 && scene.enemies[1].chevronAssault && scene.enemies[1].maceVelocity === -47,
      "Save lost charge or assault motion");
    check(scene.enemies[1].shape.getData("chevronFrame").getData("assault") === true && scene.enemyProjectiles[0].appearance === "ion",
      "Restored visuals wrong");
    const replay = delta => {
      start(); scene.applyBattleSave(restoreBattleSnapshot(scene, graph)); scene.battlePaused = false;
      while (scene.simulation.tick < 120) scene.update(0, delta);
      return scene.battleChecksum();
    };
    check(replay(1000 / 60) === replay(1000 / 144), "Chevron simulation depends on render frame rate");

    start();
    for (const [index, charge] of [1500, 6000, 11200].entries()) {
      const e = spawn(index + 1, index * 2 + 1); e.ionChargeMs = charge; syncChevronVisual(e);
    }
    const finalForm = spawn(3, 3); finalForm.x -= c.CELL_WIDTH * 3; finalForm.body.setX(finalForm.x); hurt(finalForm, 32000);
    place("O", 6, 1); place("[]", 6, 3); place("B", 6, 5);
    scene.battlePaused = true; scene.updateHud(); scene.updateCards();
    game.loop.start(game.step.bind(game));
    return { ranks: [32000, 48000, 64000], ionDamage: 4500, collisionDamage: 1350 };
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "logs/chevron-leader-desktop.png" });
  await page.evaluate(async () => {
    const moduleFor = path => import(performance.getEntriesByType("resource").map(r => r.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const { createIonProjectile } = await moduleFor("/src/game/projectiles.ts");
    const { updateEnemyProjectiles } = await moduleFor("/src/game/projectileRuntime.ts");
    const scene = window.__testGame.scene.getScene("GameScene");
    const target = scene.towers.find(tower => tower.type === "O");
    const before = new Set(scene.tweens.getTweens());
    const shot = createIonProjectile(scene, scene.enemies[0], scene.battleTime);
    shot.x = target.x; shot.y = target.y;
    scene.enemyProjectiles.push(shot);
    let cues = 0; scene.events.once("ion-impact", () => cues++);
    updateEnemyProjectiles(scene.projectileRuntime(), 0);
    const impactTweens = scene.tweens.getTweens().filter(tween => !before.has(tween));
    if (cues !== 1 || impactTweens.length !== 4) throw Error("Ion hit lost its dedicated audio/visual feedback");
    for (const tween of impactTweens) {
      tween.update(0); tween.update(0); tween.update(60); tween.pause();
      if (!tween.targets.every(target => target.visible && target.alpha > 0)) throw Error("Impact animation is blank");
    }
    window.__impactTweens = impactTweens;
  });
  await page.waitForTimeout(60);
  await page.screenshot({ path: "logs/ion-impact-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(200);
  await page.screenshot({ path: "logs/chevron-leader-small.png" });
  await page.screenshot({ path: "logs/ion-impact-small.png" });
  await page.evaluate(() => { for (const tween of window.__impactTweens) tween.resume(); });
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__impactTweens.every(tween => tween.isDestroyed())), true);
  assert.deepEqual(errors, []);
  console.log("Chevron leader browser checks passed", result);
} finally { await browser.close(); }
