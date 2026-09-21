import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
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
  const result = await page.evaluate(async () => {
    const progress = await import("/src/progress.ts"), config = await import("/src/config.ts");
    const registry = await import("/src/registry/cards.ts"), towers = await import("/src/game/towers.ts");
    const snapshots = await import("/src/game/battleSnapshot.ts"), saves = await import("/src/survivalSaves.ts");
    const archive = await import("/src/saveArchive.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (value, message) => { if (!value) throw Error(message); };
    const stop = () => { for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key); };
    const start = (cards, extra = {}) => {
      stop(); game.scene.start("GameScene", { levelId: "IF-1", selectedCards: cards, seed: 78, ...extra });
      return game.scene.getScene("GameScene");
    };
    const fixture = cards => { const s = start(cards); s.chars = 50000; s.battlePaused = true; s.autoUpgradeEnabled = false; return s; };
    const command = (s, id, column, lane = 3) => {
      s.submitBattleCommand({ type: "selectCard", id });
      s.submitBattleCommand({ type: "pointer", pointer: { x: config.BOARD_X + (column + .5) * config.CELL_WIDTH,
        y: config.BOARD_Y + (lane + .5) * config.CELL_HEIGHT, ctrl: false, shift: false, right: false } });
    };
    let s = fixture(["A", "?A"]);
    let eligible = 0;
    for (const card of registry.allCardDefinitions.filter(registry.canImitateCard)) {
      if (card.id === "=") continue;
      const tower = towers.createTower(s, registry.getCardDefinition(`?${card.id}`), 0, 0, 0, 500);
      check(tower.type === card.id && tower.sourceCardId === `?${card.id}`, `Wrong native identity: ${card.id}`);
      check(tower.maxHp === card.maxHp && tower.baseStats.attackPower === card.attackPower, `Wrong panel: ${card.id}`);
      tower.body.destroy(); eligible++;
    }
    command(s, "?A", 2); command(s, "A", 3);
    const copy = s.towers.find(t => t.column === 2), original = s.towers.find(t => t.column === 3);
    check(copy?.type === "A" && original?.type === "A", "Immediate transformation failed");
    check(s.cardStatesById.get("?A").readyAt === 2 * s.cardStatesById.get("A").readyAt, "Cooldown not doubled");
    copy.autoUpgrade = true; s.autoUpgradeEnabled = true;
    s.cardStatesById.get("A").readyAt = Infinity; s.cardStatesById.get("?A").readyAt = 0;
    s.attemptAutoUpgrades(); check(copy.level === 2, "Imitator cannot auto-upgrade");
    check(s.cardStatesById.get("A").readyAt === Infinity, "Native cooldown changed");
    s.cardStatesById.get("A").readyAt = 3000; s.updateCards();
    // Each card can also auto-upgrade a tower deployed by the other card.
    s.cardStatesById.get("A").readyAt = 0; s.cardStatesById.get("?A").readyAt = Infinity;
    s.attemptAutoUpgrades(); check(copy.level === 3, "Native card cannot auto-upgrade imitation");
    copy.autoUpgrade = false; original.autoUpgrade = true;
    s.cardStatesById.get("A").readyAt = Infinity; s.cardStatesById.get("?A").readyAt = 0;
    s.attemptAutoUpgrades(); check(original.level === 2, "Imitator cannot auto-upgrade native tower");
    s.cardStatesById.get("A").readyAt = 3000; s.updateCards();
    check(s.saveSurvivalBattle(), "Imitation battle save rejected");
    const save = saves.readSurvivalSave("IF-1"); check(save.selectedCards.includes("?A"), "Save lost variant");
    archive.parseSaveArchive(archive.exportSaveArchive());
    const graph = snapshots.captureBattleSnapshot(s.battleState());
    s = start(["A", "?A"], { resume: true });
    check(s.towers.some(t => t.sourceCardId === "?A" && t.level === 3), "Restore lost imitation source or level");
    check(s.cardStatesById.get("?A").readyAt === save.graph.nodes.find(n => n.data.id === "?A")?.data.readyAt,
      "Restore changed imitation cooldown");
    check(graph.nodes.some(n => n.data.sourceCardId === "?A"), "Snapshot omitted source card");

    s = fixture(["A", "?()"]); command(s, "A", 2); command(s, "?()", 2);
    check(s.towers.find(t => t.type === "A")?.parenthesisGuard?.sourceCardId === "?()", "Copied shell did not protect occupant");
    const shell = s.towers.find(t => t.type === "()"); shell.autoUpgrade = true; s.autoUpgradeEnabled = true;
    s.cardStatesById.get("?()").readyAt = 0; s.attemptAutoUpgrades(); check(shell.level === 2, "Copied shell cannot auto-upgrade");

    s = fixture(["A", "?=", "="]);
    const edge = { type: "=", axis: "horizontal", lane: 3, column: 3 };
    check(s.edgeControls.use(edge, s.cardStatesById.get("?=")) === "handled", "Copied connector failed");
    check(s.cardStatesById.get("?=").readyAt === 2000 && s.cardStatesById.get("=").readyAt === 0, "Connector cooldowns mixed");
    s.edgeTowers[0].autoUpgrade = true; s.autoUpgradeEnabled = true; s.cardStatesById.get("=").readyAt = Infinity;
    s.cardStatesById.get("?=").readyAt = 0; s.attemptAutoUpgrades(); check(s.edgeTowers[0].level === 2, "Copied connector cannot auto-upgrade");

    s = fixture(["A", "?b", "b"]); command(s, "A", 2);
    const target = s.towers[0]; command(s, "?b", 2);
    const effect = s.towers.find(t => t.sourceCardId === "?b"); check(effect?.transient, "Copied attachment missing");
    effect.level = 2; s.targetedEffects.resolvePendingEffectCard(effect);
    check(target.facingDirection === -1 && !effect.inPlay, "Copied attachment did not resolve");
    check(s.cardStatesById.get("?b").readyAt === 10000 && s.cardStatesById.get("b").readyAt === 0, "Refund went to wrong slot");
    s = fixture(["A", "?i"]); command(s, "?i", 2); command(s, "A", 2);
    check(!s.towers.some(t => t.type === "i" && t.inPlay), "Copied single-use tower did not detonate");

    // Real commands, without fixture mutations, must replay exactly across render rates.
    s = start(["A", "?A"]);
    s.submitBattleCommand({ type: "debugMode", enabled: true });
    s.submitBattleCommand({ type: "tool", action: "tool:debugChars" });
    command(s, "?A", 2); command(s, "A", 3);
    while (s.simulation.tick < 180) s.update(0, 1000 / 60);
    const replay = s.exportReplay(), checksum = s.battleChecksum();
    s = start([], { replay });
    while (s.simulation.tick < 180) s.update(0, 1000 / 144);
    check(s.battleChecksum() === checksum, "Imitator replay diverged");

    stop(); game.scene.start("CardSelectScene", { levelId: "AE-6" });
    const select = game.scene.getScene("CardSelectScene"); select.clearLoadout(); select.toggleCard("A"); select.toggleCard("?");
    check(select.choosingImitation && !select.cardFrames.has("U"), "Picker contains expensive targets");
    select.toggleCard("B"); check(select.selectedCards.join() === "A,?B", "Picker did not configure imitation");
    select.toggleCard("?"); select.toggleCard("A");
    check(select.selectedCards.join() === "A,?A", "Picker added more than one imitator");
    archive.parseSaveArchive(archive.exportSaveArchive());
    stop(); game.scene.start("CardSelectScene", { levelId: "AE-6" });
    const reopened = game.scene.getScene("CardSelectScene");
    check(reopened.selectedCards.join() === "A,?A", "Last loadout lost variant");
    reopened.toggleCard("?"); game.loop.wake();
    return { eligible, replayChecksum: checksum };
  });
  await mkdir("logs", { recursive: true });
  for (const width of [1440, 960]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 640 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `logs/imitator-picker-${width}.png` });
  }
  // Exercise the masked pool with an actual mouse selection.
  const point = await page.evaluate(() => {
    const game = window.__testGame, scene = game.scene.getScene("CardSelectScene");
    const frame = scene.cardFrames.get("A"), world = frame.getWorldTransformMatrix(), rect = game.canvas.getBoundingClientRect();
    return { x: rect.left + world.tx / game.scale.width * rect.width, y: rect.top + world.ty / game.scale.height * rect.height };
  });
  await page.mouse.click(point.x, point.y);
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("CardSelectScene").choosingImitation), false);
  assert.deepEqual(errors, []);
  console.log("Imitator browser checks passed:", result);
} finally { await browser.close(); }
