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
    const { NO_CIRCUIT_PRESENTATION } = await mod("/src/game/projectileCircuitRules.ts");
    const { NO_TARGETED_EFFECT_PRESENTATION } = await mod("/src/game/targetedEffectRules.ts");
    const { towerAttackRuntime } = await mod("/src/render/towerCombat.ts");
    const { triggerTowerRuntime } = await mod("/src/render/triggerTowers.ts");
    const { NO_TOWER_COMBAT_PRESENTATION } = await mod("/src/game/towerCombatPresentation.ts");
    const { NO_TRIGGER_TOWER_PRESENTATION } = await mod("/src/game/triggerTowerPresentation.ts");
    const { NO_TOWER_SKILL_PRESENTATION } = await mod("/src/game/towerSkillPresentation.ts");
    const { NO_PROJECTILE_PRESENTATION } = await mod("/src/game/projectilePresentation.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { createMortarProjectile, createTowerProjectile } = await mod("/src/game/projectiles.ts");
    const { getCardDefinition } = await mod("/src/registry/cardDefinitions.ts");
    const { damageTower } = await mod("/src/game/unitLifecycle.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { BOARD_X, CELL_WIDTH, CELL_HEIGHT } = await mod("/src/config.ts");
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const start = key => {
      game.scene.add(key, new GameScene(key), false);
      game.scene.start(key, { levelId: "IF-1", seed: 711, selectedCards: ["A", "0", "1", "=", "t", "b", "!", "y"] });
      return game.scene.getScene(key);
    };
    const detach = scene => {
      scene.numbers.presentation = NO_CIRCUIT_PRESENTATION;
      scene.targetedEffects.presentation = NO_TARGETED_EFFECT_PRESENTATION;
      towerAttackRuntime(scene.combatRuntime()).presentation = NO_TOWER_COMBAT_PRESENTATION;
      triggerTowerRuntime(scene.triggerTowerRuntime()).presentation = NO_TRIGGER_TOWER_PRESENTATION;
      scene.towerSkills.simulationRuntime.presentation = NO_TOWER_SKILL_PRESENTATION;
      scene.projectileRuntime().presentation = NO_PROJECTILE_PRESENTATION;
    };
    const displayed = start("PipelineDisplayed"), silent = start("PipelineSilent"), scenes = [displayed, silent]; detach(silent);
    const seen = { storedAction: false, multihit: false, flight: false, healing: false, intercept: false, shield: false, attachment: false, explosion: false };
    const explosionTargets = new Map();
    const find = (scene, type, lane) => scene.towers.find(t => t.type === type && t.lane === lane && !t.transient);
    for (const scene of scenes) {
      scene.chars = 100000; scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
      for (let lane = 0; lane < 7; lane++) {
        const type = ["A", "d", "F", "A", "w", "A", "A"][lane];
        const source = scene.spawnGeneratedTower(type, lane, 1, lane === 0 ? 7 : 1); source.continuousAttack = true;
        const component = lane === 3 ? "+" : lane === 5 ? "-" : lane === 6 ? "*" : "0";
        scene.spawnGeneratedTower(component, lane, 2, 1);
        const last = component === "0" ? 6 : 2;
        for (let column = 1; column < last; column++) scene.edgeTowers.push(scene.world.entityIds.identify("edge",
          { type: "=", axis: "horizontal", lane, column, level: 10, mode: lane === 2 && column === 5 ? "!=" : ">" }));
        if (last === 6) scene.spawnGeneratedTower("1", lane, 6, lane === 0 ? 2 : 1);
        else { const patient = scene.spawnGeneratedTower("B", lane, 3, 1); if (lane === 3) patient.hp = 500; }
        spawnEnemyAt(scene.combatRuntime(), { kind: "trapezoid3", lane, x: BOARD_X + 10 * CELL_WIDTH,
          time: 0, waveNumber: 1, waveWeight: 0, finalDamageReduction: 0 });
      }
      scene.numbers.sync();
      scene.triggerShockTower(find(scene, "F", 2));
      const w = find(scene, "w", 4); w.skills.airPatrol.sp = 10;
      check(scene.towerSkills.activateManualSkills([w], "w", null) === "handled", "w did not route skill");
      seen.storedAction ||= find(scene, "0", 2).projectileBank.shots.some(s => s.action?.type === "F");
    }
    for (let tick = 0; tick < 900; tick++) {
      if (tick === 90) {
        for (const scene of scenes) {
          const target = find(scene, "w", 4);
          check(scene.targetedEffects.use(getCardDefinition("t"), target.lane, target.column, target) === "handled", "Pending attachment failed");
        }
        const restored = start("PipelineRestored");
        restored.applyBattleSave(restoreBattleSnapshot(restored, captureBattleSnapshot(displayed.battleState())));
        detach(restored); scenes.push(restored);
      }
      for (const scene of scenes) {
        if (tick === 120) {
          scene.edgeTowers.find(e => e.lane === 2 && e.column === 5).mode = ">"; scene.numbers.sync();
          const outlet = find(scene, "1", 2);
          spawnEnemyAt(scene.combatRuntime(), { kind: "trapezoid3", lane: 2, x: outlet.x, time: scene.battleTime,
            waveNumber: 1, waveWeight: 0, finalDamageReduction: 0 });
          explosionTargets.set(scene, scene.enemies.at(-1));
        }
        if (tick % 120 === 0) for (const lane of [3, 5, 6]) {
          const a = find(scene, "A", lane), patient = find(scene, "B", lane);
          const shot = createTowerProjectile(scene, { type: "bolt", sourceTower: a, x: a.x + 26, y: a.y, lane,
            speed: 400, damage: 400, hitCount: 3, damageType: "physical", splashRadius: 0, angleDegrees: 0, maxX: a.x + 500 });
          check(scene.numbers.capture(shot), "Test supply blocked");
          if (lane === 6) {
            const hp = patient.hp; damageTower(scene.unitLifecycleRuntime(), patient, 150, "magic");
            seen.shield ||= patient.hp === hp;
          }
          if (lane === 5 && tick === 0) {
            const minus = find(scene, "-", lane);
            const mortar = createMortarProjectile(scene, { owner: "enemy", fromX: minus.x, fromY: minus.y,
              targetX: patient.x, targetY: patient.y, damage: 900, damageType: "magic", rangeX: CELL_WIDTH, rangeY: CELL_HEIGHT });
            scene.numbers.intercept(mortar, mortar); seen.intercept ||= mortar.damage < 900 || mortar.partialHitDamage < 900;
            scene.mortarProjectiles.push(mortar);
          }
        }
        scene.update(0, 1000 / 60);
      }
      seen.multihit ||= displayed.projectiles.some(p => p.hitCount > 1);
      seen.flight ||= (find(displayed, "1", 4)?.flyingUntil ?? 0) > displayed.battleTime;
      seen.attachment ||= (find(displayed, "1", 4)?.trueDamageUntil ?? 0) > displayed.battleTime;
      seen.healing ||= (find(displayed, "B", 3)?.hp ?? 0) > 500;
      const explosionTarget = explosionTargets.get(displayed);
      seen.explosion ||= !!explosionTarget && explosionTarget.hp < explosionTarget.maxHp;
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
  console.log("Actual pipelines/attachments agree with no presentation and checkpoint restore", result);
} finally { await browser.close(); }
