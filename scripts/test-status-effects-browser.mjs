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
    const progress = await import("/src/progress.ts"), lifecycle = await import("/src/game/unitLifecycle.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { activeStatusSpeedMultiplier } = await import("/src/game/rules/statusEffectRules.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (value, message) => { if (!value) throw Error(message); };
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-BE-2", selectedCards: ["A"], seed: 92 });
      return game.scene.getScene("GameScene");
    };
    let scene = start(), boss = scene.boss;
    lifecycle.damageBoss(scene.unitLifecycleRuntime(), 1e9, "true");
    check(boss.hp === 1 && boss.criticalHpTriggered, "Critical lock did not activate");
    check(boss.statusEffects.some(effect => effect.name === "haste" && effect.speedMultiplier === 3 && effect.expiresAt === 60000), "Critical haste not an effect");
    check(boss.bossHasteUntil === 0, "Live code still relies on the legacy haste clock");
    const x = boss.x; scene.update(0, 1000 / 60);
    check(Math.abs(x - boss.x - boss.finalStats.speed * 3 / 60) < 1e-7, "Effect did not accelerate boss motion");
    check(scene.saveSurvivalBattle(), "Haste effect could not be saved");
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    const restored = restoreBattleSnapshot(scene, snapshot);
    check(activeStatusSpeedMultiplier(restored.boss, scene.battleTime) === 3, "Saved effect lost speed");
    restored.boss.body.destroy(); for (const enemy of restored.enemies) enemy.body.destroy();
    // Legacy active-boss saves must migrate without applying haste twice.
    boss.statusEffects = []; boss.bossHasteUntil = scene.battleTime + 5000;
    const legacy = restoreBattleSnapshot(scene, captureBattleSnapshot(scene.battleState()));
    check(legacy.boss.bossHasteUntil === 0 && activeStatusSpeedMultiplier(legacy.boss, scene.battleTime) === 3,
      "Legacy critical haste did not migrate");
    check(activeStatusSpeedMultiplier(legacy.boss, scene.battleTime + 5000) === 1, "Migrated haste failed to expire");
    legacy.boss.body.destroy(); for (const enemy of legacy.enemies) enemy.body.destroy();
    for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
    game.scene.start("EncyclopediaScene");
    game.scene.getScene("EncyclopediaScene").panel.openMechanic("haste"); game.loop.wake();
  });
  await mkdir("logs", { recursive: true });
  for (const width of [1440, 960]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 640 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `logs/mechanic-haste-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log("Haste effect, critical boss movement, save migration and mechanism UI passed.");
} finally { await browser.close(); }
