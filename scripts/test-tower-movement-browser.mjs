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
    const { NO_SHIFTER_PRESENTATION } = await mod("/src/game/towerShifterRules.ts");
    const { NO_PUSH_PRESENTATION } = await mod("/src/game/towerPushRules.ts");
    const { NO_DEPLOYMENT_PRESENTATION } = await mod("/src/game/towerDeploymentRules.ts");
    const { getCardDefinition } = await mod("/src/registry/cardDefinitions.ts");
    const { getTowerSkillState } = await mod("/src/game/skillState.ts");
    const { towerOperationRef: ref } = await mod("/src/game/battleOperations.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const start = key => {
      game.scene.add(key, new GameScene(key), false);
      game.scene.start(key, { levelId: "IF-1", seed: 421, selectedCards: ["#", "B", "[]", "m", "s", "@", "&", "u", "0", "1"] });
      return game.scene.getScene(key);
    };
    const detach = scene => {
      scene.shifter.simulation.presentation = NO_SHIFTER_PRESENTATION;
      scene.towerPush.simulation.presentation = NO_PUSH_PRESENTATION;
      scene.deployment.presentation = NO_DEPLOYMENT_PRESENTATION;
    };
    const displayed = start("MoveDisplayed"), silent = start("MoveSilent"), scenes = [displayed, silent]; detach(silent);
    const find = (s, id, lane, column) => s.towers.find(t => t.type === id && t.lane === lane && t.column === column && !t.transient);
    const send = (s, op, expected = "handled") => check(s.submitPlayerOperation("local", op) === expected, "Operation failed: " + JSON.stringify(op));
    const seen = { layeredPush: false, erased: false, pipeline: false, movingSave: false, generated: false, mirrorShift: false, cooldown: false };
    for (const s of scenes) {
      s.chars = 100000; s.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
      const place = (id, lane, column) => {
        s.cardStatesById.get(id).readyAt = 0;
        check(s.deployment.useCard(getCardDefinition(id), lane, column) === "deployed", "Deploy failed: " + id);
        s.mirrors.syncMirrors(); return find(s, id, lane, column);
      };
      place("B", 3, 1); place("[]", 3, 1); place("m", 3, 2); place("m", 3, 4);
      place("#", 1, 0); place("B", 1, 1); place("[]", 1, 1); place("B", 1, 2);
      place("#", 2, 11); place("B", 2, 12); place("[]", 2, 12);
      const summoner = place("s", 4, 8); summoner.level = 3; summoner.facingDirection = -1; summoner.lastFire = -20000;
      place("u", 5, 0); place("@", 5, 1); const swap = place("&", 5, 2); place("B", 0, 9);
      send(s, { type: "topology", target: ref(swap), cell: { lane: 0, column: 9 } });
      const source = place("#", 6, 0); place("0", 6, 1); place("1", 6, 4); place("B", 6, 5);
      for (let c = 0; c < 4; c++) s.edgeTowers.push(s.world.entityIds.identify("edge", {
        type: "=", lane: 6, column: c, axis: "horizontal", mode: ">", level: 1, autoUpgrade: false
      }));
      s.numbers.sync(); s.updateLevelAuras();
      for (const [lane, column, destination] of [[1, 0, 1], [2, 11, 12], [6, 0, 1]]) {
        const t = find(s, "#", lane, column); getTowerSkillState(t, "push").sp = 30;
        send(s, { type: "push", target: ref(t), cell: { lane, column: destination } });
      }
      check(source.skills.push.sp === 0, "Routed source SP was not spent");
      seen.layeredPush ||= !!find(s, "B", 1, 2)?.parenthesisGuard;
      seen.erased ||= !find(s, "B", 2, 13) && !find(s, "[]", 2, 13);
      seen.pipeline ||= find(s, "0", 6, 1).projectileBank.shots.length > 0;
      seen.movingSave ||= !!find(s, "B", 1, 2).moveVisual;
    }
    const restored = start("MoveRestored");
    restored.applyBattleSave(restoreBattleSnapshot(restored, captureBattleSnapshot(displayed.battleState())));
    detach(restored); scenes.push(restored);
    check(scenes.every(s => s.battleChecksum() === displayed.battleChecksum()), "Initial restore mismatch");
    for (let tick = 0; tick < 1500; tick++) {
      for (const s of scenes) {
        if (tick === 60) {
          const units = [find(s, "B", 3, 1), find(s, "[]", 3, 1), find(s, "m", 3, 2), find(s, "B", 3, 3), find(s, "[]", 3, 3)];
          send(s, { type: "move", sources: units.map(t => ({ target: ref(t), lane: t.lane, column: t.column })),
            destination: { lane: 0, column: 2 } }, "moved");
          seen.mirrorShift ||= !!find(s, "B", 0, 2)?.parenthesisGuard && !find(s, "B", 3, 5);
          check(seen.mirrorShift, "Mirror move state: " + JSON.stringify(s.towers.map(t => ({ type: t.type, lane: t.lane, column: t.column, group: t.mirrorGroupId, guard: t.parenthesisGuard?.id }))));
          seen.cooldown ||= s.shifter.cooldownRatio() === 0 && s.shifter.snapshot().cooldownDuration > 15000;
        }
        s.update(0, 1000 / 60);
      }
      seen.generated ||= displayed.towers.some(t => t.type === "a" && t.level === 3 && t.facingDirection === -1 && t.lane === 4);
      if (tick % 15 === 0) for (const s of scenes.slice(1)) {
        check(s.battleChecksum() === displayed.battleChecksum(), s.sys.settings.key + " diverged at " + tick);
      }
    }
    check(Object.values(seen).every(Boolean), "Missing coverage: " + JSON.stringify(seen));
    check(find(displayed, "B", 6, 6), "Pipeline did not push at outlet");
    const hash = displayed.battleChecksum(); check(scenes.every(s => s.battleChecksum() === hash), "Final mismatch");
    for (const s of scenes) game.scene.stop(s.sys.settings.key);
    return { hash, ticks: 1500, seen };
  });
  assert.deepEqual(errors, []);
  console.log("Actual movement, generated towers and command execution agree without presentation and after restore", result);
} finally { await browser.close(); }
