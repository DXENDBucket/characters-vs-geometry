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
    const { GameScene } = await mod("/src/scenes/GameScene.ts"), progress = await mod("/src/progress.ts");
    const { NO_BATTLE_ENCOUNTER_PRESENTATION } = await mod("/src/game/battleEncounter.ts");
    const { NO_BATTLEFIELD_CELL_PRESENTATION } = await mod("/src/game/battlefieldCells.ts");
    const { NO_STORAGE_PRESENTATION } = await mod("/src/game/towerStorageRules.ts");
    const { NO_NULLIFICATION_PRESENTATION } = await mod("/src/game/towerNullificationRules.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { damageBoss } = await mod("/src/game/unitLifecycle.ts");
    const { getCardDefinition } = await mod("/src/registry/cardDefinitions.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { COLUMNS } = await mod("/src/config.ts");
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const detach = scene => {
      scene.encounter.presentation = NO_BATTLE_ENCOUNTER_PRESENTATION;
      scene.battleCells.presentation = NO_BATTLEFIELD_CELL_PRESENTATION;
      scene.storage.presentation = NO_STORAGE_PRESENTATION;
      scene.nullification.presentation = NO_NULLIFICATION_PRESENTATION;
    };
    const results = [];
    for (const levelId of ["5-10", "IF-BE-3", "IF-BE-4", "AE-10", "5-9"]) {
      const start = role => {
        const key = `${role}:${levelId}`; game.scene.add(key, new GameScene(key), false);
        game.scene.start(key, { levelId, seed: 326, selectedCards: ["A", "B", "q", "[]"] });
        return game.scene.getScene(key);
      };
      const displayed = start("EncounterDisplayed"), silent = start("EncounterSilent"), scenes = [displayed, silent]; detach(silent);
      for (const scene of scenes) {
        scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
        const q = scene.spawnGeneratedTower("q", 0, 2, 1);
        spawnEnemyAt(scene.combatRuntime(), { kind: "triangle", lane: 0, x: q.x,
          time: 0, waveNumber: 1, waveWeight: 0, finalDamageReduction: 0 });
        scene.storage.storeBlockedEnemies(q, getCardDefinition("q")); check(scene.storage.count === 1, "q did not capture");
        scene.spawnGeneratedTower("B", 6, COLUMNS - 1, 1);
        scene.spawnGeneratedTower("[]", 6, COLUMNS - 1, 1);
      }
      const seen = { stored: true, nul: false, phase: 0, rank: displayed.boss?.rank ?? 0, sealed: false };
      for (let tick = 0; tick < 1000; tick++) {
        if (tick === 60) {
          const restored = start("EncounterRestored");
          restored.applyBattleSave(restoreBattleSnapshot(restored, captureBattleSnapshot(displayed.battleState())));
          detach(restored); scenes.push(restored);
        }
        for (const scene of scenes) {
          if (levelId === "5-10" && [120, 240, 360, 480].includes(tick)) {
            scene.boss.invincibleUntil = 0; damageBoss(scene.unitLifecycleRuntime(), 1e12, "true");
          }
          if (levelId.startsWith("IF-BE") && tick === 120) {
            scene.boss.invincibleUntil = 0; damageBoss(scene.unitLifecycleRuntime(), 1e12, "true");
          }
          if (levelId === "AE-10" && tick === 90) {
            scene.boss.hp = scene.boss.maxHp * .49; scene.boss.skills.deleteFormat.sp = 75;
          }
          if (levelId === "5-9" && tick === 120) {
            scene.wave = 4; scene.world.applyWaveStartMechanics(column => scene.sealColumn(column));
          }
          scene.update(0, 1000 / 60);
        }
        seen.nul ||= !!displayed.nullification.snapshot(); seen.phase = Math.max(seen.phase, displayed.bossPhaseIndex);
        seen.rank = Math.max(seen.rank, displayed.boss?.rank ?? 0); seen.sealed ||= displayed.sealedCells.size > 0;
        if (tick % 30 === 0) for (const scene of scenes.slice(1)) {
          check(scene.battleChecksum() === displayed.battleChecksum(), `${levelId} ${scene.sys.settings.key} diverged at ${tick}`);
        }
      }
      if (levelId === "5-10") check(seen.phase === 3 && displayed.storage.count === 0, "Phase cleanup missing");
      if (levelId.startsWith("IF-BE")) check(seen.rank === 2, "Boss succession missing");
      if (levelId === "AE-10") check(seen.nul && !displayed.nullification.snapshot() && displayed.storage.count === 0, "NUL/storage recovery missing");
      if (levelId === "5-9") check(seen.sealed, "Column seal missing");
      const hash = displayed.battleChecksum(); check(scenes.every(s => s.battleChecksum() === hash), "Final mismatch");
      results.push({ levelId, hash, ticks: 1000, seen });
      for (const scene of scenes) { game.scene.stop(scene.sys.settings.key); game.scene.remove(scene.sys.settings.key); }
    }
    return results;
  });
  assert.deepEqual(errors, []);
  console.log("Encounter, cells, storage and NUL agree without presentation and after restore", JSON.stringify(result, null, 2));
} finally { await browser.close(); }
