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
    const { getCardDefinition, getCardBehavior } = await import("/src/registry/cards.ts");
    const { createTower } = await import("/src/game/towers.ts");
    const { isCopyableDefinition } = await import("/src/game/towerCopy.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await import("/src/survivalSaves.ts");
    const { updateTowerProjectiles } = await import("/src/game/projectileRuntime.ts");
    const { removeTower } = await import("/src/game/unitLifecycle.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (ok, text) => { if (!ok) throw Error(text); };
    const selectedCards = ["!", "A", "E", "0", "1", "=", "x", "S", "d", "k"];
    let scene;
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-1", seed: 417, selectedCards });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000;
    };
    const place = (type, col, lane = 3, level = 1) => scene.spawnGeneratedTower(type, lane, col, level);
    const click = (col, lane = 3) => scene.submitBattleCommand({ type: "pointer", pointer: {
      x: c.BOARD_X + (col + .5) * c.CELL_WIDTH, y: c.BOARD_Y + (lane + .5) * c.CELL_HEIGHT,
      ctrl: false, shift: false, right: false } });
    const actions = () => scene.actionQueue.update(scene.battleTime, action => scene.executeBattleAction(action));
    const attach = tower => {
      // Apply locally; open pipes now transfer instant attachments just like other actions.
      const modes = scene.edgeTowers.map(edge => edge.mode);
      scene.edgeTowers.forEach(edge => { edge.mode = "!="; }); scene.numbers.sync();
      scene.cardStatesById.get("!").readyAt = 0;
      scene.submitBattleCommand({ type: "selectCard", id: "!" }); click(tower.column, tower.lane); actions();
      scene.edgeTowers.forEach((edge, index) => { edge.mode = modes[index]; }); scene.numbers.sync();
    };
    start();
    check(!isCopyableDefinition(getCardDefinition("!")), "Instant attachment can be copied by @");
    const money = scene.effectiveChars();
    scene.submitBattleCommand({ type: "selectCard", id: "!" }); click(8);
    check(scene.effectiveChars() === money && scene.cardStatesById.get("!").readyAt === 0, "Empty attachment consumed resources");
    for (const id of ["A", "a", "C", "E", "I", "J", "M", "Q", "W", "d", "z", "k"]) {
      const definition = getCardDefinition(id), tower = createTower(scene, definition, 0, 1, 0, 500);
      check(!getCardBehavior(id).canUse(tower, definition, 100000, scene.combatRuntime(), true), `${id} fires without the attachment`);
      tower.continuousAttack = true;
      check(getCardBehavior(id).canUse(tower, definition, 100000, scene.combatRuntime(), true), `${id} cannot free-fire with attachment`);
      tower.body.destroy();
    }
    for (const id of ["x", "V", "v", "K", "Z", "S", "F", "G", "H", "P", "p", "N", "q", "L", "n", "B", "D"]) {
      const definition = getCardDefinition(id), tower = createTower(scene, definition, 0, 1, 0, 500);
      tower.continuousAttack = true;
      check(!getCardBehavior(id).canUse(tower, definition, 100000, scene.combatRuntime(), true), `${id} bypassed a required target or became an auto skill`);
      tower.body.destroy();
    }
    const source = place("A", 1), bank = place("0", 2); place("1", 3);
    scene.edgeTowers.push({ type: "=", axis: "horizontal", column: 1, lane: 3 }, { type: "=", axis: "horizontal", column: 2, lane: 3 });
    scene.numbers.sync();
    attach(source);
    check(Math.abs(scene.effectiveChars() - money + 200) < 1e-6 && source.continuousAttack && scene.towers.length === 3,
      "Attachment not consumed onto the existing tower");
    check(scene.cardStatesById.get("!").readyAt === scene.cardTimeFor("!") + 30000, "Base cooldown is not 30 seconds");
    check(source.body.getByName("continuous-attack"), "Missing permanent attachment marker");
    source.lastFire = 0; const before = source.lastFire;
    scene.updateTowers(before + 1999); check(source.lastFire === before, "Attachment accelerated attack cadence");
    scene.battleTime = before + 2000; scene.updateTowers(scene.battleTime); actions();
    updateTowerProjectiles(scene.projectileRuntime(), 0);
    check(bank.projectileBank.shots.length === 1, "Free-fired projectile did not enter circuit without enemies");
    scene.updateTowers(scene.battleTime); actions(); updateTowerProjectiles(scene.projectileRuntime(), 0);
    check(bank.projectileBank.shots.length === 1, "Free-fire repeats every frame instead of respecting cadence");
    scene.extraction.restore(600); attach(source);
    check(scene.cardStatesById.get("!").readyAt === scene.cardTimeFor("!") + 10000, "Level 3 attachment did not refund cooldown to 10 seconds");
    check(source.body.list.filter(child => child.name === "continuous-attack").length === 1, "Repeated attachments stacked markers");
    scene.submitBattleCommand({ type: "selectCard", id: "A" }); click(1);
    check(source.level === 2 && source.continuousAttack, "Upgrade lost permanent attachment");
    scene.shifter.setActive(true); scene.shifter.handlePointer(3, 1, source, false); scene.shifter.handlePointer(2, 1, undefined, false);
    check(source.lane === 2 && source.continuousAttack && source.body.getByName("continuous-attack"), "Moving lost attachment");
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards, graph: snapshot });
    const run = delta => {
      start(); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
      const restored = scene.towers.find(t => t.type === "A");
      check(restored.continuousAttack && restored.body.getByName("continuous-attack"), "Save lost attachment or its visual");
      scene.battlePaused = false;
      while (scene.simulation.tick < 150) scene.update(0, delta);
      return scene.battleChecksum();
    };
    const hash = run(1000 / 60); check(run(1000 / 144) === hash, "Continuous fire is frame-rate dependent");
    const removed = scene.towers.find(t => t.type === "A"), lane = removed.lane, col = removed.column;
    removeTower(scene.unitLifecycleRuntime(), removed);
    check(!place("A", col, lane).continuousAttack, "Attachment leaked to a replacement tower");
    start();
    const visual = place("E", 1, 3, 3); place("0", 2); place("+", 3);
    scene.edgeTowers.push({ type: "=", axis: "horizontal", column: 1, lane: 3 }, { type: "=", axis: "horizontal", column: 2, lane: 3 });
    scene.numbers.sync(); attach(visual);
    scene.submitBattleCommand({ type: "selectCard", id: "A" }); scene.battlePaused = true;
    scene.syncPlacementGhost(); scene.updateHud(); scene.updateCards();
    game.loop.start(game.step.bind(game));
    return { hash };
  });
  await page.waitForTimeout(150); await page.screenshot({ path: "logs/continuous-attack-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/continuous-attack-small.png" });
  assert.deepEqual(errors, []); console.log("Continuous attack browser checks passed", result);
} finally { await browser.close(); }
