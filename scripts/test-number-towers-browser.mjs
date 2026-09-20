// Requires Vite; accepts --playwright=<module path> and --browser=<executable>.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const result = await page.evaluate(async () => {
    const progress = await import("/src/progress.ts");
    const config = await import("/src/config.ts");
    const { spawnEnemyAt } = await import("/src/game/enemyRuntime.ts");
    const { towerFinalStats } = await import("/src/game/unitStats.ts");
    const { upgradeTowerLevel } = await import("/src/game/towers.ts");
    const { gatheringIsActive, gatherProjectile } = await import("/src/game/gathering.ts");
    const { createEnemyProjectile, createMortarProjectile } = await import("/src/game/projectiles.ts");
    const { updateEnemyProjectiles, updateMortarProjectiles } = await import("/src/game/projectileRuntime.ts");
    const { redirectOrientedTarget } = await import("/src/game/orientation.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await import("/src/survivalSaves.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.completeAllLevels(); progress.unlockAllCards();
    const check = (condition, message) => { if (!condition) throw Error(message); };
    let scene;
    const start = (data = {}) => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "AE-3", seed: 113, selectedCards: ["=", "1", "A", "b", "i", "w", "S", "#", "j", "o"], ...data });
      scene = game.scene.getScene("GameScene");
      return scene;
    };
    const place = (id, column, lane = 3, level = 1) => scene.spawnGeneratedTower(id, lane, column, level);
    const flush = (count = 4, step = 200) => {
      for (let i = 0; i < count; i++) {
        scene.battleTime += step;
        scene.actionQueue.update(scene.battleTime, action => scene.executeBattleAction(action));
      }
    };
    const attack = tower => scene.startTowerVolley(tower, scene.battleTime, scene.towerAttackInterval(tower));
    const spawn = (kind, lane, x) => {
      spawnEnemyAt(scene.combatRuntime(), { kind, lane, x, time: scene.battleTime, waveNumber: 1, waveWeight: 10, finalDamageReduction: 0 });
      return scene.enemies.at(-1);
    };
    const setup = (type, n = 1) => {
      start();
      const source = place(type, 1); place("=", 2); const number = place("1", 3, 3, n);
      return { source, number };
    };

    start();
    const a = place("A", 0), connector = place("=", 1), one = place("1", 2);
    place("=", 3); const two = place("1", 4, 3, 2), e = place("E", 6); place("=", 5);
    const unrelated = place("A", 10);
    attack(unrelated); flush();
    check(one.numberMemory.every(entry => entry.count === 0), "Unrelated A counted");
    attack(a); flush();
    check(scene.projectiles.filter(p => p.sourceTower === one).length === 1, "n=1 did not imitate one volley");
    check(scene.projectiles.filter(p => p.sourceTower === two).length === 0, "n=2 acted early");
    attack(a); flush();
    check(scene.projectiles.filter(p => p.sourceTower === two).length === 2, "n=2 did not fire at level 2");
    attack(e); flush();
    check(one.numberMemory.find(entry => entry.type === "E").count === 0 && two.numberMemory.find(entry => entry.type === "E").count === 1, "Independent type counters");
    scene.triggerTowerRuntime().removeTower(connector); scene.updateLevelAuras();
    attack(a); flush();
    check(two.numberMemory.find(entry => entry.type === "A").count === 1, "Disconnect forgot the source");
    check(two.label.text === "2" && !two.levelText.visible && two.hp === 1200 && towerFinalStats(two).attackPower === 0, "Number panel/label mutated");

    let pair = setup("d", 2);
    attack(pair.source); attack(pair.source);
    flush(1, 0); // Queue the level-2 copy; then change the physical number before its shot.
    upgradeTowerLevel(pair.number, 3); scene.updateLevelAuras();
    const victim = spawn("circle", 3, pair.number.x + 100);
    flush();
    check(victim.hp === 2280, "Queued d imitation lost its level-2 720 magic damage");
    check(pair.number.label.text === "5" && pair.number.maxHp === 1200, "Upgrade must change only the number");

    pair = setup("x");
    spawn("circle", 3, pair.number.x + 150); attack(pair.source); flush();
    check(scene.projectiles.filter(p => p.sourceTower === pair.number).every(p => p.sourceBehaviorType === "x"), "Copied x lost the ground damage rule");

    pair = setup("i");
    const frozen = spawn("circle", 3, pair.number.x + 120);
    scene.triggerShockTower(pair.source); flush();
    check(!pair.source.inPlay && pair.number.inPlay && pair.number.hp === 1200, "Imitated explosion consumed its number tower");
    check(frozen.statusEffects.some(effect => effect.name === "frozen"), "Imitated freeze did not hit");
    check(!scene.actionQueue.snapshot().length, "Recursive explosion imitation");

    pair = setup("w"); pair.source.skills.airPatrol.sp = 10;
    scene.towerSkills.tryActivateManualSkill(pair.source, { x: 0, y: 0, allReady: false }); flush();
    check(pair.number.flyingUntil > scene.battleTime && pair.number.flyingHalo.visible, "w skill did not transfer");
    scene.battleTime = pair.number.flyingUntil + 1; scene.towerSkills.update(.02, scene.battleTime);
    check(pair.number.flyingUntil === 0 && !pair.number.flyingHalo.visible, "Numeric flight never expired");

    for (const [type, key] of [["j", "gathering"], ["o", "orientation"]]) {
      pair = setup(type); pair.source.skills[key] = { sp: 10, spBuffer: 0, activeUntil: 0 };
      scene.towerSkills.tryActivateManualSkill(pair.source, { x: 0, y: 0, allReady: false }); flush();
      scene.towerSkills.update(.02, scene.battleTime);
      check(pair.number.skills[key].activeUntil > scene.battleTime && !!pair.number.rangeBorder, `${type} did not activate with a range`);
      if (type === "j") {
        check(gatheringIsActive(pair.number, scene.battleTime), "Numeric gathering is not active");
        const shot = { x: pair.number.x, y: pair.number.y - config.CELL_HEIGHT, lane: 2, body: { setPosition() {} } };
        const hp = pair.number.hp;
        check(gatherProjectile(scene.projectileRuntime(), [pair.number], shot, shot.x - 50, shot.y), "Numeric gathering did not move a shot");
        check(shot.y === pair.number.y && pair.number.hp === hp - 100, "Gathering cost/position");
      } else {
        const protectedTower = place("A", 4);
        check(redirectOrientedTarget([pair.number], protectedTower, scene.battleTime) === pair.number, "Numeric orientation did not protect");
      }
    }

    pair = setup("S"); pair.source.skills.spellMortar = { sp: 30, spBuffer: 0, activeUntil: 0 };
    scene.towerSkills.activateSpellMortarTargeting([pair.source], 950, 300);
    scene.towerSkills.fireSelectedSpellMortars(950, 300); flush(8, 400);
    const flights = scene.towerSkills.snapshotFlights().filter(f => f.source === pair.number);
    check(flights.length === 3 && flights.every(f => f.targetX === 950 && f.targetY === 300 && f.damage === 5000), "Numeric S lost target/damage/burst");

    pair = setup("#"); const leftBox = place("B", 1, 2), rightBox = place("B", 3, 2);
    pair.source.skills.push = { sp: 30, spBuffer: 0, activeUntil: 0 };
    scene.towerPush.begin(pair.source); scene.towerPush.choose(2, 1); flush();
    check(leftBox.lane === 1 && rightBox.lane === 1 && pair.number.inPlay, "Numeric push did not copy direction");

    pair = setup("A");
    // Learn a transient b action from the original side of the connector.
    scene.chars = 100000; scene.submitBattleCommand({ type: "selectCard", id: "b" });
    check(scene.targetedEffects.use(scene.getDefinition("b"), pair.source.lane, pair.source.column, pair.source) === "handled", "b deployment failed"); flush();
    check(pair.number.facingDirection === -1 && pair.number.inPlay, "Transient b effect was not learned/copied");

    pair = setup("R");
    const shooter = spawn("shootingTriangle", 3, pair.source.x + 200);
    const incoming = createEnemyProjectile(scene, shooter, scene.battleTime, 2);
    incoming.x = pair.source.x; incoming.y = pair.source.y;
    scene.enemyProjectiles.push(incoming);
    updateEnemyProjectiles(scene.projectileRuntime(), 0); flush();
    const reflected = scene.projectiles.find(p => p.sourceTower === pair.number);
    check(reflected?.damage === incoming.damage && reflected.hitCount === 2 && reflected.x === pair.number.x,
      "Numeric R did not reflect a shot from its own position");
    const mortar = createMortarProjectile(scene, { owner: "enemy", fromX: shooter.x, fromY: shooter.y,
      sourceEnemy: shooter, targetX: pair.source.x, targetY: pair.source.y,
      damage: 50, damageType: "magic", rangeX: 10, rangeY: 10 });
    mortar.progress = 1; scene.mortarProjectiles.push(mortar);
    updateMortarProjectiles(scene.projectileRuntime(), 0);
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards: ["=", "1", "R"], graph: captureBattleSnapshot(scene.battleState()) });
    flush();
    check(scene.mortarProjectiles.some(p => p.sourceTower === pair.number && p.targetEnemy === shooter && p.damage === 50),
      "Numeric R did not reflect mortar fire");

    pair = setup("X", 2);
    const funds = scene.chars; attack(pair.source); attack(pair.source); flush();
    check(scene.chars > funds && pair.number.inPlay, "Numeric production failed");

    start({ levelId: "IF-1" });
    const savedSource = place("A", 1); place("=", 2); place("E", 3); place("=", 4);
    const savedNumber = place("1", 5);
    check(savedNumber.numberMemory.some(entry => entry.type === "A" && entry.sourceIds.includes(savedSource.id)),
      "A=E=1 did not learn the remote A");
    attack(savedSource); // Save pending original and imitation actions.
    check(scene.actionQueue.snapshot().some(entry => entry.action.type === "imitation" && entry.action.tower === savedNumber),
      "Remote source did not trigger its number tower");
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards: ["=", "1", "A"], graph: snapshot });
    const run = deltas => {
      start({ levelId: "IF-1" }); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
      scene.battlePaused = false;
      let i = 0;
      while (scene.simulation.tick < 120) scene.update(0, deltas[i++ % deltas.length]);
      check(scene.simulation.tick === 120, "Wrong tick");
      return scene.battleChecksum();
    };
    const hash = run([1000 / 60]);
    check(run([1000 / 30]) === hash && run([1000 / 144]) === hash, "Number save/resume determinism failed");

    start();
    for (const [id, column, lane, n] of [["A", 2, 2, 1], ["=", 3, 2, 1], ["1", 4, 2, 1], ["=", 5, 2, 1], ["1", 6, 2, 2],
      ["A", 2, 4, 1], ["=", 3, 4, 1], ["1", 4, 4, 12], ["=", 5, 4, 1], ["E", 6, 4, 1]]) place(id, column, lane, n);
    scene.battlePaused = true; game.loop.start(game.step.bind(game));
    return { hash };
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/number-towers-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/number-towers-small.png" });
  assert.deepEqual(errors, []);
  console.log("Number tower browser checks passed", result);
} finally { await browser.close(); }
