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
    const moduleFor = path => import(performance.getEntriesByType("resource").map(r => r.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const progress = await moduleFor("/src/progress.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await moduleFor("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await moduleFor("/src/survivalSaves.ts");
    const { createTowerProjectile } = await moduleFor("/src/game/projectiles.ts");
    const { projectileDamageBudget } = await moduleFor("/src/game/projectileIntegrity.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (ok, text) => { if (!ok) throw Error(text); };
    const selectedCards = ["A", "*", "=", "O", "()", "u"];
    let scene;
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-1", seed: 417, selectedCards });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000;
    };
    const place = (type, col, lane = 3) => scene.spawnGeneratedTower(type, lane, col, 1);
    start();
    const source = place("A", 3), shield = place("*", 4), victim = place("O", 5);
    const shell = place("()", 5);
    scene.edgeTowers.push({ type: "=", axis: "horizontal", column: 3, lane: 3, level: 1, mode: "=" });
    scene.numbers.sync();
    const shot = createTowerProjectile(scene, { type: "bolt", x: source.x + 26, y: source.y, lane: 3,
      speed: 500, damage: 300, hitCount: 10, damageType: "physical", splashRadius: 0,
      angleDegrees: 0, maxX: source.x + 326, sourceTower: source });
    check(scene.numbers.capture(shot), "Pipeline did not deliver ammunition to *");
    scene.combatRuntime().damageTower(victim, 1000, "magic");
    check(shell.hp === 3000 && victim.hp === 3000, "Shield failed to protect parentheses");
    check(projectileDamageBudget(shield.projectileNode.input[0]) === 1200, "Wrong post-shell-MR reserve cost");
    scene.combatRuntime().damageTower(victim, 1000, "magic");
    check(shell.hp === 2800 && victim.hp === 3000, "Partial shielding or shell overflow is wrong");
    check(shield.projectileNode.input.length === 0, "Exhausted payload remained");
    scene.combatRuntime().damageTower(victim, 100, "true");
    check(shell.hp === 2700, "Shield blocked true damage");
    const second = createTowerProjectile(scene, { type: "bolt", x: source.x, y: source.y, lane: 3,
      speed: 500, damage: 300, hitCount: 10, damageType: "physical", splashRadius: 0,
      angleDegrees: 0, maxX: source.x + 326, sourceTower: source });
    check(scene.numbers.capture(second), "Refill failed");
    scene.combatRuntime().damageTower(shield, 100, "magic");
    check(shield.hp === 1200, "Shield cannot protect itself");
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1,
      difficulty: scene.difficulty, unlimitedFirepower: false, selectedCards, graph: snapshot });
    start(); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
    const restored = scene.towers.find(t => t.type === "*");
    const restoredTarget = scene.towers.find(t => t.type === "O");
    check(projectileDamageBudget(restored.projectileNode.input[0]) === 2700, "Restore lost reserve damage");
    scene.combatRuntime().damageTower(restoredTarget, 500, "magic");
    check(projectileDamageBudget(restored.projectileNode.input[0]) === 1800, "Restored shield did not protect shell");
    check(restored.levelText.text === "1/128", "Inventory text missing");
    // A shared health network takes one protected hit, not one per member.
    const link = place("u", 5, 2), ally = place("B", 6, 2);
    const before = ally.healthPool.hp;
    scene.combatRuntime().damageTower(ally, 100, "magic");
    check(ally.healthPool === link.healthPool && ally.healthPool.hp === before, "Shared HP shield resolution failed");
    check(projectileDamageBudget(restored.projectileNode.input[0]) === 1500, "Shared HP consumed reserve more than once");
    scene.battlePaused = true; scene.updateHud(); scene.updateCards();
    window.__shieldScene = scene;
    game.loop.start(game.step.bind(game));
    return { storedDamage: 1500, shieldHp: restored.hp, shellHp: scene.towers.find(t => t.type === "()").hp };
  });
  await page.waitForTimeout(650);
  for (const [name, width, height] of [["desktop", 1440, 900], ["small", 800, 600]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(200);
    await page.evaluate(() => {
      const scene = window.__shieldScene, target = scene.towers.find(t => t.type === "O");
      scene.combatRuntime().damageTower(target, 10, "magic");
    });
    await page.screenshot({ path: `logs/magic-shield-${name}.png` });
  }
  assert.deepEqual(errors, []);
  console.log("Magic shield browser checks passed", result);
} finally { await browser.close(); }
