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
    const { LOCAL_BATTLE_ACTOR } = await mod("/src/game/battleParticipants.ts");
    const { LEGACY_BATTLE_POLICY } = await mod("/src/game/battlePolicy.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await mod("/src/game/validateBattleSave.ts");
    const saves = await mod("/src/survivalSaves.ts");
    const cfg = await mod("/src/config.ts");
    const game = window.__testGame, check = (value, label) => { if (!value) throw Error(label); };
    game.loop.stop(); progress.resetProgress();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const data = { levelId: "IF-1", seed: 913, selectedCards: ["A", "B"] };
    const policy = { version: 1, slotCount: 2, allowedCards: ["A", "B", "?", "w"], reselectEnabled: true, pauseOnLocalModal: false };
    const participants = [LOCAL_BATTLE_ACTOR, { id: "peer", permissions: ["loadout", "time", "build"] }];
    const start = (key, options = data) => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options); return game.scene.getScene(key);
    };
    const control = (scene, value, expected = "handled", actor = "local") => {
      const result = scene.submitPlayerControl(actor, value); check(result === expected, `${value.type}: ${result}/${expected}`);
    };
    const first = start("FreshProgress"), host = start("PolicyHost", { ...data, policy, participants });
    const originalSlots = first.session.policy.slotCount;
    check(!first.session.policy.reselectEnabled && !first.session.policy.allowedCards.includes("I"), "Fresh progress fixture is not restricted");
    first.openPauseMenu(); game.scene.processQueue(); check(game.scene.isPaused("FreshProgress"), "Default menu no longer pauses scene");
    first.update(0, 100); check(first.simulation.tick === 0, "Default menu advanced battle"); first.closePauseMenu(); game.scene.processQueue();
    progress.unlockAllCards(); progress.completeAllLevels();
    check(first.session.policy.slotCount === originalSlots && !first.runtime.controls.reselectAvailable,
      "Progress update changed an existing battle's policy");
    for (const scene of [first, host]) {
      control(scene, { type: "debugMode", enabled: true }); control(scene, { type: "debugChars" });
    }
    for (let i = 0; i < 14500; i++) { first.update(0, 1000 / 60); host.update(0, 1000 / 60); }
    check(host.reselection.isReady(host.battleTime) && first.reselection.isReady(first.battleTime), "Reselection cooldown fixture not ready");
    const firstBefore = first.battleChecksum(), hostBefore = host.battleChecksum();
    control(first, { type: "reselect", cards: ["I"] }, "forbidden");
    control(host, { type: "reselect", cards: ["A", "B", "w"] }, "forbidden");
    control(host, { type: "reselect", cards: ["I"] }, "forbidden");
    control(host, { type: "reselect", cards: ["?I"] }, "forbidden");
    check(first.battleChecksum() === firstBefore && host.battleChecksum() === hostBefore, "Rejected access changed combat");
    const readyCheckpoint = captureBattleSnapshot(host.battleState()); validateBattleSave(readyCheckpoint, host.wave);
    control(host, { type: "reselect", cards: ["B", "?B"] });
    const expected = host.battleChecksum(), replay = host.exportReplay(), firstReplay = first.exportReplay();
    progress.resetProgress();
    check(!progress.isCardUnlocked("?"), "Fresh profile unexpectedly permits imitation");
    const persistent = JSON.stringify(localStorage);
    for (const [index, delta] of [1000 / 30, 1000 / 144].entries()) {
      for (const [key, record, hash] of [["Policy", replay, expected], ["Restricted", firstReplay, firstBefore]]) {
        const played = start(`${key}Playback${index}`, { replay: record });
        for (let i = 0; played.simulation.tick < record.endTick && i < 80000; i++) played.update(0, delta);
        check(played.simulation.tick === record.endTick && played.battleChecksum() === hash,
          `${key} replay ${index} changed policy or denial outcome: ${played.battleChecksum()}/${hash}`);
        game.scene.stop(played.sys.settings.key);
      }
    }
    check(JSON.stringify(localStorage) === persistent, "Replay changed persistent unlock state");
    const checkpoint = captureBattleSnapshot(host.battleState());
    check(saves.writeSurvivalSave({ version: 1, levelId: "IF-1", savedAt: 1, wave: host.wave,
      difficulty: host.difficulty, difficultyVersion: cfg.DIFFICULTY_VERSION, unlimitedFirepower: false,
      selectedCards: [...host.selectedCardIds], graph: checkpoint }), "Cannot save configured battle");
    const resumed = start("PolicyResume", { levelId: "IF-1", resume: true });
    check(resumed.selectedCardIds.join() === "B,?B", "Resume filtered saved loadout through current unlocks");
    check(resumed.session.policy.slotCount === 2 && !resumed.battlePaused && resumed.battleChecksum() === expected,
      "Resume replaced captured policy or locally paused a continuing host");
    const fullCards = ["A", "B", "D", "X", "F", "G", "I", "J", "?B", "w"];
    const full = start("FullSlots", { ...data, policy: LEGACY_BATTLE_POLICY, selectedCards: fullCards });
    check(full.saveSurvivalBattle(), "Cannot save full-slot battle");
    const fullResume = start("FullSlotsResume", { levelId: "IF-1", resume: true });
    check(progress.unlockedCardSlotCount() < 10 && fullResume.selectedCardIds.join() === fullCards.join() &&
      fullResume.session.policy.slotCount === 10 && fullResume.battleChecksum() === full.battleChecksum(),
      "Current profile truncated saved card slots");
    fullResume.closePauseMenu(); game.scene.processQueue();

    const restoreReady = key => {
      const scene = start(key); scene.applyBattleSave(restoreBattleSnapshot(scene, readyCheckpoint)); return scene;
    };
    const modal = restoreReady("ModalHost"), reference = restoreReady("ModalReference");
    const equal = label => check(modal.battleChecksum() === reference.battleChecksum(), label);
    modal.openPauseMenu();
    check(!game.scene.isPaused("ModalHost"), "Continuing menu paused Phaser scene");
    for (let i = 0; i < 90; i++) { modal.update(0, 1000 / 60); reference.update(0, 1000 / 60); }
    check(modal.simulation.tick === 14590, "Menu blocked simulation advancement"); equal("Local menu changed combat");
    control(modal, { type: "pause", paused: true }, "handled", "peer");
    control(reference, { type: "pause", paused: true }, "handled", "peer");
    modal.closePauseMenu(); check(modal.battlePaused, "Closing local menu undid peer pause");
    modal.update(0, 100); reference.update(0, 100); check(modal.simulation.tick === 14590, "Peer pause not respected");
    for (const scene of [modal, reference]) control(scene, { type: "pause", paused: false }, "handled", "peer");
    modal.openReselection(); game.scene.processQueue();
    const selection = game.scene.getScene("CardSelectScene");
    check(modal.reselectOpen && !game.scene.isPaused("ModalHost"), "Continuing reselection paused Phaser scene");
    check(selection.cardSlotCount === 2 && selection.cardFrames.has("A") && selection.cardFrames.has("B") &&
      !selection.cardFrames.has("X") && selection.cardAllowed("?B"), "Reselection view uses current profile instead of session policy");
    for (let i = 0; i < 60; i++) { modal.update(0, 1000 / 60); reference.update(0, 1000 / 60); }
    equal("Reselection UI changed combat");
    selection.clearButton.emit("pointerdown"); selection.toggleCard("B");
    const localStorageBefore = localStorage.getItem("characters-vs-geometry:last-card-loadout");
    for (const scene of [modal, reference]) control(scene, { type: "reselect", cards: ["?B"] }, "handled", "peer");
    selection.startButton.emit("pointerdown"); game.scene.processQueue();
    check(!modal.reselectOpen && modal.selectedCardIds.join() === "?B", "Stale local confirmation overwrote peer's reselection");
    check(localStorage.getItem("characters-vs-geometry:last-card-loadout") === localStorageBefore, "Rejected selection changed saved preference");
    equal("Concurrent selection changed combat");
    const reselectReplay = modal.exportReplay(), reselectHash = modal.battleChecksum();
    const reselectPlayback = start("ReselectCheckpointReplay", { replay: reselectReplay });
    for (let i = 0; reselectPlayback.simulation.tick < reselectReplay.endTick && i < 30000; i++) reselectPlayback.update(0, 1000 / 144);
    // Drain same-tick commands when the final replay tick has just been reached.
    reselectPlayback.update(0, 0);
    check(reselectPlayback.battleChecksum() === reselectHash, "Modal/peer checkpoint replay diverged");
    modal.openPauseMenu(); modal.endGame(); check(!modal.menuOpen, "Battle end left DOM menu covering result");
    const ending = restoreReady("ReselectEnding"); ending.openReselection(); game.scene.processQueue();
    ending.endGame(); game.scene.processQueue();
    check(!ending.reselectOpen && !game.scene.isActive("CardSelectScene"), "Battle end left reselection scene alive");
    const settings = restoreReady("SettingsEnding"); settings.openPauseMenu();
    settings.pauseMenu.buttons.find(button => button.key === "button.settings").element.click(); game.scene.processQueue();
    check(settings.battleSettingsOpen && game.scene.isActive("SettingsScene"), "Settings overlay fixture did not open");
    const settingsTick = settings.simulation.tick; settings.update(0, 1000 / 60);
    check(settings.simulation.tick === settingsTick + 1, "Settings overlay blocked continuing battle");
    settings.endGame(); game.scene.processQueue();
    check(!settings.battleSettingsOpen && !settings.menuOpen && !game.scene.isActive("SettingsScene"), "Battle end left settings overlay alive");
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    return { ticks: replay.endTick, checksum: expected, deniedReplay: true, savedPolicy: true, modalTick: modal.simulation.tick,
      independentMenus: true, concurrentReselection: true };
  });
  assert.deepEqual(errors, []); console.log("Live captured access policy and local-modal isolation passed", result);
} finally { await browser.close(); }
