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
    const { GameScene } = await mod("/src/scenes/GameScene.ts");
    const progress = await mod("/src/progress.ts");
    const { NO_UNIT_LIFECYCLE_PRESENTATION } = await mod("/src/game/unitLifecyclePresentation.ts");
    const life = await mod("/src/game/unitLifecycle.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { collectParenthesisPassengers } = await mod("/src/game/parenthesisEnemies.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { enemyFamily } = await mod("/src/registry/enemies.ts");
    const cfg = await mod("/src/config.ts");
    const game = window.__testGame, check = (ok, message) => { if (!ok) throw Error(message); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const data = { levelId: "AE-5", seed: 1709, selectedCards: ["B", "m", "u", "D", "()", "g", "T", "A"] };
    const start = (key, options = data) => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options);
      return game.scene.getScene(key);
    };
    const displayed = start("LifecycleDisplayed"), silent = start("LifecycleSilent");
    silent.unitLifecycleRuntime().presentation = NO_UNIT_LIFECYCLE_PRESENTATION;
    const at = (scene, type, lane, column) => scene.towers.find(t => t.type === type && t.lane === lane && t.column === column);
    for (const scene of [displayed, silent]) {
      scene.submitPlayerControl("local", { type: "debugMode", enabled: true });
      scene.submitPlayerControl("local", { type: "debugChars" });
      scene.submitPlayerControl("local", { type: "autoUpgradeEnabled", enabled: false });
      for (const [type, lane, column] of [["B", 3, 1], ["m", 3, 2], ["u", 1, 6], ["D", 1, 7],
        ["()", 5, 2], ["g", 2, 6], ["T", 5, 4], ["A", 5, 2]]) {
        check(scene.submitPlayerOperation("local", { type: "deploy", card: type, cell: { lane, column }, expected: null }) === "deployed",
          `Missing ${type} fixture`);
      }
      scene.mirrors.syncMirrors();
      check(at(scene, "B", 3, 3)?.mirrorGroupId === at(scene, "B", 3, 1)?.mirrorGroupId, "Mirror setup failed");
      check(at(scene, "u", 1, 6)?.healthPool === at(scene, "D", 1, 7)?.healthPool, "Shared pool setup failed");
      for (const kind of ["parentheses", "triangleRam3"]) {
        spawnEnemyAt(scene.combatRuntime(), { kind, lane: 3, x: cfg.BOARD_X + 9.5 * cfg.CELL_WIDTH,
          time: scene.battleTime, waveNumber: 1, waveWeight: 0, finalDamageReduction: 0 });
      }
      const carrier = scene.enemies.find(e => enemyFamily(e.kind) === "parentheses");
      collectParenthesisPassengers(carrier, scene.enemies, scene.battleTime);
      check(carrier.parenthesisCargo?.length === 1, "Passenger setup failed");
    }
    const tick = scenes => { for (const scene of scenes) scene.update(0, 1000 / 60); };
    for (let i = 0; i < 60; i++) tick([displayed, silent]);
    check(displayed.battleChecksum() === silent.battleChecksum(), "Initial display independence failed");
    const restored = start("LifecycleRestored");
    restored.applyBattleSave(restoreBattleSnapshot(restored, captureBattleSnapshot(displayed.battleState())));
    restored.unitLifecycleRuntime().presentation = NO_UNIT_LIFECYCLE_PRESENTATION;
    const scenes = [displayed, silent, restored], exercised = [];
    for (let i = 60; i < 600; i++) {
      for (const scene of scenes) {
        const r = scene.unitLifecycleRuntime();
        if (i === 60) {
          const inner = at(scene, "A", 5, 2), guard = at(scene, "()", 5, 2), hp = inner.hp;
          life.damageTower(r, inner, 1e8, "true");
          check(!guard.inPlay && inner.inPlay && inner.hp === hp, "Shell overflow changed");
        }
        if (i === 120) {
          life.damageTower(r, at(scene, "B", 3, 1), 1e8, "true");
          check(!at(scene, "B", 3, 1) && !at(scene, "B", 3, 3), "Mirror death did not cascade");
        }
        if (i === 180) {
          life.damageTower(r, at(scene, "D", 1, 7), 1e8, "true");
          check(!at(scene, "u", 1, 6) && !at(scene, "D", 1, 7) && !at(scene, "g", 2, 6), "Shared death did not cascade");
        }
        if (i === 240) {
          const carrier = scene.enemies.find(e => enemyFamily(e.kind) === "parentheses");
          check(carrier?.parenthesisCargo?.length === 1, "Lost carrier fixture");
          const passenger = carrier.parenthesisCargo[0];
          life.damageEnemy(r, carrier, 1e8, "true");
          check(passenger.inPlay && scene.enemies.includes(passenger), "Passenger not released");
          const count = scene.enemies.length;
          life.damageEnemy(r, passenger, 1e8, "true");
          check(scene.enemies.length === count + 1, "Released ram did not split");
        }
        if (i === 300) life.removeTower(r, at(scene, "T", 5, 4));
      }
      tick(scenes);
      if (i % 60 === 0) {
        check(scenes.every(scene => scene.battleChecksum() === displayed.battleChecksum()), `Lifecycle diverged at ${i}`);
        exercised.push(i);
      }
    }
    const hash = displayed.battleChecksum();
    check(scenes.every(scene => scene.battleChecksum() === hash), "Continuation mismatch");
    for (const scene of scenes) game.scene.stop(scene.sys.settings.key);

    const bosses = [start("LifecycleBoss", { levelId: "5-10", seed: 301 }),
      start("LifecycleBossSilent", { levelId: "5-10", seed: 301 })];
    bosses[1].unitLifecycleRuntime().presentation = NO_UNIT_LIFECYCLE_PRESENTATION;
    for (const scene of bosses) {
      life.damageBoss(scene.unitLifecycleRuntime(), 1e10, "true");
      check(scene.bossPhaseIndex === 1 && scene.boss.hp > 0, "Actual Boss phase handoff failed");
    }
    for (let i = 0; i < 120; i++) tick(bosses);
    check(bosses[0].battleChecksum() === bosses[1].battleChecksum(), "Boss phase display changed state");
    const bossHash = bosses[0].battleChecksum();
    for (const scene of bosses) game.scene.stop(scene.sys.settings.key);
    return { checksum: hash, bossHash, tick: 600, exercised, mirror: true, sharedHealth: true, shell: true,
      passengers: true, splits: true, restored: true, phase: 2 };
  });
  assert.deepEqual(errors, []);
  console.log("Live lifecycle, detached presentation and restored continuation agree", result);
} finally { await browser.close(); }
