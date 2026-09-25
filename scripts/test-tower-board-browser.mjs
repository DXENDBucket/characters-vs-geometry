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
    const { NO_TOWER_BOARD_PRESENTATION } = await mod("/src/game/towerBoard.ts");
    const { NO_DEPLOYMENT_PRESENTATION } = await mod("/src/game/towerDeploymentRules.ts");
    const { NO_MIRROR_PRESENTATION } = await mod("/src/game/towerMirrorRules.ts");
    const { NO_TARGETED_EFFECT_PRESENTATION } = await mod("/src/game/targetedEffectRules.ts");
    const { getCardDefinition } = await mod("/src/registry/cardDefinitions.ts");
    const { removeTower } = await mod("/src/game/unitLifecycle.ts");
    const { changeTowerHealth } = await mod("/src/game/towerHealthRules.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const start = key => {
      game.scene.add(key, new GameScene(key), false);
      game.scene.start(key, { levelId: "IF-1", seed: 381, selectedCards: ["B", "m", "[]", "G", "w", "t", "@", "&", "u", "i"] });
      return game.scene.getScene(key);
    };
    const detach = scene => {
      scene.towerBoard.presentation = NO_TOWER_BOARD_PRESENTATION;
      scene.deployment.presentation = NO_DEPLOYMENT_PRESENTATION;
      scene.mirrors.presentation = NO_MIRROR_PRESENTATION;
      scene.targetedEffects.presentation = NO_TARGETED_EFFECT_PRESENTATION;
    };
    const displayed = start("BoardDisplayed"), silent = start("BoardSilent"), scenes = [displayed, silent]; detach(silent);
    const seen = { mirror: false, upgrade: false, shell: false, copied: false, shared: false, attachment: false, moved: false, nul: false, uncopied: false };
    const find = (scene, id, lane, column) => scene.towers.find(t => t.type === id && t.lane === lane && t.column === column && !t.transient);
    for (const scene of scenes) {
      scene.chars = 100000;
      scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
      const place = (id, lane, column) => {
        scene.cardStatesById.get(id).readyAt = 0;
        check(scene.deployment.useCard(getCardDefinition(id), lane, column) === "deployed", "Cannot deploy " + id);
        scene.mirrors.syncMirrors(); return find(scene, id, lane, column);
      };
      place("B", 3, 1); place("[]", 3, 1); place("m", 3, 2); place("m", 3, 4);
      place("B", 3, 1); place("m", 3, 2);
      place("G", 0, 1); place("G", 0, 1);
      place("u", 5, 1); const copy = place("@", 5, 2), swap = place("&", 5, 3);
      place("w", 0, 9); changeTowerHealth(copy, -400);
      check(scene.topology.connect(swap, 0, 9), "Topology not connected");
      seen.mirror ||= scene.mirrors.mirrorGroupFor(find(scene, "B", 3, 1)).length === 3;
      seen.upgrade ||= find(scene, "B", 3, 3).level === 2;
      seen.shell ||= !!find(scene, "B", 3, 1).parenthesisGuard;
      seen.copied ||= copy.copiedType === "w";
      seen.shared ||= copy.healthPool?.members.length > 1;
    }
    for (let tick = 0; tick < 900; tick++) {
      if (tick === 60) {
        for (const scene of scenes) {
          const target = find(scene, "B", 3, 1);
          check(scene.targetedEffects.use(getCardDefinition("t"), 3, 1, target) === "handled", "Attachment failed");
          scene.mirrors.syncMirrors();
        }
        const restored = start("BoardRestored");
        restored.applyBattleSave(restoreBattleSnapshot(restored, captureBattleSnapshot(displayed.battleState())));
        detach(restored); scenes.push(restored);
      }
      for (const scene of scenes) {
        if (tick === 120) {
          const sources = [find(scene, "B", 3, 1), find(scene, "m", 3, 2), find(scene, "B", 3, 3)]
            .map(t => ({ target: { kind: "tower", id: t.entityId }, lane: t.lane, column: t.column }));
          check(scene.submitPlayerOperation("local", { type: "move", sources, destination: { lane: 1, column: 7 } }) === "moved", "Mirror move failed");
          seen.moved ||= !!find(scene, "B", 1, 7)?.inPlay && !find(scene, "B", 3, 5);
        }
        if (tick === 180) {
          const b = find(scene, "B", 1, 7); b.autoUpgrade = true;
          scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: true });
          scene.cardStatesById.get("B").readyAt = 0;
        }
        if (tick === 240) {
          removeTower(scene.unitLifecycleRuntime(), find(scene, "&", 5, 3)); scene.updateLevelAuras();
          seen.uncopied ||= find(scene, "@", 5, 2).copiedType === undefined;
        }
        if (tick === 300) scene.nullification.start(scene.battleTime, 2000);
        scene.update(0, 1000 / 60);
      }
      seen.attachment ||= displayed.towers.some(t => t.type === "B" && t.trueDamageUntil > displayed.battleTime);
      seen.nul ||= !!displayed.nullification.snapshot();
      if (tick % 15 === 0) for (const scene of scenes.slice(1)) {
        check(scene.battleChecksum() === displayed.battleChecksum(), `${scene.sys.settings.key} diverged at ${tick}`);
      }
    }
    check(Object.values(seen).every(Boolean), "Missing coverage: " + JSON.stringify(seen));
    const hash = displayed.battleChecksum(); check(scenes.every(s => s.battleChecksum() === hash), "Final mismatch");
    for (const scene of scenes) game.scene.stop(scene.sys.settings.key);
    return { hash, ticks: 900, seen };
  });
  assert.deepEqual(errors, []);
  console.log("Actual deployment/mirror/copy/topology agrees without presentation and after restore", result);
} finally { await browser.close(); }
