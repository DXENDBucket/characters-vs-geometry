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
    const { createEnemy } = await import("/src/game/enemyFactory.ts");
    const { createEnemyProjectile } = await import("/src/game/projectiles.ts");
    const { updateEnemySkills } = await import("/src/game/enemySupport.ts");
    const { oscillationTarget } = await import("/src/game/oscillatingMovement.ts");
    const { collectParenthesisPassengers } = await import("/src/game/parenthesisEnemies.ts");
    const { syncEnemyVisualScale } = await import("/src/game/enemyBehaviors.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (ok, text) => { if (!ok) throw Error(text); };
    let scene;
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-1", seed: 417, selectedCards: ["0", "1", "-", "+", "=", "A", "E", "i", "w"] });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000;
    };
    const place = (type, col, lane = 3, level = 1) => scene.spawnGeneratedTower(type, lane, col, level);
    const click = (col, lane = 3) => scene.submitBattleCommand({ type: "pointer", pointer: {
      x: c.BOARD_X + (col + .5) * c.CELL_WIDTH, y: c.BOARD_Y + (lane + .5) * c.CELL_HEIGHT,
      shift: false, ctrl: false, right: false } });
    const flush = () => { for (let i = 0; i < 8; i++) { scene.battleTime += 100; scene.actionQueue.update(scene.battleTime, action => scene.executeBattleAction(action)); } };
    const spawn = (kind, lane = 3, x = c.BOARD_X + 600) => {
      const e = createEnemy(scene, { kind, lane, x, time: scene.battleTime, waveNumber: 1, waveWeight: 1, finalDamageReduction: 0 });
      scene.enemies.push(e); return e;
    };

    start();
    const a = place("A", 0); place("=", 1, 3, 2); const zero = place("0", 2); place("=", 3); const e = place("E", 4);
    for (let i = 0; i < 3; i++) scene.numbers.record(a, { kind: "attack" });
    scene.numbers.record(e, { kind: "attack" }); flush();
    check(scene.projectiles.length === 0 && zero.label.text === "0" && zero.levelText.text === "S4", "Zero did not store/render counters");
    scene.submitBattleCommand({ type: "selectCard", id: "A" }); click(2); flush();
    const shots = scene.projectiles.filter(p => p.sourceTower === zero);
    check(shots.filter(p => p.sourceBehaviorType === "A").reduce((s, p) => s + (p.hitCount ?? 1), 0) === 6, "Stored A did not use its own count times equals multiplier");
    check(shots.filter(p => p.sourceBehaviorType === "E").length === 6, "Stored E did not release separately at level 2");
    check(zero.numberMemory.every(entry => entry.count === 0) && zero.levelText.text === "S0", "Release did not clear counters");
    click(2); flush(); check(scene.projectiles.length === shots.length, "Empty zero repeated release");
    scene.submitBattleCommand({ type: "selectCard", id: "0" }); click(2);
    check(zero.type === "0" && zero.level === 2 && zero.label.text === "1", "Zero upgrade did not take priority or increase number");

    start();
    const source = place("A", 0); place("=", 1, 3, 2); place("1", 2, 3, 3);
    const minus = place("-", 3, 3, 3); place("1", 4, 3, 3); const plus = place("+", 5); place("1", 6, 3, 2);
    check(minus.numberValue === 0 && plus.numberValue === 5, "Local mixed arithmetic wrong");
    for (let i = 0; i < 2; i++) scene.numbers.record(source, { kind: "attack" });
    scene.submitBattleCommand({ type: "selectCard", id: "A" }); click(3); flush();
    check(scene.projectiles.filter(p => p.sourceTower === minus).reduce((s, p) => s + (p.hitCount ?? 1), 0) === 8,
      "Computed zero did not release at count times operator/equals multiplier");

    start();
    const ice = place("i", 0); place("=", 1); const iceZero = place("0", 2);
    scene.triggerShockTower(ice); flush();
    check(!ice.inPlay && iceZero.inPlay && iceZero.numberMemory[0].count === 1, "Zero lost one-shot source action");
    scene.numbers.release(iceZero); flush(); check(iceZero.inPlay && iceZero.numberMemory[0].count === 0, "Stored explosion consumed zero");
    const w = place("w", 4); place("=", 3);
    scene.numbers.record(w, { kind: "skill" }); scene.numbers.record(w, { kind: "skill" });
    scene.numbers.release(iceZero); flush(); scene.towerSkills.update(0, scene.battleTime);
    check(iceZero.imitatedSkillLevels.w === 2 && iceZero.skills.airPatrol.activeUntil > scene.battleTime, "Stored skill lost its level after clearing counts");

    start();
    const reflector = place("R", 0); place("=", 1); place("0", 2);
    const shooter = spawn("shootingTriangle"), reflected = createEnemyProjectile(scene, shooter, scene.battleTime);
    scene.numbers.record(reflector, { kind: "reflection", projectile: reflected }); reflected.body.destroy();
    const reflectionSave = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    start(); scene.applyBattleSave(restoreBattleSnapshot(scene, reflectionSave));
    const reflectionZero = scene.towers.find(t => t.type === "0");
    check(!reflectionZero.numberMemory[0].storedEvent.projectile.body.scene, "Stored reflection restored a stray projectile visual");
    scene.numbers.release(reflectionZero); flush();
    check(scene.projectiles.length === 1 && scene.projectiles[0].sourceTower === reflectionZero, "Stored reflection failed after save/restore");

    start();
    const savedA = place("A", 0); place("=", 1); const savedZero = place("0", 2); place("=", 3);
    place("1", 4, 3, 3); place("-", 5); place("1", 6, 3, 3);
    for (let i = 0; i < 4; i++) scene.numbers.record(savedA, { kind: "attack" });
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards: ["0", "1", "-", "=", "A"], graph: snapshot });
    const run = delta => {
      start(); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
      const restored = scene.towers.find(t => t.type === "0");
      check(restored.numberMemory[0].count === 4 && restored.levelText.text === "S4", "Save lost stored actions");
      scene.submitBattleCommand({ type: "selectCard", id: "A" }); click(2);
      scene.battlePaused = false;
      while (scene.simulation.tick < 120) scene.update(0, delta);
      return scene.battleChecksum();
    };
    const hash = run(1000 / 60); check(run(1000 / 144) === hash, "Zero release/resume depends on frame rate");

    start();
    const crossA = place("A", 0); place("=", 1, 3, 2); place("1", 2, 3, 3);
    const cross = place("-", 3, 3, 2); place("1", 4, 3, 5);
    const crossE = place("E", 3, 0); place("=", 3, 1, 3); place("1", 3, 2, 4); place("1", 3, 4, 4);
    for (let i = 0; i < 3; i++) scene.numbers.record(crossA, { kind: "attack" });
    for (let i = 0; i < 2; i++) scene.numbers.record(crossE, { kind: "attack" });
    flush();
    check(cross.levelText.text === "H 2x3\nV 0:2", "Crossing operator did not display both channels");
    const crossSave = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards: ["0", "1", "-", "=", "A", "E"], graph: crossSave });
    start(); scene.applyBattleSave(restoreBattleSnapshot(scene, crossSave));
    const restoredCross = scene.towers.find(t => t.type === "-");
    const h = restoredCross.numberChannels.horizontal, v = restoredCross.numberChannels.vertical;
    check(h.numberValue === 2 && h.equationLevel === 2 && h.numberMemory.length === 1 && h.numberMemory[0].type === "A" && h.numberMemory[0].count === 1,
      "Save mixed horizontal memories or counters");
    check(v.numberValue === 0 && v.equationLevel === 3 && v.numberMemory.length === 1 && v.numberMemory[0].type === "E" && v.numberMemory[0].count === 2,
      "Save mixed vertical memories or counters");
    scene.submitBattleCommand({ type: "selectCard", id: "A" }); click(3); flush();
    check(v.numberMemory[0].count === 0 && h.numberMemory[0].count === 1 && restoredCross.levelText.text === "H 2x3\nV 0:0",
      "Clicking crossing zero cleared the automatic channel");
    check(scene.projectiles.some(p => p.sourceTower === restoredCross && p.sourceBehaviorType === "E"), "Vertical zero failed to imitate after restore");

    start();
    const heart = spawn("heart"), wave = spawn("tilde", 3, heart.x + 10), other = spawn("triangle", 1, heart.x + 10);
    wave.y = heart.y + c.CELL_HEIGHT * .25; wave.lane = heart.lane;
    wave.oscillationCenterY = wave.y - 20; wave.oscillationLastY = wave.y; wave.oscillationPhase = 1;
    heart.skills.lead = { sp: 999, spBuffer: 0, activeUntil: 0 };
    updateEnemySkills(scene.combatRuntime(), 0, scene.battleTime);
    check(wave.y === heart.y && wave.oscillationCenterY === heart.y && oscillationTarget(wave, 0).y === heart.y,
      "Heart did not align same-row tilde or reset its old path");
    check(other.y === heart.y && other.lane === heart.lane, "Heart no longer pulls ordinary enemies directly to its row");

    start();
    const displayA = place("A", 1); place("=", 2, 3, 2); place("1", 3, 3, 3);
    place("-", 4, 3, 2); place("1", 5, 3, 5); place("=", 6); const displayZero = place("0", 7);
    const displayE = place("E", 4, 0); place("=", 4, 1, 3); place("1", 4, 2, 4); place("1", 4, 4, 4);
    for (let i = 0; i < 7; i++) scene.numbers.record(displayA, { kind: "attack" });
    for (let i = 0; i < 2; i++) scene.numbers.record(displayE, { kind: "attack" });
    for (let index = 0; index < 3; index++) {
      const host = spawn("parentheses", index * 2, c.BOARD_X + 750);
      const cargo = spawn("triangle", host.lane, host.x); spawn("circle", host.lane, host.x);
      collectParenthesisPassengers(host, scene.enemies, scene.battleTime);
      const x = cargo.x, width = host.shape.getData("parenthesisFrame").getData("width");
      host.hp = host.maxHp * (1 - index * .4); syncEnemyVisualScale(host);
      const frame = host.shape.getData("parenthesisFrame");
      check(frame.getData("width") === width && cargo.x === x && Math.abs(frame.getData("hpScale") - (1 - index * .24)) < 1e-9,
        "Parenthesis damage changed spacing or failed to shrink each glyph");
    }
    check(displayZero.levelText.text === "S7", "Final zero display wrong");
    scene.battlePaused = true; scene.updateHud(); scene.updateCards(); game.loop.start(game.step.bind(game));
    return { hash };
  });
  await page.waitForTimeout(150); await page.screenshot({ path: "logs/ascii-operators-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/ascii-operators-small.png" });
  assert.deepEqual(errors, []); console.log("ASCII operators browser checks passed", result);
} finally { await browser.close(); }
