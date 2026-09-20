// Requires Vite; accepts --playwright=<module path> and --browser=<executable>.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const modulePath = option("playwright");
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
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
    const config = await import("/src/config.ts");
    const progress = await import("/src/progress.ts");
    const { spawnEnemyAt, advanceEnemies } = await import("/src/game/enemyRuntime.ts");
    const { applyEnemyPromotion } = await import("/src/game/enemyBehaviors.ts");
    const { applyStatusEffect } = await import("/src/game/statusEffects.ts");
    const { changeEnemyHealth, initializeEnemyHealthLinks } = await import("/src/game/enemyHealth.ts");
    const { drawEnemyHealthLinks } = await import("/src/render/enemyHealthLinks.ts");
    const { getEnemyDefinition } = await import("/src/registry/enemies.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await import("/src/survivalSaves.ts");
    const { removeEnemy } = await import("/src/game/unitLifecycle.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const start = (data = {}) => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "AE-3", seed: 123, selectedCards: ["B", "A", "u", "q"], ...data });
      return game.scene.getScene("GameScene");
    };
    let scene = start();
    const spawn = (kind, lane = 3, column = 8) => {
      spawnEnemyAt(scene.combatRuntime(), { kind, lane, x: config.BOARD_X + (column + .5) * config.CELL_WIDTH,
        time: scene.battleTime, waveNumber: 10, waveWeight: getEnemyDefinition(kind).weight, finalDamageReduction: 0 });
      return scene.enemies.at(-1);
    };
    const partner = spawn("circle2"), owner = spawn("equals", 3, 9);
    const pool = owner.healthPool;
    check(partner.healthPool === pool && pool.maxHp === 15000, "Spawn did not link");
    scene.waveTracker = { number: 10, totalWeight: 130, defeatedWeight: 0, spawnedAt: 0 };
    const before = pool.hp;
    scene.combatRuntime().damageEnemy(partner, 500, "physical");
    check(pool.hp === before - 400 && partner.hp / partner.maxHp === owner.hp / owner.maxHp, "Target defenses/shared HP");
    applyStatusEffect(owner, "invincible", 1000, 0);
    const unchanged = pool.hp;
    check(!scene.combatRuntime().damageEnemy(owner, 999, "true") && pool.hp === unchanged, "Invincibility did not block direct damage");
    scene.combatRuntime().damageEnemy(partner, 100000, "true");
    check(!owner.inPlay && !partner.inPlay && scene.enemiesDefeated === 2 && scene.waveTracker.defeatedWeight === 130, "Pool defeat accounting");
    check(scene.enemies.length === 3 && scene.enemies.every(e => e.kind === "circle" && !e.healthPool), "Circle split must occur exactly once");

    scene = start();
    const target = spawn("hexagon", 3, 9), source = spawn("equals2", 3, 8);
    changeEnemyHealth(source, -source.healthPool.maxHp / 2);
    applyEnemyPromotion(scene, target, "hexagon2", 0);
    check(source.healthPool.maxHp === source.maxHp + target.maxHp && source.hp / source.maxHp === .5, "Promotion capacity sync");
    const missed = spawn("triangle", 3, 7);
    initializeEnemyHealthLinks(source, scene.enemies);
    check(!missed.healthPool && source.healthPool.members.length === 2, "Missing slots must never refill");
    removeEnemy(scene.unitLifecycleRuntime(), target, false);
    check(!source.healthPool && source.hp / source.maxHp === .5, "Escape/removal must detach, not kill");

    scene = start({ levelId: "IF-1" });
    scene.spawnGeneratedTower("B", 3, 2, 2);
    scene.spawnGeneratedTower("B", 3, 4, 1);
    spawn("square", 2, 8); spawn("tilde3", 4, 9); spawn("equals2", 3, 9);
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards: ["B"], graph: snapshot });
    const run = deltas => {
      scene = start({ levelId: "IF-1" });
      scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
      scene.battlePaused = false;
      const linked = scene.enemies.find(e => e.kind === "equals2");
      check(linked.healthPool.members.length === 3 && linked.healthPool.members.every(e => e.healthPool === linked.healthPool), "Restored link identities");
      let i = 0;
      while (scene.simulation.tick < 120) scene.update(0, deltas[i++ % deltas.length]);
      check(scene.simulation.tick === 120, "Frame schedule overshot");
      return scene.battleChecksum();
    };
    const hash = run([1000 / 60]);
    check(run([1000 / 30]) === hash && run([1000 / 144]) === hash, "Shared health determinism after restore");

    scene = start();
    scene.spawnGeneratedTower("B", 3, 2, 1);
    const blocker = scene.spawnGeneratedTower("B", 3, 3, 3);
    scene.spawnGeneratedTower("B", 3, 4, 2);
    const melee = spawn("equals", 3, 3.4);
    scene.battleTime = 1000;
    const hp = blocker.hp;
    advanceEnemies(scene.combatRuntime(), 1000, 0);
    check(blocker.hp < hp && melee.hp < melee.maxHp, "Equals melee / B retaliation");
    removeEnemy(scene.unitLifecycleRuntime(), melee, false);
    for (const [kind, lane, column] of [["circle", 1, 9], ["tilde2", 2, 7], ["square", 4, 8], ["equals3", 3, 10]]) spawn(kind, lane, column);
    drawEnemyHealthLinks(scene.enemyHealthLinks, scene.enemies, 1000);
    check(scene.enemyHealthLinks.commandBuffer.length > 0, "Link graphics blank");
    scene.battlePaused = true;
    game.loop.start(game.step.bind(game));
    return { hash, poolDefeats: 2 };
  });
  await page.waitForTimeout(180);
  await page.screenshot({ path: "logs/ae3-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(180);
  await page.screenshot({ path: "logs/ae3-small.png" });
  assert.deepEqual(errors, []);
  console.log("AE-3 browser checks passed", result);
} finally { await browser.close(); }
