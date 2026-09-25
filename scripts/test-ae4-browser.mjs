// Requires Vite; accepts --playwright=<module path> and --browser=<executable>.
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
    const progress = await import("/src/progress.ts");
    const c = await import("/src/config.ts");
    const sceneModule = await (await fetch("/src/scenes/GameScene.ts")).text();
    const topologyUrl = sceneModule.match(/from "([^"]*\/towerTopology\.ts[^"]*)"/)?.[1] ?? "/src/game/towerTopology.ts";
    const { towerCell } = await import(topologyUrl);
    const { getCardBehavior, getCardDefinition } = await import("/src/registry/cards.ts");
    const { getHealTargets, getBlockingTowerFromOccupied } = await import("/src/game/targeting.ts");
    const { createEnemy } = await import("/src/game/enemyFactory.ts");
    const { towerFinalStats } = await import("/src/game/unitStats.ts");
    const { volleyShotCount } = await import("/src/game/upgrades.ts");
    const { advanceTowerAttacks } = await import("/src/game/towerCombat.ts");
    const { towerAttackRuntime } = await import("/src/render/towerCombat.ts");
    const { removeTower } = await import("/src/game/unitLifecycle.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await import("/src/survivalSaves.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (value, message) => { if (!value) throw Error(message); };
    let scene;
    const start = (levelId = "AE-4") => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId, seed: 417, selectedCards: ["&", "+", "=", "1", "A", "E", "e", "g", "m", "s"] });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000; return scene;
    };
    const place = (type, column, lane = 3, n = 1) => scene.spawnGeneratedTower(type, lane, column, n);
    const click = (column, lane = 3, right = false) => scene.submitBattleCommand({ type: "pointer", pointer: {
      x: c.BOARD_X + (column + .5) * c.CELL_WIDTH, y: c.BOARD_Y + (lane + .5) * c.CELL_HEIGHT, ctrl: false, shift: false, right } });
    const link = (swap, column, lane = 3) => { scene.topology.begin(swap); click(column, lane); };
    const flush = () => { for (let i = 0; i < 5; i++) { scene.battleTime += 100; scene.actionQueue.update(scene.battleTime, action => scene.executeBattleAction(action)); } };
    const attack = tower => advanceTowerAttacks({ ...towerAttackRuntime(scene.combatRuntime()), towers: [tower] }, scene.battleTime);

    start();
    const healer = place("e", 2), remote = place("A", 10, 6);
    scene.submitBattleCommand({ type: "selectCard", id: "&" }); click(3);
    const swap = scene.occupied.get("3:3");
    check(swap?.type === "&" && scene.topology.isTargeting(), "Deployment did not start second-cell selection");
    click(3); check(scene.topology.isTargeting(), "Same cell was accepted");
    click(10, 6);
    check(!scene.topology.isTargeting() && towerCell(remote).column === 3 && towerCell(remote).lane === 3, "Swap did not map the remote tower");
    check(remote.column === 10 && remote.lane === 6 && remote.body.x === remote.x, "Swap physically moved the tower");
    check(towerFinalStats(remote).attackSpeed === 40.5, "Remote tower did not receive zeal");
    remote.hp -= 100; getCardBehavior("e").execute(healer, getCardDefinition("e"), scene.combatRuntime());
    check(remote.hp === remote.maxHp - 10, "Remote area healing missed");
    const h = place("H", 3, 2);
    check(getHealTargets(h, getCardDefinition("H"), scene.occupied).includes(remote), "H did not use logical adjacency");
    const physicalEnemy = createEnemy(scene, { kind: "circle", lane: 6, x: remote.x + 15, time: 0, waveNumber: 1, waveWeight: 10, finalDamageReduction: 0 });
    check(getBlockingTowerFromOccupied(scene.occupied, physicalEnemy) === remote, "Enemy blocking stopped using physical cells");
    physicalEnemy.body.destroy();
    const before = [remote.x, remote.y];
    removeTower(scene.unitLifecycleRuntime(), swap); scene.updateLevelAuras();
    check(towerCell(remote).column === 10 && towerFinalStats(remote).attackSpeed === 30 && remote.x === before[0] && remote.y === before[1], "Removal did not restore topology");

    start();
    const copy = place("@", 2), copySwap = place("&", 3), copied = place("A", 10, 6);
    link(copySwap, 10, 6); check(copy.copiedType === "A", "Remote @ copy failed");
    removeTower(scene.unitLifecycleRuntime(), copySwap); scene.updateLevelAuras();
    check(copy.copiedType === undefined && copied.inPlay, "@ did not reset after topology removal");

    start();
    const u = place("u", 2), healthSwap = place("&", 3), member = place("A", 10, 6);
    link(healthSwap, 10, 6);
    check(u.healthPool === member.healthPool && u.healthPool?.members.includes(member), "Shared life missed remote adjacency");
    check(!u.healthPool.members.includes(healthSwap), "Swapped-out & stayed in local health network");

    start();
    const mirrorSwap = place("&", 3); place("m", 2); const original = place("A", 1);
    link(mirrorSwap, 10, 6);
    const mirror = scene.occupied.get("6:10");
    check(mirror?.type === "A" && mirror.mirrorGroupId === original.mirrorGroupId, "Mirror did not spawn in mapped cell");

    start();
    const summoner = place("s", 2), summonSwap = place("&", 3);
    link(summonSwap, 10, 6); attack(summoner); flush();
    check(scene.occupied.get("6:10")?.type === "a", "s did not generate in mapped cell");

    start();
    const pusher = place("#", 2), pushSwap = place("&", 3), box = place("B", 10, 6);
    link(pushSwap, 10, 6); pusher.skills.push = { sp: 30, spBuffer: 0, activeUntil: 0 };
    scene.towerPush.begin(pusher); click(10, 6);
    check(box.column === 4 && box.lane === 3 && pushSwap.column === 3, "# did not push through logical neighboring cells");

    start("IF-1");
    const savedSwap = place("&", 3); place("e", 2); place("A", 10, 6); link(savedSwap, 10, 6);
    const savedA = place("A", 0, 0); savedA.continuousAttack = true; attack(savedA);
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards: ["&", "+", "=", "1", "A", "e", "E"], graph: snapshot });
    const run = step => {
      start("IF-1"); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
      check(towerCell(scene.occupied.get("6:10")).column === 3, "Restored topology missing while paused");
      scene.battlePaused = false;
      while (scene.simulation.tick < 120) scene.update(0, step);
      return scene.battleChecksum();
    };
    const hash = run(1000 / 60); check(run(1000 / 144) === hash, "Topology save determinism mismatch");

    start();
    place("e", 3); const finalSwap = place("&", 4); place("A", 10, 5); link(finalSwap, 10, 5);
    place("g", 9, 5);
    scene.battlePaused = true; scene.updateHud(); scene.updateCards(); game.loop.start(game.step.bind(game));
    return { hash };
  });
  await page.waitForTimeout(150); await page.screenshot({ path: "logs/ae4-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/ae4-small.png" });
  assert.deepEqual(errors, []); console.log("AE-4 browser checks passed", result);
} finally { await browser.close(); }
