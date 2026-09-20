import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const result = await page.evaluate(async () => {
    const progress = await import("/src/progress.ts"), c = await import("/src/config.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await import("/src/survivalSaves.ts");
    const { updateTowerProjectiles } = await import("/src/game/projectileRuntime.ts");
    const { createTowerProjectile } = await import("/src/game/projectiles.ts");
    const { removeTower } = await import("/src/game/unitLifecycle.ts");
    const { edgePosition } = await import("/src/game/projectileCircuit.ts");
    const { findAutoUpgradeTarget, setTowerAutoUpgradeState, setTowerFacing } = await import("/src/game/towers.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (ok, text) => { if (!ok) throw Error(text); };
    let scene;
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-1", seed: 417, selectedCards: ["A", "E", "0", "1", "=", "F", "S", "x", "B"] });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000;
    };
    const place = (type, col, lane = 3, level = 1) => scene.spawnGeneratedTower(type, lane, col, level);
    const pointer = (x, y) => scene.submitBattleCommand({ type: "pointer", pointer: { x, y, ctrl: false, shift: false, right: false } });
    const click = (col, lane = 3) => pointer(c.BOARD_X + (col + .5) * c.CELL_WIDTH, c.BOARD_Y + (lane + .5) * c.CELL_HEIGHT);
    const link = (column, lane = 3, axis = "horizontal") => {
      scene.submitBattleCommand({ type: "selectCard", id: "=" });
      scene.cardStatesById.get("=").readyAt = 0;
      const p = edgePosition({ type: "=", column, lane, axis }); pointer(p.x, p.y);
    };
    const drain = () => { for (let i = 0; i < 12; i++) { scene.battleTime += 100;
      scene.actionQueue.update(scene.battleTime, action => scene.executeBattleAction(action)); } };
    start();
    const source = place("A", 1, 3, 3), bank = place("0", 2), outlet = place("1", 3);
    link(1); link(2);
    check(scene.edgeTowers.length === 2 && scene.towers.length === 3 && scene.occupied.size === 3, "Equals occupied a cell or became attackable");
    const money = scene.chars; link(2); check(scene.chars === money && scene.edgeTowers.length === 2, "Duplicate edge charged money");
    check(scene.spawnGeneratedTower("=", 1, 1, 1) === null, "Special connector was generated as a regular tower");
    scene.submitBattleCommand({ type: "selectCard", id: "=" }); click(5);
    check(scene.edgeTowers.length === 2, "Equals deployed in a cell center");
    scene.startTowerVolley(source, scene.battleTime, scene.towerAttackInterval(source)); drain();
    check(scene.projectiles.length === 3, "Source attack failed");
    updateTowerProjectiles(scene.projectileRuntime(), 0);
    check(scene.projectiles.length === 0 && bank.projectileBank.shots.length === 3 && bank.levelText.text === "3/128", "Real volley not captured/displayed");
    scene.submitBattleCommand({ type: "selectCard", id: "A" }); click(2);
    for (let i = 0; i < 3; i++) { scene.numbers.update(); scene.battleTime += 40; }
    check(scene.projectiles.length === 3 && bank.projectileBank.shots.length === 0, "Release duplicated or lost shots");
    check(scene.projectiles.every(p => p.x === outlet.x + 26 && p.sourceTower === source && p.circuitChecked), "Output location or attribution wrong");
    check(scene.projectiles.reduce((sum, p) => sum + p.damage * p.hitCount, 0) === 1200, "Circuit changed damage or armor judgments");
    updateTowerProjectiles(scene.projectileRuntime(), 0); check(bank.projectileBank.shots.length === 0, "Released shots re-entered the bank");
    bank.autoUpgrade = true; outlet.autoUpgrade = true;
    check(findAutoUpgradeTarget(scene.towers, "0") === undefined && findAutoUpgradeTarget(scene.towers, "1") === undefined, "Saved auto-upgrade flags still upgrade numbers");
    setTowerAutoUpgradeState(bank, true); check(!bank.autoUpgrade && !bank.autoUpgradeBorder.visible, "Numeric auto-upgrade enabled");

    const edgePoint = edgePosition(scene.edgeTowers[1]); scene.eraserMode = true; pointer(edgePoint.x, edgePoint.y);
    check(scene.edgeTowers.length === 1 && outlet.inPlay && bank.inPlay, "Erasing an edge removed an adjacent tower");
    const raw = createTowerProjectile(scene, { type: "bolt", x: source.x + 26, y: source.y, lane: source.lane,
      speed: 500, damage: 400, damageType: "physical", splashRadius: 0, angleDegrees: 0, maxX: source.x + 226, sourceTower: source });
    scene.projectiles.push(raw); updateTowerProjectiles(scene.projectileRuntime(), 0);
    check(scene.projectiles.includes(raw), "Broken circuit swallowed a projectile");
    link(2); raw.circuitChecked = false; updateTowerProjectiles(scene.projectileRuntime(), 0);
    check(bank.projectileBank.shots.length === 1, "Reconnected circuit failed");
    setTowerFacing(outlet, -1); scene.numbers.release(bank); scene.numbers.update();
    const redirected = scene.projectiles.at(-1);
    check(redirected.vx < 0 && redirected.maxX === redirected.x - 200, "Output facing or finite remaining range changed");

    const pool = scene.extraction; pool.restore(6000);
    const preserved = bank.id; scene.cardStatesById.get("1").readyAt = 0;
    scene.submitBattleCommand({ type: "selectCard", id: "1" }); click(2);
    check(bank.id === preserved && bank.type === "1" && bank.level === 1 && pool.value === 6000, "Zero-to-one conversion skipped 1 or consumed extraction pool");
    check(scene.cardStatesById.get("1").readyAt === scene.cardTimeFor("1") + 10000, "Numeric cooldown is not 10 seconds");

    start();
    const spell = place("S", 1), spellBank = place("0", 2); place("1", 3); link(1); link(2);
    spell.skills.spellMortar = { sp: 30, spBuffer: 0, activeUntil: 0 };
    scene.towerSkills.activateSpellMortarTargeting([spell], 950, 300);
    scene.towerSkills.fireSelectedSpellMortars(950, 300); drain();
    check(spellBank.projectileBank.shots.length === 0 && scene.actionQueue.snapshot().every(e => e.action.type !== "imitation"),
      "S skill still creates stored or copied actions");
    check(scene.towerSkills.snapshotFlights().every(f => f.source === spell), "S created a free skill at another tower");

    start();
    const ice = place("i", 1), iceBank = place("0", 2); place("1", 3); link(1); link(2);
    scene.triggerShockTower(ice); drain();
    check(!ice.inPlay && iceBank.inPlay && iceBank.projectileBank.shots.length === 0,
      "A self-consuming skill still gets learned by zero");

    start();
    const a = place("A", 1), zero = place("0", 2), exit = place("1", 3); link(1); link(2);
    scene.startTowerVolley(a, scene.battleTime, scene.towerAttackInterval(a)); drain(); updateTowerProjectiles(scene.projectileRuntime(), 0);
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards: ["A", "0", "1", "="], graph: snapshot });
    const run = delta => {
      start(); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
      const stored = scene.towers.find(t => t.type === "0");
      check(scene.edgeTowers.length === 2 && stored.projectileBank.shots.length === 1, "Save lost edges or bank");
      scene.battlePaused = false; scene.submitBattleCommand({ type: "selectCard", id: "A" }); click(2);
      while (scene.simulation.tick < 90) scene.update(0, delta);
      return scene.battleChecksum();
    };
    const hash = run(1000 / 60); check(run(1000 / 144) === hash, "Circuit release is frame-rate dependent");
    const stale = scene.towers.find(t => t.type === "0"); removeTower(scene.unitLifecycleRuntime(), stale);
    check(scene.edgeTowers.length === 2, "Destroying ordinary tower removed special connectors");

    start();
    const e = place("E", 1, 2, 3); const visualBank = place("0", 2, 2); place("1", 3, 2);
    link(1, 2); link(2, 2); place("1", 2, 3, 3); link(2, 2, "vertical");
    scene.startTowerVolley(e, scene.battleTime, scene.towerAttackInterval(e)); drain(); updateTowerProjectiles(scene.projectileRuntime(), 0);
    place("B", 6, 2); place("B", 6, 3);
    check(visualBank.projectileBank.shots.length === 9, "Spread volley not stored independently");
    scene.submitBattleCommand({ type: "selectCard", id: "A" });
    scene.syncPlacementGhost(); scene.battlePaused = true; scene.updateHud(); scene.updateCards();
    game.loop.start(game.step.bind(game)); return { hash, stored: visualBank.projectileBank.shots.length };
  });
  await page.waitForTimeout(150); await page.screenshot({ path: "logs/projectile-circuit-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/projectile-circuit-small.png" });
  assert.deepEqual(errors, []); console.log("Projectile circuit browser checks passed", result);
} finally { await browser.close(); }
