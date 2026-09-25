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
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    let serial = 0;
    const start = options => {
      const key = `TutorialCheckpoint${serial++}`;
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options); return game.scene.getScene(key);
    };
    const stop = scene => { game.scene.stop(scene.sys.settings.key); game.scene.remove(scene.sys.settings.key); };
    const results = [];
    for (const levelId of ["0-1", "0-2", "0-3", "0-6"]) {
      const scene = start({ levelId, seed: 885 }), checkpoints = [];
      const tick = (count = 1) => { for (let i = 0; i < count; i++) scene.update(0, 1000 / 60); };
      const take = label => {
        const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
        validateBattleSave(graph, scene.wave);
        checkpoints.push({ graph, label, sequence: scene.exportReplay().commands.length, hash: scene.battleChecksum() });
      };
      const until = step => {
        for (let i = 0; scene.tutorial.step !== step && !scene.gameOver && i < 12000; i++) tick();
        check(scene.tutorial.step === step, `${levelId}: stuck at ${scene.tutorial.step}, expected ${step}`);
        take(step);
      };
      const control = control => check(scene.submitPlayerControl("local", control) === "handled", control.type);
      const next = () => { control({ type: "tutorialAdvance" }); };
      const deploy = (card, lane, column) => {
        const state = scene.cardStatesById.get(card);
        for (let i = 0; scene.cardTimeFor(card) < state.readyAt && i < 10000; i++) tick();
        const tower = scene.occupied.get(`${lane}:${column}`);
        const expected = tower ? { kind: "tower", id: tower.entityId } : null;
        check(scene.submitPlayerOperation("local", { type: "deploy", card, cell: { lane, column }, expected }) === "deployed", `deploy ${card}`);
        tick();
      };
      take("initial");
      if (levelId !== "0-6") { control({ type: "debugMode", enabled: true }); control({ type: "debugChars" }); }
      if (levelId === "0-1") {
        next(); until("producer"); deploy("X", 1, 1); until("attacker");
        deploy("A", 3, 2); until("incomingReady"); next(); take("firstWave");
        until("defender"); deploy("B", 3, 5); until("blockingReady"); next(); take("blockingWave");
        until("upgrade"); deploy("A", 3, 2); until("reinforce");
        deploy("A", 2, 2); deploy("A", 4, 2); until("finalReady"); next(); take("finalWave");
        until("complete"); next(); check(scene.gameOver, "Basic lesson did not finish");
      } else if (levelId === "0-3") {
        next(); take("functionClass"); next(); until("deployF");
        deploy("F", 3, 4); until("fReady"); next(); take("fActive"); until("deployG");
        check(scene.actionQueue.snapshot().some(entry => entry.action.type === "shock"), "No pending F actions at checkpoint");
        deploy("G", 3, 7); take("armingG"); until("gReady"); next(); take("gActive"); until("complete");
        next(); check(scene.gameOver, "Tower types lesson did not finish");
      } else if (levelId === "0-2") {
        tick(120); check(scene.wave === 0, "Practice spawned before start");
        next(); tick(); take("firstWave"); deploy("A", 3, 2); deploy("B", 3, 5);
        tick(240); take("running");
      } else {
        next(); take("firstDiagram");
        for (let index = 0; index < 5; index++) {
          next(); take(`fired-${index}`); next(); take(`next-${index}`);
        }
        next(); check(scene.gameOver, "Damage lesson did not finish");
      }
      const replay = scene.exportReplay(), expected = scene.battleChecksum(), persistent = JSON.stringify(localStorage);
      for (const checkpoint of checkpoints) {
        const resumed = start({ levelId, seed: 885 });
        resumed.applyBattleSave(restoreBattleSnapshot(resumed, checkpoint.graph));
        check(resumed.battleChecksum() === checkpoint.hash, `${levelId}/${checkpoint.label}: restore mutated combat`);
        // Rendering the same instructions cannot advance, spawn or finish a lesson.
        for (let i = 0; i < 3; i++) resumed.syncTutorialView();
        check(resumed.battleChecksum() === checkpoint.hash, "Rendering changed lesson state");
        const legacy = resumed.battleState(); delete legacy.tutorial;
        let rejected = false; try { resumed.world.validateTutorial(legacy.tutorial); } catch { rejected = true; }
        check(rejected, "Unrecoverable legacy tutorial checkpoint silently restarted");
        stop(resumed);
        const suffix = { ...replay, checkpoint: checkpoint.graph,
          commands: replay.commands.slice(checkpoint.sequence).map((entry, sequence) => ({ ...entry, sequence })) };
        for (const delta of [1000 / 30, 1000 / 144]) {
          const played = start({ replay: suffix });
          played.tutorialView.destroy(); played.tutorialView = undefined;
          played.update(0, 0);
          for (let i = 0; !played.gameOver && !played.session.playbackComplete && i < 120000; i++) played.update(0, delta);
          check(played.battleChecksum() === expected, `${levelId}/${checkpoint.label}: continuation diverged without view`);
          stop(played);
        }
      }
      check(JSON.stringify(localStorage) === persistent, "Tutorial replay changed profile");
      results.push({ levelId, ticks: replay.endTick, checkpoints: checkpoints.length, hash: expected }); stop(scene);
    }
    return results;
  });
  assert.deepEqual(errors, []); console.log("Tutorial checkpoints and view-free continuation passed", results);
} finally { await browser.close(); }
