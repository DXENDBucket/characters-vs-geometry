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
  const results = await page.evaluate(async () => {
    const mod = path => import(performance.getEntriesByType("resource").map(e => e.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const { GameScene } = await mod("/src/scenes/GameScene.ts"), progress = await mod("/src/progress.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await mod("/src/game/validateBattleSave.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { applyEnemyPromotion } = await mod("/src/game/enemyBehaviors.ts");
    const { readSurvivalSave } = await mod("/src/survivalSaves.ts");
    const cfg = await mod("/src/config.ts"), game = window.__testGame;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.resetProgress();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    let serial = 0;
    const start = options => {
      const key = `Lifecycle${serial++}`;
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options); return game.scene.getScene(key);
    };
    const stop = scene => { game.scene.stop(scene.sys.settings.key); game.scene.remove(scene.sys.settings.key); };
    const graph = scene => JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    const checkpoint = scene => {
      scene.session.startRecordingFromCheckpoint(graph(scene), scene.selectedCardIds);
      scene.resetCommandAuthority();
    };
    const spawn = (scene, kind, lane = 3, x = cfg.BOARD_X + 800) => {
      spawnEnemyAt(scene.combatRuntime(), { kind, lane, x, time: scene.battleTime, waveNumber: scene.wave,
        waveWeight: 0, finalDamageReduction: 0 });
      return scene.enemies.at(-1);
    };
    const freezeCheck = scene => {
      const hash = scene.battleChecksum(), tick = scene.simulation.tick, result = scene.world.result;
      const count = scene.exportReplay().commands.length;
      scene.endLevel(); scene.endGame();
      check(scene.world.result === result, "Terminal outcome changed");
      for (let i = 0; i < 4; i++) { scene.update(0, 10000); scene.world.step(scene.worldSystems); }
      check(scene.submitPlayerControl("local", { type: "debugMode", enabled: true }) === "unavailable", "Ended control accepted");
      check(scene.submitPlayerOperation("local", { type: "deploy", card: "A", cell: { lane: 0, column: 0 }, expected: null }) === "unavailable", "Ended deployment accepted");
      check(scene.exportReplay().commands.length === count && scene.simulation.tick === tick && scene.battleChecksum() === hash,
        "Ended battle advanced, recorded input or lost pending actions");
      check(scene.overlay.container.visible, "Restored result is invisible");
    };
    const verify = scene => {
      const data = graph(scene), hash = scene.battleChecksum(), result = scene.world.result;
      const replay = scene.exportReplay(), stored = JSON.stringify(localStorage);
      validateBattleSave(data, scene.wave, scene.levelConfig.bossKind);
      freezeCheck(scene);
      for (const checkpointOnly of [false, true]) for (const delta of [1000 / 30, 1000 / 144]) {
        const played = start({ replay: checkpointOnly ? { ...replay, checkpoint: data, commands: [] } : replay });
        played.update(0, 0);
        for (let i = 0; !played.gameOver && i < 2000; i++) played.update(0, delta);
        check(played.gameOver && played.battleChecksum() === hash, `${scene.levelId}: terminal replay differs`);
        check(JSON.stringify(played.world.result) === JSON.stringify(result), "Replay lost authoritative result");
        freezeCheck(played); stop(played);
      }
      const restored = start({ levelId: scene.levelId, seed: 92, selectedCards: [...scene.selectedCardIds] });
      if (restored.boss) { restored.boss.body.destroy(); restored.boss = null; }
      restored.applyBattleSave(restoreBattleSnapshot(restored, data));
      check(restored.gameOver && restored.battleChecksum() === hash,
        `${scene.levelId}: finished snapshot changed: ${restored.gameOver}, ${restored.battleChecksum()} / ${hash}`);
      freezeCheck(restored); stop(restored);
      check(JSON.stringify(localStorage) === stored, "Restoring/replaying terminal result wrote profile or deleted a save");
      return { levelId: scene.levelId, outcome: result.outcome, flawless: result.flawless, hash, tick: scene.simulation.tick };
    };
    const results = [];
    // Use the real wave-completion path, beginning at a known final-wave checkpoint.
    const clear = start({ levelId: "1-3", seed: 92, selectedCards: ["A", "B", "X"] });
    clear.wave = clear.levelConfig.totalWaves; checkpoint(clear);
    clear.update(0, 1000 / 60);
    check(clear.gameOver && clear.world.result.flawless, "Clean completion did not earn flawless result");
    check(progress.isLevelCompleted("1-3") && progress.isCardUnlocked("I"), "Normal completion lost unlock rewards");
    check(progress.bestFlawlessDifficulty("1-3") === clear.difficulty, "Flawless result was not persisted");
    const details = clear.overlay.details.length;
    check(details > 0, "Unlock introduction missing"); clear.endLevel();
    check(clear.overlay.details.length === details, "Duplicate finish replaced unlock introduction");
    const importedResult = graph(clear), importedCards = [...clear.selectedCardIds];
    results.push(verify(clear)); stop(clear);
    progress.resetProgress();
    const beforeImport = JSON.stringify(localStorage), imported = start({ levelId: "1-3", selectedCards: importedCards });
    imported.applyBattleSave(restoreBattleSnapshot(imported, importedResult));
    imported.endLevel();
    check(!progress.isLevelCompleted("1-3") && !progress.isCardUnlocked("I") && JSON.stringify(localStorage) === beforeImport,
      "An imported finished result granted rewards to a fresh profile");
    check(!imported.overlay.subtitle.visible && imported.overlay.details.length === 0, "Restore advertised new rewards");
    stop(imported);

    // A base breach and normal wave completion are both possible in the same tick. Loss must stay loss.
    const loss = start({ levelId: "1-4", seed: 92, selectedCards: ["A"] });
    loss.baseIntegrity = 1; loss.wave = loss.levelConfig.totalWaves;
    spawn(loss, "circle", 3, cfg.BOARD_X - 35);
    loss.submitPlayerOperation("local", { type: "deploy", card: "A", cell: { lane: 0, column: 2 }, expected: null });
    const tower = loss.towers[0];
    loss.scheduleBattleAction(1000, { type: "volley", tower, hitCount: 2, copyRevision: tower.copyRevision });
    checkpoint(loss); loss.update(0, 1000 / 60);
    check(loss.world.result?.outcome === "defeat" && loss.baseIntegrity === 0, "Lethal breach was overwritten by completion");
    check(!progress.isLevelCompleted("1-4") && loss.actionQueue.snapshot().length > 0, "Defeat awarded a clear or dropped queued actions");
    results.push(verify(loss)); stop(loss);

    // Boss breach ends the battle with remaining base integrity, which cannot be inferred from HP alone.
    const bossLoss = start({ levelId: "1-10", seed: 92 });
    bossLoss.boss.x = cfg.BOARD_X - 100; checkpoint(bossLoss); bossLoss.update(0, 1000 / 60);
    check(bossLoss.gameOver && bossLoss.baseIntegrity === cfg.BASE_INTEGRITY, "Boss breach fixture did not execute");
    results.push(verify(bossLoss)); stop(bossLoss);

    // A real debug damage command defeats the final Boss; debug use must survive replay and checkpoint restore.
    const bossClear = start({ levelId: "1-10", seed: 92 });
    bossClear.boss.hp = 1; checkpoint(bossClear);
    const mode = bossClear.submitPlayerControl("local", { type: "debugMode", enabled: true });
    const hit = bossClear.submitPlayerControl("local", { type: "debugDamage", point: { x: bossClear.boss.x, y: bossClear.boss.y }, mode: "super" });
    check(bossClear.gameOver && !bossClear.world.result.flawless && !bossClear.boss,
      `Boss victory/debug fixture did not execute: ${mode}/${hit}, ${bossClear.boss?.kind} ${bossClear.boss?.hp}`);
    check(progress.bestFlawlessDifficulty("1-10") === undefined, "Debug clear counted as flawless");
    results.push(verify(bossClear)); stop(bossClear);

    // Final-phase snapshots retain a dead Boss via a deferred summon and its pending copy warnings.
    const finale = start({ levelId: "5-10", seed: 92 });
    finale.bossPhaseIndex = 3; finale.world.resetBossForPhase(finale.boss);
    finale.applyBossPhaseStats(finale.boss); finale.applyBossPhaseSkillState(finale.boss);
    finale.boss.hp = 1; finale.boss.criticalHpTriggered = true;
    finale.update(0, 1000 / 60);
    check(finale.boss.pendingCopies.length === 3, "Final-phase copy warning fixture missing");
    finale.scheduleBattleAction(1000, { type: "bossReinforcements", boss: finale.boss, kind: "slopeTriangle3", lanes: [3] });
    validateBattleSave(graph(finale), finale.wave, finale.levelConfig.bossKind);
    checkpoint(finale);
    finale.submitPlayerControl("local", { type: "debugMode", enabled: true });
    finale.submitPlayerControl("local", { type: "debugDamage", point: { x: finale.boss.x, y: finale.boss.y }, mode: "super" });
    check(finale.gameOver && !finale.boss && finale.actionQueue.snapshot().length > 0, "Final-phase kill fixture failed");
    results.push(verify(finale)); stop(finale);

    // Read-only live battles still use the actual factories, promotion, wave records and Boss handlers.
    const keeper = start({ levelId: "IF-1", seed: 92 });
    check(keeper.saveSurvivalBattle(), "Could not establish existing survival save"); stop(keeper);
    const persistent = JSON.stringify(localStorage);
    const remote = start({ levelId: "IF-1", seed: 92, persistProgress: false });
    const enemy = spawn(remote, "heart3"); applyEnemyPromotion(remote, enemy, "heart4", remote.battleTime);
    remote.worldSystems.completedWaves(77); remote.saveSurvivalBattle(); remote.endGame(); remote.endLevel();
    check(readSurvivalSave("IF-1") && JSON.stringify(localStorage) === persistent, "Read-only live battle changed profile/save");
    stop(remote);
    const remoteBoss = start({ levelId: "IF-BE-1", seed: 92, persistProgress: false });
    remoteBoss.handleBossDefeated(remoteBoss.boss); remoteBoss.endGame(); stop(remoteBoss);
    check(JSON.stringify(localStorage) === persistent, "Read-only Boss progression wrote local records");
    const liveLoss = start({ levelId: "IF-1", seed: 92, resume: true });
    liveLoss.closePauseMenu(); game.scene.processQueue();
    liveLoss.endGame(); check(!readSurvivalSave("IF-1"), "Real loss did not delete survival save"); stop(liveLoss);
    return results;
  });
  assert.deepEqual(errors, []); console.log("Battle lifecycle and profile isolation passed", results);
} finally { await browser.close(); }
