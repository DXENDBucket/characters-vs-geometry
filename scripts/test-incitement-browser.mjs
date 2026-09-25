import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const { unlockAllCards, completeAllLevels } = await import("/src/progress.ts");
    const { spawnEnemyAt, spawnSplitEnemies } = await import("/src/game/enemyRuntime.ts");
    const { updateEnemySkills } = await import("/src/game/enemySkills.ts");
    const { statusMultipliers } = await import("/src/game/statusEffects.ts");
    const { applyEnemyPromotion } = await import("/src/game/enemyBehaviors.ts");
    const { enemyMaximumHp } = await import("/src/game/enemyContainers.ts");
    const { collectParenthesisPassengers } = await import("/src/game/parenthesisEnemies.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await import("/src/game/validateBattleSave.ts");
    const { BOARD_X, CELL_WIDTH } = await import("/src/config.ts");
    const game = window.__testGame; game.loop.stop(); unlockAllCards(); completeAllLevels();
    const check = (value, message) => { if (!value) throw Error(message); };
    const start = levelId => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId, selectedCards: ["A"], seed: 92 });
      return game.scene.getScene("GameScene");
    };
    let scene = start("IF-1");
    const spawn = (kind, lane, column, runtime = scene.combatRuntime()) => {
      spawnEnemyAt(runtime, { kind, waveNumber: scene.wave, time: scene.battleTime, lane,
        x: BOARD_X + (column + .5) * CELL_WIDTH, waveWeight: 0, finalDamageReduction: 0 });
      return scene.enemies.at(-1);
    };
    scene.wave = 10;
    const old = spawn("circle", 0, 7); check(old.maxHp === 3000, "Flag itself must keep old HP");
    scene.spawnWave(0, 0);
    check(scene.wave === 11 && scene.enemies.at(-1).environmentHpMultiplier === 1.35, "Next wave must use new environment");
    check(old.maxHp === 3000, "Existing enemy changed HP");
    const newer = spawn("circle", 1, 7); check(Math.abs(newer.maxHp - 4050) < 1e-8, "New enemy missing HP bonus");
    newer.hp /= 2; applyEnemyPromotion(scene, newer, "circle2", 0);
    check(newer.environmentHpMultiplier === 1.35 && newer.hp / enemyMaximumHp(newer) === .5, "Promotion lost spawn multiplier");
    scene.wave = 21;
    const split = spawn("circle2", 2, 8);
    spawnSplitEnemies(scene.combatRuntime(), split, 0, 0);
    check(scene.enemies.slice(-3).every(enemy => enemy.environmentHpMultiplier === 1.7), "Splits lost environment");
    const carrier = spawn("parentheses", 6, 8), passenger = spawn("triangle", 6, 8);
    collectParenthesisPassengers(carrier, scene.enemies, 0);
    check(passenger.parenthesisCarrier === carrier && carrier.maxHp === (5000 + 1750) * 1.7, "Carrier double-counted environment");
    const caster = spawn("dollar", 3, 7), leader = spawn("heart", 3, 7);
    const target = spawn("triangle", 3, 6);
    updateEnemySkills({ scene, enemies: [caster, leader, target] }, 5, 5000);
    check(caster.skills.incitement.sp === 5 && !leader.statusEffects.length, "Caster SP or leader exclusion failed");
    check(statusMultipliers(target, 5000).attack === 1.3 && statusMultipliers(target, 5000).speed === 2, "Incitement missing buffs");
    scene.battleTime = 5000;
    const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateBattleSave(graph, scene.wave);
    const saved = restoreBattleSnapshot(scene, graph);
    const savedCaster = saved.enemies.find(enemy => enemy.kind === "dollar");
    check(savedCaster.environmentHpMultiplier === 1.7 && savedCaster.maxHp === 34000 && savedCaster.skills.incitement.sp === 5, "Save changed caster");
    const savedTarget = saved.enemies.find(enemy => enemy.kind === "triangle" && enemy.lane === 3);
    check(statusMultipliers(savedTarget, 5000).attack === 1.3, "Save lost Power amount");
    check(statusMultipliers(savedTarget, 20000).attack === 1, "Restored Power did not expire");
    for (const enemy of saved.enemies) { enemy.body.destroy(); for (const cargo of enemy.parenthesisCargo ?? []) cargo.body.destroy(); }
    scene = start("IF-BE-1");
    const bossHp = scene.boss.maxHp; scene.wave = 21;
    const summoned = spawn("square", 3, 8, scene.bossRuntime());
    check(summoned.maxHp === 20400 && scene.boss.maxHp === bossHp, "Boss environment affected wrong units");
    check(scene.saveSurvivalBattle(), "Boss-endless save rejected environment");
    scene = start("1-1"); scene.wave = 21;
    check(spawn("circle", 2, 8).maxHp === 3000, "Main story received endless scaling");
    scene = start("IF-1"); scene.wave = 21; scene.battlePaused = true;
    for (const [kind, lane] of [["dollar", 1], ["dollar2", 3], ["dollar3", 5]]) spawn(kind, lane, 7);
    scene.updateHud(); game.loop.wake();
  });
  await mkdir("logs", { recursive: true });
  for (const width of [1440, 960]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 640 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `logs/incitement-${width}.png` });
  }
  await page.evaluate(() => {
    const game = window.__testGame;
    for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
    game.scene.start("EncyclopediaScene");
    game.scene.getScene("EncyclopediaScene").panel.openEnemy("dollar3");
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/incitement-encyclopedia.png" });
  assert.deepEqual(errors, []);
  console.log("Incitement, environment spawning, split/carrier health, Boss exclusion, saves and UI passed.");
} finally { await browser.close(); }
