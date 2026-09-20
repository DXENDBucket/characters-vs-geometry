// Requires Vite and Playwright; same CLI options as test-battle-determinism-browser.mjs.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const modulePath = option("playwright");
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
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
    const config = await import("/src/config.ts");
    const progress = await import("/src/progress.ts");
    const { getCardDefinition, allCardDefinitions, getCardBehavior } = await import("/src/registry/cards.ts");
    const { isCopyableDefinition } = await import("/src/game/towerCopy.ts");
    const { setTowerFacing } = await import("/src/game/towers.ts");
    const { createEnemy } = await import("/src/game/enemyFactory.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await import("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await import("/src/survivalSaves.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (value, message) => { if (!value) throw Error(message); };
    const start = (data = {}) => {
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start("GameScene", { levelId: "AE-2", seed: 91, selectedCards: ["@", "A", "B", "b", "X", "x", "w", "i", "e"], ...data });
      return game.scene.getScene("GameScene");
    };
    const click = (scene, tower) => scene.submitBattleCommand({ type: "pointer", pointer: { x: tower.x, y: tower.y, ctrl: false, shift: false, right: false } });
    let tested = 0;
    for (const definition of allCardDefinitions.filter(isCopyableDefinition)) {
      const scene = start();
      const target = scene.spawnGeneratedTower(definition.id, 3, 4, 20);
      const copy = scene.spawnGeneratedTower("@", 3, 3, 3);
      check(copy.copiedType === definition.id && copy.type === "@" && copy.label.text === "@", `Identity ${definition.id}`);
      check(copy.level === 3, `Level ${definition.id}`);
      check(JSON.stringify(copy.border.commandBuffer) === JSON.stringify(target.border.commandBuffer), `Border ${definition.id}`);
      check(!!copy.rangeBorder === !!target.rangeBorder, `Range ${definition.id}`);
      tested++;
    }
    let scene = start();
    const boxSource = scene.spawnGeneratedTower("#", 3, 4, 1);
    const boxCopy = scene.spawnGeneratedTower("@", 3, 3, 3);
    const pushed = scene.spawnGeneratedTower("B", 2, 3, 1);
    scene.towerSkills.update(15, 15000);
    check(boxCopy.skills.push.sp === 30 && boxSource.skills.push.sp === 15, "Copied push must use its own level and charge");
    scene.submitBattleCommand({ type: "selectCard", id: "A" }); click(scene, boxCopy);
    check(scene.towerPush.isTargeting(), "Copied push click did not enter direction selection");
    click(scene, pushed);
    check(pushed.lane === 1 && pushed.column === 3 && boxCopy.lane === 3 && boxCopy.column === 3 &&
      boxCopy.skills.push.sp === 0, "Copied push did not move its neighbor or consume charge");
    scene = start();
    const wing = scene.spawnGeneratedTower("w", 3, 4, 1);
    const copy = scene.spawnGeneratedTower("@", 3, 3, 2);
    copy.skills.airPatrol.sp = 10;
    scene.submitBattleCommand({ type: "selectCard", id: "B" }); click(scene, copy);
    check(copy.flyingUntil > 0, "Copied manual skill failed");
    scene.spawnGeneratedTower("X", 3, 2, 9);
    setTowerFacing(copy, -1); scene.updateLevelAuras();
    check(copy.copiedType === "X" && copy.flyingUntil === 0 && !copy.flyingHalo.visible, "Facing/form cleanup failed");
    scene.triggerTowerRuntime().removeTower(wing);
    setTowerFacing(copy, 1); scene.updateLevelAuras();
    check(copy.copiedType === undefined && copy.attackSpeed === undefined, "Empty-front reset failed");

    scene = start();
    const frozen = scene.spawnGeneratedTower("i", 2, 4, 1);
    const ash = scene.spawnGeneratedTower("@", 2, 3, 2);
    scene.submitBattleCommand({ type: "selectCard", id: "A" }); click(scene, ash);
    check(!ash.inPlay && frozen.inPlay, "Copied ash must consume @, not the source");

    scene = start();
    const homingSource = scene.spawnGeneratedTower("x", 2, 4, 1);
    const homingCopy = scene.spawnGeneratedTower("@", 2, 3, 3);
    const enemy = createEnemy(scene, { kind: "circle", lane: 2, x: homingCopy.x + 180, time: 0, waveNumber: 1, waveWeight: 100, finalDamageReduction: 0 });
    scene.enemies.push(enemy);
    getCardBehavior("x").execute(homingCopy, getCardDefinition("x"), scene.combatRuntime());
    check(scene.projectiles.length === 4 && scene.projectiles.every(p => p.sourceBehaviorType === "x" && p.damage === 520), "Copied homing volley");
    scene.triggerTowerRuntime().removeTower(homingSource); scene.updateLevelAuras();
    check(scene.projectiles.every(p => p.sourceBehaviorType === "x"), "Launched shots lost source behavior");

    scene = start({ levelId: "IF-1" });
    scene.spawnGeneratedTower("B", 3, 4, 1);
    const savedCopy = scene.spawnGeneratedTower("@", 3, 3, 3);
    const snapshot = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards: ["@", "B"], graph: snapshot });
    const expectedHp = savedCopy.maxHp;
    scene = start({ levelId: "IF-1" }); scene.applyBattleSave(restoreBattleSnapshot(scene, snapshot));
    const restored = scene.towers.find(t => t.type === "@");
    check(restored.copiedType === "B" && restored.label.text === "@" && restored.maxHp === expectedHp, "Copy save restore failed");

    // Command-only deployment, reorientation and erasure must replay identically.
    scene = start();
    scene.submitBattleCommand({ type: "debugMode", enabled: true });
    scene.submitBattleCommand({ type: "tool", action: "tool:debugChars" });
    const place = (id, lane, column) => {
      scene.submitBattleCommand({ type: "selectCard", id });
      click(scene, { x: config.BOARD_X + (column + .5) * config.CELL_WIDTH, y: config.BOARD_Y + (lane + .5) * config.CELL_HEIGHT });
    };
    place("A", 3, 4); place("X", 3, 2); place("@", 3, 3);
    const advance = (target, deltas = [1000 / 60]) => {
      let i = 0;
      while (scene.simulation.tick < target && !scene.gameOver) scene.update(0, deltas[i++ % deltas.length]);
      check(scene.simulation.tick === target, "Wrong replay tick");
    };
    advance(120); place("b", 3, 3); advance(180);
    check(scene.towers.some(t => t.type === "@" && t.copiedType === "X"), "b did not redirect copying");
    scene.submitBattleCommand({ type: "tool", action: "tool:erase" });
    click(scene, scene.towers.find(t => t.type === "X"));
    advance(240);
    const replay = scene.exportReplay(), hash = scene.battleChecksum();
    for (const deltas of [[1000 / 30], [1000 / 144], [7, 11, 23]]) {
      scene = start({ replay }); advance(replay.endTick, deltas);
      check(scene.battleChecksum() === hash, "Copy replay diverged");
    }

    // Leave a readable spread of copied categories for screenshots.
    scene = start();
    for (const [index, type] of ["A", "B", "X", "e", "w", "S"].entries()) {
      const lane = 1 + Math.floor(index / 3) * 3, column = 2 + index % 3 * 4;
      scene.spawnGeneratedTower(type, lane, column + 1, 1);
      scene.spawnGeneratedTower("@", lane, column, 3);
    }
    game.loop.start(game.step.bind(game));
    return { copiedPanels: tested, replayHash: hash };
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/tower-copy-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/tower-copy-small.png" });
  assert.deepEqual(errors, []);
  console.log("Tower copy browser checks passed", result);
} finally { await browser.close(); }
