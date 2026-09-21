import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const progress = await import("/src/progress.ts"); progress.unlockAllCards(); progress.completeAllLevels();
    const c = await import("/src/config.ts");
    for (const scene of window.__testGame.scene.getScenes(true)) window.__testGame.scene.stop(scene.sys.settings.key);
    window.__testGame.scene.start("GameScene", { levelId: "1-1", selectedCards: ["A", "B", "=", "()"], seed: 123 });
    const s = window.__testGame.scene.getScene("GameScene");
    s.chars = 50000; s.toggleBattlePause();
    for (const card of s.cardStates) card.readyAt = 0;
    const check = (value, message) => { if (!value) throw Error(message); };
    const at = (lane, column) => ({ x: c.BOARD_X + (column + .5) * c.CELL_WIDTH, y: c.BOARD_Y + (lane + .5) * c.CELL_HEIGHT });
    s.selectedCardId = "A";
    check(s.placementGhostSpecs(at(3, 5)).length === 1, "Paused tower preview missing");
    s.sealedCells.add("3:5"); check(s.placementGhostSpecs(at(3, 5)).length === 0, "Sealed cell previewed"); s.sealedCells.clear();
    s.cardStatesById.get("A").readyAt = 1e9; check(s.placementGhostSpecs(at(3, 5)).length === 0, "Cooldown ignored"); s.cardStatesById.get("A").readyAt = 0;
    const funds = s.chars; s.chars = 0; check(s.placementGhostSpecs(at(3, 5)).length === 0, "Unaffordable previewed"); s.chars = funds;
    s.deployment.useCard(s.getDefinition("A"), 3, 2);
    s.cardStatesById.get("A").readyAt = 0;
    check(s.placementGhostSpecs(at(3, 2)).length === 0, "Occupied cell previewed");
    s.selectedCardId = "()"; check(s.placementGhostSpecs(at(3, 2)).length === 1, "Paused bracket placement missing");
    s.shifter.setActive(true); s.shifter.handlePointer(3, 2, s.occupied.get("3:2"), false);
    const moves = s.placementGhostSpecs(at(3, 5)); check(moves.length === 1 && moves[0].type === "A", "Paused shifter preview missing");
    s.shifter.deactivate();
    s.selectedCardId = "=";
    const edge = { x: c.BOARD_X + c.CELL_WIDTH * 5, y: c.BOARD_Y + c.CELL_HEIGHT * 3.5 };
    s.syncPlacementGhost(edge); check(s.circuitEdges.commandBuffer.length > 0, "Paused edge preview missing");
    for (const mode of ["menuOpen", "reselectOpen", "gameOver"]) {
      s[mode] = true; s.syncPlacementGhost(edge); check(s.circuitEdges.commandBuffer.length === 0, `${mode}: edge preview leaked`);
      s.selectedCardId = "A"; check(s.placementGhostSpecs(at(3, 5)).length === 0, `${mode}: tower preview leaked`);
      s[mode] = false; s.selectedCardId = "=";
    }
    s.selectedCardId = "A";
    window.__pausedBattleTime = s.battleTime;
    window.__previewPoint = at(3, 5);
  });
  const point = await page.evaluate(() => {
    const rect = window.__testGame.canvas.getBoundingClientRect(), p = window.__previewPoint;
    return { x: rect.x + p.x * rect.width / 1280, y: rect.y + p.y * rect.height / 760 };
  });
  await page.mouse.move(point.x, point.y); await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").placementGhosts.length), 1);
  assert.ok(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").battleTime === window.__pausedBattleTime), "Preview advanced the battle");
  await page.screenshot({ path: "logs/paused-placement-preview.png" });
  assert.deepEqual(errors, []);
  console.log("Paused placement preview checks passed");
} finally { await browser.close(); }
