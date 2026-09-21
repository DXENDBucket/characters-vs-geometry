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
    const progress = await import("/src/progress.ts"), c = await import("/src/config.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (value, message) => { if (!value) throw Error(message); };
    let s;
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "1-1", selectedCards: ["A", "B", "=", "()", "1"], seed: 812 });
      s = game.scene.getScene("GameScene"); s.chars = 50000; s.battlePaused = true; s.autoUpgradeEnabled = false;
    };
    const at = (column, lane = 3) => ({ x: c.BOARD_X + (column + .5) * c.CELL_WIDTH, y: c.BOARD_Y + (lane + .5) * c.CELL_HEIGHT });
    const pointer = (point, ctrl = false, shift = false) => ({ ...point, event: { ctrlKey: ctrl, shiftKey: shift, button: 0 }, rightButtonDown: () => false });
    const click = (point, ctrl = false, shift = false) => s.submitBattleCommand({ type: "pointer", pointer: { ...point, ctrl, shift, right: false } });
    const place = (type, column = 3, lane = 3) => {
      s.cardStatesById.get(type).readyAt = 0;
      check(s.deployment.useCard(s.getDefinition(type), lane, column) === "deployed", `Failed to place ${type}`);
      return s.towers.find(tower => tower.type === type && tower.column === column && tower.lane === lane);
    };
    const stroke = tower => ({ x: tower.x + 32, y: tower.y });
    const hint = (point, ctrl = false, shift = false) => [...s.toolPreviewHints(pointer(point, ctrl, shift))];
    const ghosts = (point, ctrl = false) => [...s.placementGhostSpecs(pointer(point, ctrl))];
    start(); let inner = place("A"), shell = place("()");
    s.shifter.setActive(true);
    check(hint(stroke(shell))[0]?.shape === "parenthesis", "Shell hover targeted occupant");
    click(stroke(shell));
    check(s.shifter.selectedTowers()[0] === shell, "Shell stroke did not select shell");
    check(ghosts(stroke(shell)).length === 0, "Shell reselection displayed a false move");
    click(at(3));
    check(s.shifter.selectedTowers()[0] === inner && s.shifter.isReady(), "Switching layers spent cooldown");
    click(stroke(shell), true);
    check(s.shifter.selectedTowers().length === 2, "Ctrl could not select both layers");
    check(hint(stroke(shell), true)[0]?.action === "deselect", "Ctrl did not preview deselection");
    check(ghosts(stroke(shell), true).length === 0, "Ctrl selection showed destination ghosts");
    check(ghosts(at(6)).length === 2, "Paired movement did not preview both layers");
    click(at(6));
    check(inner.column === 6 && shell.column === 6 && inner.parenthesisGuard === shell && shell.parenthesisInner === inner, "Paired move broke shell links");
    check(s.occupied.get("3:6") === inner && !s.occupied.has("3:3"), "Paired move corrupted occupancy");
    check(s.shifter.snapshot().cooldownDuration === 18000, "Paired move cooldown did not count both towers");

    // The top-left anchor layer, not selection order, decides whether an occupied cell is a destination.
    for (const reverse of [false, true]) {
      start(); inner = place("A", 3, 2); shell = place("()", 4, 3); const destinationShell = place("()", 7, 2);
      s.shifter.setActive(true);
      const points = [at(3, 2), stroke(shell)]; if (reverse) points.reverse();
      click(points[0]); click(points[1], true);
      check(ghosts(at(7, 2)).length === 2, "Mixed-layer preview depends on selection order");
      click(at(7, 2));
      check(inner.column === 7 && inner.lane === 2 && inner.parenthesisGuard === destinationShell && shell.column === 8 && shell.lane === 3, "Mixed-layer execution depends on selection order");
    }
    start(); inner = place("A"); shell = place("()"); const other = place("B", 6);
    s.shifter.setActive(true); click(stroke(shell));
    check(ghosts(at(6)).length === 1, "Shell over occupied tower was not previewed"); click(at(6));
    check(other.parenthesisGuard === shell && !inner.parenthesisGuard, "Moving shell did not reattach");
    s.shifter.reset(); s.shifter.setActive(true); click(at(3));
    s.sealedCells.add("3:5"); check(hint(at(5))[0]?.action === "invalid" && ghosts(at(5)).length === 0, "Sealed destination preview was valid");
    click(at(5)); check(inner.column === 3 && !s.shifter.hasSelection() && s.shifter.isReady(), "Invalid move mutated state or consumed cooldown");

    start(); inner = place("A", 3); shell = place("()", 3); const a2 = place("A", 5); place("1", 7);
    const edge = { type: "=", axis: "horizontal", lane: 3, column: 3, level: 1 };
    const edge2 = { type: "=", axis: "vertical", lane: 1, column: 2, level: 1 };
    s.edgeTowers.push(edge, edge2); s.numbers.sync();
    s.autoUpgradeMode = true;
    check(hint(stroke(shell))[0]?.shape === "parenthesis", "Auto preview favored edge over bracket");
    check(hint(at(3))[0]?.shape === "tower", "Auto preview favored bracket over center");
    check(hint(at(3), false, true).length === 2, "Shift auto preview omitted matching towers");
    const before = JSON.stringify(s.towers.map(t => [t.id, t.autoUpgrade]));
    s.syncPlacementGhost(pointer(at(3), false, true));
    check(JSON.stringify(s.towers.map(t => [t.id, t.autoUpgrade])) === before, "Preview changed auto-upgrade state");
    click(stroke(shell)); check(shell.autoUpgrade && !inner.autoUpgrade && !edge.autoUpgrade, "Auto click disagreed with bracket preview");
    check(hint(stroke(shell))[0].action === "autoOff", "Auto off not previewed");
    click(at(3), false, true); check(inner.autoUpgrade && a2.autoUpgrade, "Shift auto click disagreed with preview");
    check(hint(at(7))[0]?.action === "invalid", "Unsupported numeric auto-upgrade was previewed as valid");
    const edgePoint = { x: c.BOARD_X + 4 * c.CELL_WIDTH, y: inner.y };
    check(hint(edgePoint, false, true).every(h => h.shape === "edge") && hint(edgePoint, false, true).length === 2, "Edge Shift preview wrong");
    click(edgePoint); check(edge.autoUpgrade && !edge2.autoUpgrade, "Edge auto click wrong");
    s.autoUpgradeMode = false; s.eraserMode = true;
    check(hint(stroke(shell))[0]?.shape === "parenthesis" && hint(stroke(shell))[0]?.action === "erase", "Shell erase hint wrong");
    check(hint(edgePoint)[0]?.shape === "edge", "Edge erase hint wrong");
    click(stroke(shell)); check(!shell.inPlay && inner.inPlay && s.edgeTowers.includes(edge), "Erase did not match shell hint");
    s.eraserMode = true; click(edgePoint); check(!s.edgeTowers.includes(edge) && inner.inPlay, "Erase did not match edge hint");
    s.eraserMode = true;
    for (const flag of ["gameOver", "menuOpen", "reselectOpen"]) {
      s[flag] = true; check(hint(at(3)).length === 0, `${flag} leaked tool hint`); s[flag] = false;
    }
    check(hint({ x: 0, y: 0 }).length === 0, "Outside-board hint leaked");
    start(); inner = place("A"); shell = place("()"); place("A", 5);
    s.autoUpgradeMode = true;
    window.__hintPoint = stroke(shell);
    window.__centerPoint = at(3);
    game.loop.wake();
  });
  const at = async key => page.evaluate(key => {
    const rect = window.__testGame.canvas.getBoundingClientRect(), point = window[key];
    return { x: rect.x + point.x * rect.width / 1280, y: rect.y + point.y * rect.height / 760 };
  }, key);
  for (const width of [1440, 960]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 640 }); await page.waitForTimeout(100);
    await page.evaluate(() => {
      const s = window.__testGame.scene.getScene("GameScene"); s.autoUpgradeMode = true; s.eraserMode = false; s.shifter.deactivate();
    });
    let point = await at("__hintPoint"); await page.mouse.move(point.x, point.y); await page.waitForTimeout(100);
    await page.screenshot({ path: `logs/board-tools-bracket-auto-${width}.png` });
    point = await at("__centerPoint"); await page.mouse.move(point.x, point.y); await page.keyboard.down("Shift"); await page.waitForTimeout(100);
    const state = await page.evaluate(() => {
      const s = window.__testGame.scene.getScene("GameScene");
      return { count: s.toolPreview.body.list.length, shift: s.previewShiftKey?.isDown, mode: s.autoUpgradeMode,
        pointer: { x: s.input.activePointer.x, y: s.input.activePointer.y }, hints: s.toolPreviewHints(s.input.activePointer), selected: s.selectedCardId };
    });
    assert.equal(state.count, 4, `Stationary Shift did not refresh preview: ${JSON.stringify(state)}`);
    await page.keyboard.up("Shift"); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("GameScene").toolPreview.body.list.length), 2, "Stationary Shift release did not refresh preview");
    for (const mode of ["erase", "shifter"]) {
      await page.evaluate(mode => {
        const s = window.__testGame.scene.getScene("GameScene");
        s.autoUpgradeMode = false; s.eraserMode = mode === "erase"; s.shifter.setActive(mode === "shifter");
      }, mode);
      point = await at("__hintPoint"); await page.mouse.move(point.x, point.y); await page.waitForTimeout(100);
      await page.screenshot({ path: `logs/board-tools-bracket-${mode}-${width}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log("Board tool targeting, layered shifting and hover previews passed");
} finally { await browser.close(); }
