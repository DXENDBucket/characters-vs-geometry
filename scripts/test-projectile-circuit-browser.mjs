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
    const { createTowerProjectile, createMortarProjectile } = await import("/src/game/projectiles.ts");
    const { updateMortarProjectiles, updateTowerProjectiles } = await import("/src/game/projectileRuntime.ts");
    const { projectileDamageBudget } = await import("/src/game/projectileIntegrity.ts");
    const { edgePosition } = await import("/src/game/projectileCircuit.ts");
    const { setTowerFacing } = await import("/src/game/towers.ts");
    const { createEnemy } = await import("/src/game/enemyFactory.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (ok, text) => { if (!ok) throw Error(text); };
    const selectedCards = ["A", "E", "0", "1", "=", "+", "-", "!", "B", "S"];
    let scene;
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-1", seed: 417, selectedCards });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000;
    };
    const place = (type, col, lane = 3, level = 1) => scene.spawnGeneratedTower(type, lane, col, level);
    const pointer = (x, y) => scene.submitBattleCommand({ type: "pointer", pointer: { x, y, ctrl: false, shift: false, right: false } });
    const select = id => scene.submitBattleCommand({ type: "selectCard", id });
    const link = (column, lane = 3, axis = "horizontal") => {
      select("="); scene.cardStatesById.get("=").readyAt = 0;
      const p = edgePosition({ type: "=", column, lane, axis }); pointer(p.x, p.y);
      return scene.edgeTowers.find(e => e.column === column && e.lane === lane && e.axis === axis);
    };
    const tick = (dt = 40) => { scene.battleTime += dt; scene.numbers.update(); };
    const capture = (source, hits = 1) => {
      const shot = createTowerProjectile(scene, { type: "bolt", x: source.x + 26, y: source.y, lane: source.lane,
        speed: 500, damage: 400, hitCount: hits, damageType: "physical", splashRadius: 0, angleDegrees: 0,
        maxX: source.x + 326, sourceTower: source });
      const result = scene.numbers.capture(shot);
      if (!result) shot.body.destroy();
      return result;
    };
    start();
    const source = place("A", 1), bank = place("0", 2), plus = place("+", 3), outlet = place("1", 4, 3, 2);
    const edge = link(1); link(2).mode = ">"; link(3);
    check(scene.towers.length === 4 && scene.occupied.size === 4 && edge.level === 1, "Connector occupies a regular cell");
    const money = scene.effectiveChars(); link(1);
    check(edge.level === 2 && Math.abs(scene.effectiveChars() - money + 50) < 1e-6, "Stacking = failed to upgrade");
    select("A"); const p = edgePosition(edge);
    for (const mode of [">", "<", "!="]) { pointer(p.x, p.y); check(edge.mode === mode, "Connector mode cycle failed"); }
    check(!capture(source) && !bank.projectileBank.shots.length, "Closed connector swallowed source shot");
    pointer(p.x, p.y); check(edge.mode === "=", "Connector did not return to bidirectional");
    scene.autoUpgradeMode = true; pointer(p.x, p.y);
    check(edge.autoUpgrade, "Cannot mark connector for automatic upgrades");
    scene.autoUpgradeMode = false; scene.cardStatesById.get("=").readyAt = 0; scene.attemptAutoUpgrades();
    check(edge.level === 3 && edge.mode === "=", "Automatic connector upgrade reset mode or failed");
    edge.autoUpgrade = false;
    for (let i = 0; i < 5; i++) check(capture(source, i === 0 ? 2 : 1), "Source capture failed");
    check(bank.projectileBank.shots.length === 5 && !scene.projectiles.length, "Source skipped local buffer");
    tick(); check(!bank.projectileBank.shots.length && plus.projectileNode.processing?.count === 5, "Zero did not automatically forward");
    tick(199); check(!outlet.projectileNode.input.length, "Processor completed too early");
    tick(1); check(outlet.projectileNode.input.length === 1 && !scene.projectiles.length, "Outlet fired an incomplete batch");
    for (let i = 0; i < 5; i++) capture(source);
    tick(); tick(200);
    check(scene.projectiles.length === 2 && scene.projectiles[0].hitCount === 6 && scene.projectiles[1].hitCount === 5,
      "Full batch lost multi-hit payload or did not fire together");
    check(scene.projectiles.every(shot => shot.x === outlet.x + 26 && shot.circuitChecked), "Wrong outlet position or recapture flag");
    const bundled = scene.projectiles.shift(); scene.projectiles[0].body.destroy(); scene.projectiles = [bundled];
    const enemy = createEnemy(scene, { kind: "circle", lane: 3, x: bundled.x, time: 0, waveNumber: 1, waveWeight: 10, finalDamageReduction: 0 });
    scene.enemies.push(enemy); const hits = [];
    updateTowerProjectiles({ ...scene.projectileRuntime(), damageEnemy: (_, damage) => hits.push(damage) }, 0);
    check(hits.length === 6 && hits.every(d => d === 400), "Bundling changed the armor threshold");
    const levelBefore = plus.level, stocked = plus.projectileNode;
    select("+"); scene.cardStatesById.get("+").readyAt = 0; pointer(plus.x, plus.y);
    check(plus.level === levelBefore + 1 && plus.projectileNode === stocked && plus.levelText.text.endsWith("/50"),
      "Processor upgrade reset queues or failed to expand storage");
    const erased = edgePosition(scene.edgeTowers[2]); scene.eraserMode = true; pointer(erased.x, erased.y);
    check(scene.edgeTowers.length === 2 && outlet.inPlay, "Edge erasure removed adjacent tower");

    start();
    const ammoSource = place("A", 1), minus = place("-", 2), victim = place("B", 3); link(1);
    for (let i = 0; i < 3; i++) capture(ammoSource);
    check(minus.projectileNode.input.length === 3, "Subtractor did not receive local ammo");
    const mortar = createMortarProjectile(scene, { owner: "enemy", fromX: victim.x, fromY: victim.y, targetX: victim.x, targetY: victim.y,
      damage: 900, damageType: "magic", rangeX: c.CELL_WIDTH, rangeY: c.CELL_HEIGHT });
    mortar.progress = .999; scene.mortarProjectiles.push(mortar);
    updateMortarProjectiles(scene.projectileRuntime(), 0);
    check(projectileDamageBudget(mortar) === 820, "Local interception did not consume five times the canceled damage");
    const impacts = [];
    updateMortarProjectiles({ ...scene.projectileRuntime(), damageTower: (t, d) => { if (t === victim) impacts.push(d); } }, .1);
    check(impacts.length === 1 && impacts[0] === 820, "Partially intercepted mortar used original damage");

    const secondSource = place("A", 1, 1), processor = place("+", 2, 1); place("1", 3, 1, 3);
    const sourceEdge = link(1, 1), outputEdge = link(2, 1); sourceEdge.mode = ">"; outputEdge.mode = ">"; outputEdge.autoUpgrade = true;
    for (let i = 0; i < 5; i++) capture(secondSource, 3);
    tick(); check(processor.projectileNode.processing?.count === 5, "Missing in-progress recipe");
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    const save = { version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards, graph: snapshot };
    validateSurvivalSave(save);
    const bad = JSON.parse(JSON.stringify(snapshot));
    const edgeNode = bad.nodes.find(n => n.data.type === "=" && n.data.mode === ">");
    edgeNode.data.level = -2;
    let rejected = false; try { validateSurvivalSave({ ...save, graph: bad }); } catch { rejected = true; }
    check(rejected, "Invalid connector save accepted");
    const run = delta => {
      start(); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
      const savedProcessor = scene.towers.find(t => t.type === "+");
      check(savedProcessor.projectileNode.processing.count === 5 && savedProcessor.projectileNode.processing.shots[0].hitCount === 15,
        "Save lost processing progress or judgments");
      check(scene.edgeTowers.some(e => e.mode === ">" && e.autoUpgrade) && scene.edgeTowers.some(e => e.flowCredit === 20),
        "Save lost direction, auto flag or consumed throughput");
      check(scene.towers.find(t => t.type === "-").projectileNode.input.length === 2, "Save lost local interceptor ammo");
      scene.battlePaused = false;
      while (scene.simulation.tick < 120) scene.update(0, delta);
      return scene.battleChecksum();
    };
    const hash = run(1000 / 60); check(run(1000 / 144) === hash, "Pipeline is frame-rate dependent");

    start();
    const routedSource = place("A", 1), unrelated = place("B", 3);
    const receivers = [[2, 1], [4, 2], [6, 2], [8, 4], [10, 5]].map(([col, lane]) => place("0", col, lane));
    for (let col = 1; col < 10; col++) link(col).mode = ">";
    for (const [col, lane, mode] of [[2, 1, "<"], [2, 2, "<"], [4, 2, "<"], [6, 2, "<"], [8, 3, ">"], [10, 3, ">"], [10, 4, ">"]])
      link(col, lane, "vertical").mode = mode;
    scene.numbers.sync();
    for (let i = 0; i < 25; i++) check(capture(routedSource, 2), "Transparent route rejected a shot");
    check(receivers.every(t => t.projectileBank.shots.length === 5), "Uneven distribution across five receivers");
    check(!unrelated.projectileNode && receivers.every(t => t.projectileBank.shots.every(s => s.sourceTower === routedSource && s.hitCount === 2)),
      "Transparent tower changed ownership or multi-hit data");
    check(scene.edgeTowers.every(e => scene.numbers.isEdgeActive(e)), "Transparent links did not show connectivity");
    const routedSnapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ ...save, wave: scene.wave, graph: routedSnapshot });
    const runRouted = delta => {
      start(); scene.applyBattleSave(restoreBattleSnapshot(scene, routedSnapshot));
      scene.battleTime += 200;
      const source = scene.towers.find(t => t.type === "A");
      for (let i = 0; i < 5; i++) check(capture(source, 2), "Restored route failed to refill");
      check(scene.towers.filter(t => t.type === "0").every(t => t.projectileBank.shots.length === 6), "Restored routes lost fair distribution");
      scene.battlePaused = false;
      while (scene.simulation.tick < 120) scene.update(0, delta);
      return scene.battleChecksum();
    };
    const routeHash = runRouted(1000 / 60);
    check(runRouted(1000 / 144) === routeHash, "Transparent routing is frame-rate dependent after restore");

    start();
    const visualSource = place("E", 1), visualBank = place("0", 2); place("+", 3); place("1", 4, 3, 3);
    link(1).mode = ">"; link(2).mode = "="; const autoEdge = link(3); autoEdge.mode = ">"; autoEdge.level = 3; autoEdge.autoUpgrade = true;
    place("-", 2, 4); link(2, 3, "vertical").mode = "<";
    place("0", 1, 2); link(1, 2, "vertical").mode = "!=";
    for (let i = 0; i < 8; i++) capture(visualSource);
    scene.numbers.sync(); select("A"); scene.battlePaused = true;
    scene.syncPlacementGhost(); scene.updateHud(); scene.updateCards();
    game.loop.start(game.step.bind(game)); return { hash, routeHash, stored: visualBank.projectileBank.shots.length };
  });
  await page.waitForTimeout(150); await page.screenshot({ path: "logs/projectile-circuit-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/projectile-circuit-small.png" });
  assert.deepEqual(errors, []); console.log("Pipeline browser checks passed", result);
} finally { await browser.close(); }
