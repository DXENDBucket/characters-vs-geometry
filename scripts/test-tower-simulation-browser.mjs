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
    const { towerAttackRuntime } = await mod("/src/render/towerCombat.ts");
    const { triggerTowerRuntime } = await mod("/src/render/triggerTowers.ts");
    const { enemySimulationRuntime } = await mod("/src/render/enemySimulation.ts");
    const { NO_TOWER_COMBAT_PRESENTATION } = await mod("/src/game/towerCombatPresentation.ts");
    const { NO_TOWER_SKILL_PRESENTATION } = await mod("/src/game/towerSkillPresentation.ts");
    const { NO_TRIGGER_TOWER_PRESENTATION } = await mod("/src/game/triggerTowerPresentation.ts");
    const { NO_ENEMY_SIMULATION_PRESENTATION } = await mod("/src/game/enemySimulationPresentation.ts");
    const { NO_PROJECTILE_PRESENTATION } = await mod("/src/game/projectilePresentation.ts");
    const { NO_UNIT_LIFECYCLE_PRESENTATION } = await mod("/src/game/unitLifecyclePresentation.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { getTowerSkillState } = await mod("/src/game/skillState.ts");
    const { TOWER_SKILLS } = await mod("/src/data/towerAbilities.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const cfg = await mod("/src/config.ts");
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const start = key => {
      game.scene.add(key, new GameScene(key), false);
      game.scene.start(key, { levelId: "IF-1", seed: 933, selectedCards: ["A", "B", "d", "S", "w", "o", "j", "i"] });
      return game.scene.getScene(key);
    };
    const detach = scene => {
      towerAttackRuntime(scene.combatRuntime()).presentation = NO_TOWER_COMBAT_PRESENTATION;
      triggerTowerRuntime(scene.triggerTowerRuntime()).presentation = NO_TRIGGER_TOWER_PRESENTATION;
      scene.towerSkills.simulationRuntime.presentation = NO_TOWER_SKILL_PRESENTATION;
      enemySimulationRuntime(scene.combatRuntime()).presentation = NO_ENEMY_SIMULATION_PRESENTATION;
      scene.projectileRuntime().presentation = NO_PROJECTILE_PRESENTATION;
      scene.unitLifecycleRuntime().presentation = NO_UNIT_LIFECYCLE_PRESENTATION;
    };
    const displayed = start("TowerDisplayed"), silent = start("TowerSilent"); detach(silent);
    const observations = { projectile: false, mortar: false, flight: false, laser: false, frozen: false };
    for (const scene of [displayed, silent]) {
      scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
      for (const [id, lane, column, level] of [
        ["A", 0, 2, 7], ["d", 1, 2, 1], ["e", 2, 2, 1], ["B", 2, 3, 1], ["S", 3, 2, 1],
        ["w", 4, 2, 1], ["o", 4, 3, 1], ["j", 5, 2, 1], ["c", 5, 3, 1], ["V", 6, 2, 1], ["x", 6, 3, 1]
      ]) {
        const t = scene.spawnGeneratedTower(id, lane, column, level); check(t, "Missing tower " + id);
        if (id === "B") t.hp = 500;
        if (["S", "w", "o", "j", "c"].includes(id)) {
          getTowerSkillState(t, TOWER_SKILLS[id].stateKey).sp = TOWER_SKILLS[id].maxSp;
          if (id !== "S") t.continuousAttack = true;
        }
      }
      for (let lane = 0; lane < cfg.LANES; lane++) spawnEnemyAt(scene.combatRuntime(), {
        kind: "trapezoid3", lane, x: cfg.BOARD_X + 9 * cfg.CELL_WIDTH, time: 0,
        waveNumber: 1, waveWeight: 0, finalDamageReduction: 0
      });
      const ice = scene.spawnGeneratedTower("i", 1, 8, 1);
      scene.triggerShockTower(ice);
      check(!ice.inPlay, "Trigger was not consumed");
      observations.frozen ||= scene.enemies.some(e => e.statusEffects.some(s => s.name === "frozen"));
      const s = scene.towers.find(t => t.type === "S");
      check(scene.towerSkills.activateManualSkills([s], "S", {
        x: cfg.BOARD_X + 9 * cfg.CELL_WIDTH, y: s.y
      }) === "handled", "S activation failed");
      const runtime = towerAttackRuntime(scene.combatRuntime()), laser = runtime.presentation.laser;
      runtime.presentation = { ...runtime.presentation, laser: (...args) => { observations.laser = true; laser(...args); } };
    }
    const tick = scenes => {
      for (const scene of scenes) scene.update(0, 1000 / 60);
      observations.projectile ||= displayed.projectiles.length > 0;
      observations.mortar ||= displayed.mortarProjectiles.length > 0;
      observations.flight ||= displayed.towerSkills.snapshotFlights().length > 0;
    };
    for (let i = 0; i < 60; i++) {
      tick([displayed, silent]);
      check(displayed.battleChecksum() === silent.battleChecksum(), "Detached tower diverged at " + i);
    }
    const restored = start("TowerRestored");
    restored.applyBattleSave(restoreBattleSnapshot(restored, captureBattleSnapshot(displayed.battleState())));
    detach(restored);
    const differences = (a, b, path = "$", out = []) => {
      if (out.length >= 8 || Object.is(a, b)) return out;
      if (a && b && typeof a === "object" && typeof b === "object") {
        if (JSON.stringify(Object.keys(a)) !== JSON.stringify(Object.keys(b))) out.push({ path: path + ".keys", a: Object.keys(a), b: Object.keys(b) });
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], path + "." + key, out);
      } else out.push({ path, a, b });
      return out;
    };
    for (let i = 60; i < 900; i++) {
      tick([displayed, silent, restored]);
      if (i % 30 === 0) for (const scene of [silent, restored]) {
        if (scene.battleChecksum() !== displayed.battleChecksum()) throw Error(scene.sys.settings.key + " diverged at " + i + ": " +
          JSON.stringify(differences(captureBattleSnapshot(displayed.battleState()), captureBattleSnapshot(scene.battleState()))));
      }
    }
    check(Object.values(observations).every(Boolean), "Missing branch: " + JSON.stringify(observations));
    const checksum = displayed.battleChecksum();
    check([silent, restored].every(s => s.battleChecksum() === checksum), "Final mismatch");
    for (const scene of [displayed, silent, restored]) game.scene.stop(scene.sys.settings.key);
    return { checksum, ticks: 900, observations };
  });
  assert.deepEqual(errors, []);
  console.log("Actual tower simulation agrees with detached combat/skill/trigger presentation and restore", result);
} finally { await browser.close(); }
