import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
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
    const config = await mod("/src/config.ts");
    const progress = await mod("/src/progress.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const game = window.__testGame;
    const check = (value, message) => { if (!value) throw Error(message); };
    game.loop.stop();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    progress.unlockAllCards(); progress.completeAllLevels();
    const data = { levelId: "IF-1", seed: 7481, selectedCards: ["X", "E", "B", "m", "u", "x", "T"] };
    const start = key => {
      game.scene.add(key, new GameScene(key), false);
      game.scene.start(key, data);
      const scene = game.scene.getScene(key);
      check(scene.world.towers === scene.towers && scene.world.enemies === scene.enemies, "Scene has a second entity roster");
      check(scene.world.random === scene.session.random, "World and session do not share battle RNG");
      return scene;
    };
    const a = start("WorldA"), b = start("WorldB");
    check(a.world !== b.world && a.towers !== b.towers && a.enemies !== b.enemies, "World data shared across scenes");
    const pointer = (lane, column) => ({ type: "pointer", pointer: { x: config.BOARD_X + (column + .5) * config.CELL_WIDTH,
      y: config.BOARD_Y + (lane + .5) * config.CELL_HEIGHT, shift: false, ctrl: false, right: false } });
    for (const scene of [a, b]) {
      scene.submitBattleCommand({ type: "debugMode", enabled: true });
      scene.submitBattleCommand({ type: "tool", action: "tool:debugChars" });
      for (const [id, lane, column] of [["X", 0, 0], ["E", 3, 2], ["B", 3, 4], ["m", 3, 5], ["u", 2, 4], ["x", 1, 2], ["T", 4, 4]]) {
        scene.submitBattleCommand({ type: "selectCard", id }); scene.submitBattleCommand(pointer(lane, column));
      }
      check(scene.towers.length >= 7, "Real combat fixture did not deploy towers");
    }
    const step = 1000 / 60;
    for (let i = 0; i < 600; i++) {
      a.update(0, step); b.update(0, step * 2); a.update(0, step);
    }
    check(a.simulation.tick === 1200 && b.simulation.tick === 1200, "Frame schedules advanced different tick counts");
    check(a.battleChecksum() === b.battleChecksum(), "Interleaved real worlds diverged");
    const checkpoint = JSON.parse(JSON.stringify(captureBattleSnapshot(a.battleState())));
    const c = start("WorldC");
    c.applyBattleSave(restoreBattleSnapshot(c, checkpoint)); c.battlePaused = false;
    check(c.world.enemies === c.enemies && c.world.towers === c.towers, "Restore left the world pointing to old arrays");
    for (let i = 0; i < 600; i++) {
      c.update(0, step * 2); a.update(0, step); b.update(0, step * 2); a.update(0, step);
    }
    const expected = a.battleChecksum();
    check(expected === b.battleChecksum() && expected === c.battleChecksum(), "Parallel checkpoint continuation diverged");
    const originalWorld = a.world, otherHash = b.battleChecksum();
    game.scene.stop("WorldA"); game.scene.start("WorldA", data);
    check(a.world !== originalWorld && a.wave === 0 && a.towers.length === 0, "Restart reused the prior world");
    check(b.battleChecksum() === otherHash, "Restart changed another battle");
    for (const key of ["WorldA", "WorldB", "WorldC"]) game.scene.stop(key);
    return { ticks: 2400, checksum: expected, instances: 3, restored: true, restarted: true };
  });
  assert.deepEqual(errors, []);
  console.log("Real battle-world isolation passed", result);
} finally { await browser.close(); }
