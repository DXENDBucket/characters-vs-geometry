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
  await page.evaluate(async () => {
    const mod = path => import(performance.getEntriesByType("resource").map(entry => entry.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const progress = await mod("/src/progress.ts");
    const config = await mod("/src/config.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-1", seed: 41, unlimitedFirepower: true,
        selectedCards: ["A", "w", "b", "t", "!"] });
      const scene = game.scene.getScene("GameScene"); scene.chars = 50000; return scene;
    };
    const pointer = (lane, column) => ({ x: config.BOARD_X + (column + .5) * config.CELL_WIDTH,
      y: config.BOARD_Y + (lane + .5) * config.CELL_HEIGHT, event: {}, rightButtonDown: () => false });
    for (const id of ["b", "t", "!"]) {
      const scene = start();
      const units = [0, 2, 6].map(lane => scene.spawnGeneratedTower("A", lane, 3, 1));
      const untouched = scene.spawnGeneratedTower("A", 3, 4, 1);
      scene.selectedCardId = id;
      const ghosts = scene.placementGhostSpecs(pointer(4, 3));
      check(ghosts.length === 3 && ghosts.every(item => item.column === 3), `${id}: wrong column ghosts`);
      const chars = scene.effectiveChars();
      scene.handleBoardPointer(pointer(4, 3));
      scene.actionQueue.update(scene.battleTime, action => scene.executeBattleAction(action));
      check(Math.abs(scene.effectiveChars() - (chars - scene.getDefinition(id).cost)) < 1e-7, `${id}: incorrect payment`);
      for (const tower of units) {
        check(id === "b" ? tower.facingDirection === -1 : id === "t" ? tower.trueDamageUntil > scene.battleTime
          : tower.continuousAttack === true, `${id}: missed row ${tower.lane}`);
      }
      check(untouched.facingDirection === 1 && !untouched.continuousAttack, `${id}: crossed columns`);
      check(!scene.towers.some(tower => tower.transient), `${id}: pending effects remain`);
    }
    let scene = start();
    const patrols = Array.from({ length: 7 }, (_, lane) => scene.spawnGeneratedTower("w", lane, 3, 1));
    scene.selectedCardId = "!";
    scene.handleBoardPointer(pointer(3, 3));
    scene.actionQueue.update(scene.battleTime, action => scene.executeBattleAction(action));
    scene.battleTime = 2000; scene.towerSkills.update(2, scene.battleTime);
    check(patrols.every(tower => tower.flyingUntil === 12000 && tower.skills.airPatrol.sp === 0), "Patrol did not auto-start for 10s");
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    scene = start(); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
    check(scene.towers.every(tower => tower.continuousAttack && tower.flyingUntil === 12000), "Restore lost attachment or active skill");
    scene.battlePaused = false;
    scene.battleTime = 12000; scene.towerSkills.update(0, scene.battleTime);
    check(scene.towers.every(tower => tower.flyingUntil === 0 && tower.skills.airPatrol.sp === 0), "Patrol ended/recharged early");
    scene.battleTime = 22000; scene.towerSkills.update(10, scene.battleTime);
    check(scene.towers.every(tower => tower.flyingUntil === 32000), "Restored attachment stopped auto-casting");
    scene.battlePaused = true;
    game.loop.start(game.step.bind(game));
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/attachments-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/attachments-small.png" });
  assert.deepEqual(errors, []);
  console.log("Attachment column, automatic Patrol and battle restore checks passed.");
} finally { await browser.close(); }
