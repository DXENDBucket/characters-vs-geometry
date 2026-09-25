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
    const { bossSimulationRuntime } = await mod("/src/render/bossSimulation.ts");
    const { towerAttackRuntime } = await mod("/src/render/towerCombat.ts");
    const { triggerTowerRuntime } = await mod("/src/render/triggerTowers.ts");
    const { enemySimulationRuntime } = await mod("/src/render/enemySimulation.ts");
    const { NO_BOSS_SIMULATION_PRESENTATION } = await mod("/src/game/bossSimulationPresentation.ts");
    const { NO_TOWER_COMBAT_PRESENTATION } = await mod("/src/game/towerCombatPresentation.ts");
    const { NO_TOWER_SKILL_PRESENTATION } = await mod("/src/game/towerSkillPresentation.ts");
    const { NO_TRIGGER_TOWER_PRESENTATION } = await mod("/src/game/triggerTowerPresentation.ts");
    const { NO_ENEMY_SIMULATION_PRESENTATION } = await mod("/src/game/enemySimulationPresentation.ts");
    const { NO_PROJECTILE_PRESENTATION } = await mod("/src/game/projectilePresentation.ts");
    const { NO_UNIT_LIFECYCLE_PRESENTATION } = await mod("/src/game/unitLifecyclePresentation.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { enemyFamily } = await mod("/src/registry/enemies.ts");
    const { damageBoss, removeEnemy } = await mod("/src/game/unitLifecycle.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const cfg = await mod("/src/config.ts");
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const detach = scene => {
      bossSimulationRuntime(scene.bossRuntime()).presentation = NO_BOSS_SIMULATION_PRESENTATION;
      towerAttackRuntime(scene.combatRuntime()).presentation = NO_TOWER_COMBAT_PRESENTATION;
      triggerTowerRuntime(scene.triggerTowerRuntime()).presentation = NO_TRIGGER_TOWER_PRESENTATION;
      scene.towerSkills.simulationRuntime.presentation = NO_TOWER_SKILL_PRESENTATION;
      enemySimulationRuntime(scene.combatRuntime()).presentation = NO_ENEMY_SIMULATION_PRESENTATION;
      scene.projectileRuntime().presentation = NO_PROJECTILE_PRESENTATION;
      scene.unitLifecycleRuntime().presentation = NO_UNIT_LIFECYCLE_PRESENTATION;
    };
    const differences = (a, b, path = "$", out = []) => {
      if (out.length >= 6 || Object.is(a, b)) return out;
      if (a && b && typeof a === "object" && typeof b === "object") {
        if (JSON.stringify(Object.keys(a)) !== JSON.stringify(Object.keys(b))) out.push({ path: path + ".keys", a: Object.keys(a), b: Object.keys(b) });
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], path + "." + key, out);
      } else out.push({ path, a, b });
      return out;
    };
    const results = [];
    for (const [levelId, phase] of [["1-10", 0], ["2-10", 0], ["5-5", 0], ["5-8", 0], ["5-10", 2], ["5-10", 3], ["AE-10", 0]]) {
      const start = name => {
        const key = `${name}:${levelId}:${phase}`;
        game.scene.add(key, new GameScene(key), false);
        game.scene.start(key, { levelId, seed: 754, selectedCards: ["A", "B", "O", "d", "x", "e"] });
        return game.scene.getScene(key);
      };
      const displayed = start("BossDisplayed"), silent = start("BossSilent"); detach(silent);
      const observations = { action: false, copies: false, companions: false, sweep: false, promotion: false };
      const inspect = scene => {
        observations.action ||= scene.actionQueue.snapshot().some(p => p.action.type.startsWith("boss") || p.action.type.startsWith("companion"));
        observations.copies ||= (scene.boss?.octahedronCopies?.length ?? 0) > 0;
        observations.companions ||= scene.enemies.some(e => enemyFamily(e.kind) === "dodecahedronCompanion");
        observations.sweep ||= !!scene.boss?.delSweep;
        observations.promotion ||= scene.enemies.some(e => e.kind === "triangle2");
      };
      for (const scene of [displayed, silent]) {
        if (levelId === "5-10") {
          scene.bossPhaseIndex = phase; scene.resetBossForPhase(scene.boss);
          scene.applyBossPhaseStats(scene.boss); scene.applyBossPhaseSkillState(scene.boss);
        }
        scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
        for (let lane = 0; lane < cfg.LANES; lane++) {
          const t = scene.spawnGeneratedTower(lane % 2 ? "O" : "B", lane, 1, 3); check(t, "Tower missing");
        }
        const boss = scene.boss;
        if (levelId === "1-10") {
          for (let lane = 1; lane <= 3; lane++) spawnEnemyAt(scene.combatRuntime(), {
            kind: "triangle", lane, x: cfg.BOARD_X + 9 * cfg.CELL_WIDTH, time: 0,
            waveNumber: 1, waveWeight: 0, finalDamageReduction: 0
          });
          boss.skills.promotion.sp = boss.skills.promotion.maxSp;
          boss.skills.advance.sp = boss.skills.advance.maxSp;
        }
        if (levelId === "2-10") damageBoss(scene.unitLifecycleRuntime(), 1e12, "true");
        if (levelId === "5-8" || (levelId === "5-10" && phase === 3)) boss.hp = boss.maxHp * .25;
        if (levelId === "AE-10") boss.hp = boss.maxHp * .75;
      }
      const mutate = (scene, tick) => {
        if (tick === 2) for (const e of scene.enemies) {
          if (enemyFamily(e.kind) === "dodecahedronCompanion") e.bossCompanionNextActionAt = scene.battleTime;
        }
        if (tick === 300 && (levelId === "5-5" || (levelId === "5-10" && phase === 2))) {
          const e = scene.enemies.find(e => enemyFamily(e.kind) === "dodecahedronCompanion");
          check(e, "Missing death companion"); removeEnemy(scene.unitLifecycleRuntime(), e, false);
        }
        if (tick === 300 && levelId === "5-10" && phase === 3) damageBoss(scene.unitLifecycleRuntime(), 1e12, "true");
        if (tick === 360 && levelId === "AE-10") scene.boss.hp = scene.boss.maxHp * .49;
      };
      const scenes = [displayed, silent];
      for (let tick = 0; tick < 900; tick++) {
        if (tick === 60) {
          const restored = start("BossRestored");
          restored.applyBattleSave(restoreBattleSnapshot(restored, captureBattleSnapshot(displayed.battleState())));
          detach(restored); scenes.push(restored);
        }
        for (const scene of scenes) { mutate(scene, tick); scene.update(0, 1000 / 60); }
        inspect(displayed);
        if (tick % 30 === 0) for (const scene of scenes.slice(1)) {
          if (scene.battleChecksum() !== displayed.battleChecksum()) throw Error(`${levelId}/${phase} ${scene.sys.settings.key} at ${tick}: ` +
            JSON.stringify(differences(captureBattleSnapshot(displayed.battleState()), captureBattleSnapshot(scene.battleState()))));
        }
      }
      if (levelId === "1-10") check(observations.promotion, "Promotion was not exercised");
      if (levelId === "5-8" || (levelId === "5-10" && phase === 3)) check(observations.copies && observations.action, "Copies/reinforcements missing");
      if (levelId === "5-5" || (levelId === "5-10" && phase === 2)) check(observations.companions && observations.action, "Companion attack missing");
      if (levelId === "AE-10") check(observations.sweep, "Sweep missing");
      const hash = displayed.battleChecksum();
      check(scenes.every(s => s.battleChecksum() === hash), "Final mismatch");
      results.push({ levelId, phase, hash, ticks: 900, observations });
      for (const scene of scenes) { game.scene.stop(scene.sys.settings.key); game.scene.remove(scene.sys.settings.key); }
    }
    return results;
  });
  assert.deepEqual(errors, []);
  console.log("Actual Boss simulation agrees with detached combat presentation and restored state", JSON.stringify(result, null, 2));
} finally { await browser.close(); }
