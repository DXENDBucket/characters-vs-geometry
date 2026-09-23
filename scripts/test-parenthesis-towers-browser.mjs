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
    const { createMortarProjectile } = await import("/src/game/projectiles.ts");
    const { updateMortarProjectiles } = await import("/src/game/projectileRuntime.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await import("/src/survivalSaves.ts");
    const { createEnemy } = await import("/src/game/enemyFactory.ts");
    const { getBlockingTowerFromOccupied } = await import("/src/game/targeting.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (ok, text) => { if (!ok) throw Error(text); };
    const selectedCards = ["()", "A", "B", "=", "#", "e", "m", "w", "s", "0"];
    let scene;
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-1", seed: 812, selectedCards });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000;
    };
    const at = (col, lane = 3) => ({ x: c.BOARD_X + (col + .5) * c.CELL_WIDTH, y: c.BOARD_Y + (lane + .5) * c.CELL_HEIGHT });
    const click = (x, y, ctrl = false) => scene.submitBattleCommand({ type: "pointer", pointer: { x, y, ctrl, shift: false, right: false } });
    const place = (id, col = 4, lane = 3) => {
      scene.cardStatesById.get(id).readyAt = 0;
      check(scene.deployment.useCard(scene.getDefinition(id), lane, col) === "deployed", `${id}: failed to deploy`);
      return scene.towers.find(t => t.type === id && t.lane === lane && t.column === col);
    };
    const damage = (tower, value, type = "true") => scene.combatRuntime().damageTower(tower, value, type);
    const mortar = (tower, hits = 1, amount = 4000) => {
      const shot = createMortarProjectile(scene, { owner: "enemy", fromX: tower.x, fromY: tower.y, targetX: tower.x, targetY: tower.y,
        damage: amount, hitCount: hits, damageType: "true", rangeX: c.CELL_WIDTH, rangeY: c.CELL_HEIGHT });
      shot.progress = .999; scene.mortarProjectiles.push(shot); updateMortarProjectiles(scene.projectileRuntime(), .1);
    };
    for (const order of [["()", "A"], ["A", "()"]]) {
      start(); for (const type of order) place(type);
      const shell = scene.towers.find(t => t.type === "()"), inner = scene.towers.find(t => t.type === "A");
      check(scene.occupied.size === 1 && scene.occupied.get("3:4") === inner && inner.parenthesisGuard === shell, "Placement order lost an occupant");
      damage(inner, 700, "physical"); check(shell.hp === 2600 && inner.hp === 1200, "Physical damage did not use shell armor");
      damage(inner, 100, "magic"); check(shell.hp === 2540 && inner.hp === 1200, "Magic damage did not use shell MR");
      damage(inner, 80); check(shell.hp === 2460 && inner.hp === 1200, "True damage skipped shell");
      damage(inner, 50000); check(!shell.inPlay && inner.inPlay && inner.hp === 1200 && scene.occupied.get("3:4") === inner,
        "Breaking hit spilled through or erased occupant");
      damage(inner, 100); check(inner.hp === 1100, "Damage failed to reach exposed occupant");
      const replacement = place("()"); place("()");
      check(replacement.level === 2 && replacement.maxHp === 5400 && inner.level === 1, "Shell upgrade changed occupant or lost HP scaling");
      place("A"); check(inner.level === 2 && replacement.level === 2, "Inner upgrade touched shell");
    }

    start(); let inner = place("A"), shell = place("()"); mortar(inner);
    check(!shell.inPlay && inner.inPlay && inner.hp === 1200, "Area attack hit one shared cell twice");
    shell = place("()"); mortar(inner, 2);
    check(!shell.inPlay && !inner.inPlay, "Second independent hit did not hit the exposed occupant");

    start(); inner = place("A"); shell = place("()");
    scene.edgeTowers.push({ type: "=", axis: "horizontal", lane: 3, column: 4, level: 1 }); scene.numbers.sync();
    scene.autoUpgradeEnabled = false; scene.autoUpgradeMode = true;
    click(shell.x + 32, shell.y);
    check(shell.autoUpgrade && !inner.autoUpgrade && shell.autoUpgradeBorder.visible, "Bracket auto-upgrade selected inner tower");
    check(!scene.edgeTowers[0].autoUpgrade, "Bracket auto-upgrade selected nearby connector");
    click(inner.x, inner.y); check(inner.autoUpgrade && shell.autoUpgrade, "Center auto-upgrade did not select inner tower");
    scene.autoUpgradeMode = false;
    scene.shifter.setActive(true); click(shell.x + 32, shell.y);
    const dest = place("B", 7); click(dest.x, dest.y);
    check(shell.column === 7 && dest.parenthesisGuard === shell && !inner.parenthesisGuard && inner.column === 4,
      "Shifting shell failed to detach or protect destination occupant");
    scene.eraserMode = true; click(shell.x + 32, shell.y);
    check(!shell.inPlay && dest.inPlay && scene.occupied.get("3:7") === dest, "Erasing shell erased inner tower");
    shell = place("()", 7); scene.eraserMode = true; click(dest.x, dest.y);
    check(shell.inPlay && !dest.inPlay && scene.occupied.get("3:7") === shell, "Erasing occupant erased shell");
    scene.submitBattleCommand({ type: "selectCard", id: "A" }); scene.cardStatesById.get("A").readyAt = 0;
    click(shell.x, shell.y); check(shell.parenthesisInner?.type === "A", "Pointer could not deploy into empty shell");

    start(); const push = place("#", 3); inner = place("A", 4); shell = place("()", 4); place("B", 5);
    check(scene.towerPush.push(push, 3, 4, true), "Push rejected wrapped cell");
    check(shell.column === 5 && inner.column === 5 && inner.parenthesisGuard === shell && scene.occupied.get("3:5") === inner,
      "Push lost a colocated layer or duplicated a cell");

    start(); const flyer = place("w"), groundShell = place("()"); flyer.flyingUntil = 10000;
    const enemy = createEnemy(scene, { kind: "circle", lane: 3, x: flyer.x, time: 0, waveNumber: 1, waveWeight: 10, finalDamageReduction: 0 });
    check(getBlockingTowerFromOccupied(scene.occupied, enemy) === groundShell, "Ground shell cannot block while occupant flies");
    enemy.body.destroy();

    start(); const original = place("A", 3); place("()", 3); place("()", 5); place("m", 4); scene.mirrors.syncMirrors();
    check(scene.occupied.get("3:5")?.type === "A" && scene.occupied.get("3:5").parenthesisGuard,
      "Mirror could not generate a regular tower inside an empty shell");
    start(); const generator = place("s", 3), emptyShell = place("()", 4);
    scene.executeBattleAction({ type: "volley", tower: generator, copyRevision: generator.copyRevision, hitCount: 1 });
    check(emptyShell.parenthesisInner?.type === "a", "Summon skipped the nearest empty shell");

    start(); inner = place("A"); shell = place("()"); shell.autoUpgrade = true; shell.hp = 1800;
    const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    const save = { version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards, graph };
    validateSurvivalSave(save);
    const replay = delta => {
      start(); scene.applyBattleSave(restoreBattleSnapshot(scene, graph)); scene.battlePaused = false;
      while (scene.simulation.tick < 120) scene.update(0, delta);
      return scene.battleChecksum();
    };
    const checksum = replay(1000 / 60); check(replay(1000 / 144) === checksum, "Shell battle state depends on rendering frame rate");
    start(); scene.applyBattleSave(restoreBattleSnapshot(scene, graph));
    inner = scene.towers.find(t => t.type === "A"); shell = scene.towers.find(t => t.type === "()");
    check(scene.occupied.size === 1 && inner.parenthesisGuard === shell && shell.hp === 1800 && shell.autoUpgrade, "Restore lost protection or upgrade state");
    damage(inner, 100); check(shell.hp === 1700 && inner.hp === 1200, "Restored shell failed to protect");
    scene.sealColumn(4); check(!inner.inPlay && !shell.inPlay && !scene.occupied.has("3:4"), "Sealed cell retained one layer");

    start(); place("A", 3); const visualShell = place("()", 3); place("()", 5); place("B", 5); place("()", 7);
    visualShell.autoUpgrade = true; scene.deployment.syncAutoUpgradeBorders();
    const empty = place("()", 9); scene.submitBattleCommand({ type: "selectCard", id: "A" });
    scene.cardStatesById.get("A").readyAt = 0; scene.syncPlacementGhost({ ...at(9), ctrlKey: false, shiftKey: false });
    scene.battlePaused = true; scene.updateHud(); scene.updateCards();
    game.loop.start(game.step.bind(game)); return { towers: scene.towers.length, capacity: visualShell.maxHp };
  });
  await page.waitForTimeout(150); await page.screenshot({ path: "logs/parenthesis-towers-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/parenthesis-towers-small.png" });
  assert.deepEqual(errors, []); console.log("Parenthesis tower browser checks passed", result);
} finally { await browser.close(); }
