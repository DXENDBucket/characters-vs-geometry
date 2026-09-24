import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  // Phaser detects touch support at boot, before the later CDP touch gestures.
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, hasTouch: true });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    const progress = await import("/src/progress.ts"); progress.unlockAllCards(); progress.completeAllLevels();
    const { setLanguage } = await import("/src/i18n.ts"); setLanguage("zh-CN");
    for (const scene of window.__testGame.scene.getScenes(true)) window.__testGame.scene.stop(scene.sys.settings.key);
    window.__testGame.scene.start("EncyclopediaScene");
  });
  await page.waitForFunction(() => window.__testGame.scene.getScene("EncyclopediaScene").panel?.isOpen());
  const inspect = await page.evaluate(async () => {
    const panel = window.__testGame.scene.getScene("EncyclopediaScene").panel;
    const { towerEncyclopediaEntries, enemyEncyclopediaEntries, mechanicEncyclopediaEntries } = await import("/src/encyclopedia.ts");
    const { setLanguage } = await import("/src/i18n.ts");
    const check = (value, message) => { if (!value) throw Error(message); };
    const text = () => panel.detail.list.filter(item => item.type === "Text").map(item => item.text).join("\n");
    for (const language of ["en", "zh-CN"]) {
      setLanguage(language);
      for (const entry of [...towerEncyclopediaEntries(), ...enemyEncyclopediaEntries(), ...mechanicEncyclopediaEntries()]) {
        panel.selectEntry(entry);
        for (const item of panel.detail.list.filter(item => item.type === "Text")) {
          check(item.x >= 0 && item.x + item.width <= panel.detailViewport.width + 1, `${entry.title}: overflowing text ${item.text}`);
        }
        check(panel.detailContentHeight > 0, "Missing detail height");
        if (entry.card) {
          const { towerDetailSections } = await import("/src/encyclopediaDetails.ts");
          const expected = towerDetailSections(entry.card, panel.previewLevel, entry.description)
            .flatMap(section => section.ranges ?? []).filter(range => range.shape.kind !== "nonSpatial").length;
          const diagrams = panel.detail.list.filter(item => item.name === "range-diagram");
          check(diagrams.length >= expected, `${entry.title}: missing range diagram`);
          for (const diagram of diagrams) {
            const data = diagram.getData("range");
            check(data.diagram.cells.length > 0, `${entry.title}: blank range diagram`);
            check(Number.isFinite(data.diagram.left) && Number.isFinite(data.diagram.bottom), "Unbounded preview");
          }
        }
      }
    }
    panel.setTab("towers"); panel.setCardCase("uppercase");
    panel.selectEntry(towerEncyclopediaEntries().find(entry => entry.card.id === "V"));
    check(text().includes("1700"), "Missing final damage");
    panel.changePreviewLevel(1); check(text().includes("3060"), "Level preview failed");
    panel.setCardCase("lowercase"); panel.selectEntry(towerEncyclopediaEntries().find(entry => entry.card.id === "w"));
    check(text().includes("巡空") && text().includes("10 / 10") && text().includes("10s"), "Skill fields missing");
    panel.setDetailScroll(240); check(panel.detailScrollY > 0, "Cannot scroll skills");
    panel.setTab("enemies"); panel.openEnemy("parentheses3"); check(panel.selectedEntryId.includes("parentheses"), "Enemy deep link failed");
    check(panel.previewLevel === 3 && panel.levelControls.visible, "Enemy deep link lost rank");
    panel.openEnemy("shootingTriangle6"); check(text().includes("2/1/1/1/1"), "Enemy preview lost multi-hit distribution");
    panel.changePreviewLevel(1); check(panel.previewLevel === 7 && text().includes("2/2/1/1/1"), "Enemy rank preview did not update");
    panel.openBoss("cube2"); check(panel.previewLevel === 2 && text().includes("200000"), "Boss rank preview failed");
    panel.openBoss("icosahedron"); panel.changePreviewLevel(1);
    check(text().includes("飞跃") && text().includes("200000") && !text().includes("心跳 α"), "Boss phase preview mixed phases");
    for (const language of ["en", "zh-CN"]) {
      setLanguage(language);
      const headings = language === "en" ? ["MINIONS", "LEADERS", "BOSSES"] : ["小怪", "领袖", "Boss"];
      for (const kind of ["triangle6", "heart3", "chevronLeader3", "parentheses3"]) {
        panel.openEnemy(kind);
        check(JSON.stringify(panel.grid.list.filter(item => item.name === "enemy-section-heading").map(item => item.text))
          === JSON.stringify(headings), `${kind}: wrong section order`);
        const tile = panel.tiles.find(tile => tile.id === panel.selectedEntryId);
        check(tile.y >= panel.gridScrollY && tile.y + 120 <= panel.gridScrollY + panel.gridViewport.height,
          `${kind}: deep-linked tile is not visible`);
        for (let index = 1; index < panel.tiles.length; index++) {
          check(panel.tiles[index].y >= panel.tiles[index - 1].y, "Tile rows overlap or run backwards");
        }
      }
      for (const kind of ["cube2", "del"]) {
        panel.openBoss(kind);
        const tile = panel.tiles.find(tile => tile.id === panel.selectedEntryId);
        check(tile.y >= panel.gridScrollY && tile.y + 120 <= panel.gridScrollY + panel.gridViewport.height,
          `${kind}: Boss deep link ignores section offsets`);
      }
    }
    panel.setTab("towers"); panel.setCardCase("lowercase"); panel.selectEntry(towerEncyclopediaEntries().find(entry => entry.card.id === "e"));
    check(text().includes("常驻光环") && text().includes("攻击速度 +35%"), "Aura fields missing");
    panel.setGridScroll(200);
    const selected = panel.selectedEntryId, gridScroll = panel.gridScrollY;
    panel.openMechanic("zeal");
    check(panel.tab === "mechanics" && panel.selectedEntryId === "mechanic:zeal", "Mechanic link failed");
    panel.setTab("towers");
    check(panel.selectedEntryId === selected && panel.gridScrollY === gridScroll, "Returning lost selection or list position");
    panel.setDetailScroll(320);
    return { detailWidth: panel.detailViewport.width, contentHeight: panel.detailContentHeight };
  });
  const at = async (x, y) => page.evaluate(({ x, y }) => {
    const rect = window.__testGame.canvas.getBoundingClientRect();
    return { x: rect.x + x * rect.width / 1280, y: rect.y + y * rect.height / 760 };
  }, { x, y });
  const plus = await at(1186, 114);
  await page.mouse.click(plus.x, plus.y);
  assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.previewLevel), 2);
  const detail = await at(850, 500);
  await page.mouse.move(detail.x, detail.y); await page.mouse.wheel(0, 1000); await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.detailScrollY > 320));
  await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.setDetailScroll(290));
  await page.screenshot({ path: "logs/encyclopedia-aura-desktop.png" });
  await page.evaluate(async () => {
    const panel = window.__testGame.scene.getScene("EncyclopediaScene").panel;
    const { towerEncyclopediaEntries } = await import("/src/encyclopedia.ts");
    panel.selectEntry(towerEncyclopediaEntries().find(entry => entry.card.id === "w")); panel.setDetailScroll(160);
  });
  await page.screenshot({ path: "logs/encyclopedia-skill-desktop.png" });
  await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.setDetailScroll(0));
  await page.screenshot({ path: "logs/encyclopedia-header-desktop.png" });
  await page.setViewportSize({ width: 960, height: 640 }); await page.waitForTimeout(150);
  await page.screenshot({ path: "logs/encyclopedia-skill-small.png" });
  for (const width of [1440, 800]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 600 });
    await page.evaluate(() => {
      const panel = window.__testGame.scene.getScene("EncyclopediaScene").panel;
      panel.openEnemy("chevronLeader3"); panel.setDetailScroll(0);
    });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `logs/encyclopedia-enemy-sections-${width}.png` });
  }
  await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.setTab("towers"));
  for (const width of [1440, 960]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 640 });
    for (const [id, heading] of [["e", "热忱"], ["i", "一次性效果"], ["l", "一次性效果"], ["A", "常规攻击"], ["S", "术法迫击"], ["M", "常规攻击"], ["E", "常规攻击"]]) {
      await page.evaluate(async ({ id, heading }) => {
        const panel = window.__testGame.scene.getScene("EncyclopediaScene").panel;
        const { towerEncyclopediaEntries } = await import("/src/encyclopedia.ts");
        panel.setCardCase(id === id.toUpperCase() ? "uppercase" : "lowercase");
        panel.selectEntry(towerEncyclopediaEntries().find(entry => entry.card.id === id));
        const title = panel.detail.list.find(item => item.type === "Text" && item.text === heading);
        if (!title) throw Error(`Missing section: ${heading}`);
        panel.setDetailScroll(Math.max(0, title.y - 12));
      }, { id, heading });
      await page.waitForTimeout(50);
      await page.screenshot({ path: `logs/encyclopedia-range-${id}-${width}.png` });
    }
  }
  // Scrolled-out tiles must not intercept controls above their visual mask.
  for (const width of [1440, 960]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 640 });
    await page.waitForTimeout(100);
    await page.evaluate(() => { const p = window.__testGame.scene.getScene("EncyclopediaScene").panel; p.setTab("towers"); p.setCardCase("uppercase"); });
    for (const [name, x] of [["lowercase", 117], ["ascii", 173], ["uppercase", 61], ["lowercase", 98], ["ascii", 154], ["uppercase", 42]]) {
      await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.setGridScroll(132));
      const position = await at(x, 126); await page.mouse.click(position.x, position.y);
      assert.equal(await page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.cardCase), name, `Masked tile intercepted ${name} at ${width}px`);
    }
  }
  const level = () => page.evaluate(() => window.__testGame.scene.getScene("EncyclopediaScene").panel.previewLevel);
  const prepare = async enemy => page.evaluate(enemy => {
    const p = window.__testGame.scene.getScene("EncyclopediaScene").panel;
    if (enemy) p.openEnemy("angelPentagon");
    else { p.open("towers"); p.setCardCase("uppercase"); }
    p.previewLevel = 1; p.drawDetail(p.currentEntries().find(entry => p.entryId(entry) === p.selectedEntryId));
  }, enemy);
  for (const enemy of [false, true]) {
    await prepare(enemy);
    const position = await at(1186, 114);
    await page.mouse.move(position.x, position.y); await page.mouse.down(); await page.waitForTimeout(920);
    assert.ok(await level() >= 5, "Hold did not repeat");
    await page.mouse.up(); const released = await level(); await page.waitForTimeout(260); assert.equal(await level(), released, "Hold continued after release");
    await page.mouse.down();
    const outside = await at(800, 114); await page.mouse.move(outside.x, outside.y); await page.waitForTimeout(100);
    const exited = await level(); await page.waitForTimeout(520); assert.equal(await level(), exited, "Hold continued outside button"); await page.mouse.up();
  }
  await prepare(true);
  const position = await at(1186, 114);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: position.x, y: position.y, id: 1 }] });
  await page.waitForTimeout(900); assert.ok(await level() >= 5, "Touch hold did not repeat");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const touchReleased = await level(); await page.waitForTimeout(300); assert.equal(await level(), touchReleased, "Touch release did not stop repeat");
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await prepare(true);
  await page.mouse.move(position.x, position.y); await page.mouse.down();
  await page.evaluate(() => window.__testGame.events.emit("blur"));
  const blurred = await level(); await page.waitForTimeout(520); assert.equal(await level(), blurred, "Blur did not cancel hold"); await page.mouse.up();
  await prepare(true);
  await page.mouse.down(); await page.evaluate(() => {
    const p = window.__testGame.scene.getScene("EncyclopediaScene").panel;
    // Keep this test scene alive; the real close callback navigates away and destroys it.
    const onClose = p.onClose; p.onClose = undefined; p.close(); p.onClose = onClose;
  });
  const closed = await level(); await page.waitForTimeout(520); assert.equal(await level(), closed, "Closing did not cancel hold"); await page.mouse.up();
  await prepare(true);
  await page.evaluate(() => { const p = window.__testGame.scene.getScene("EncyclopediaScene").panel; p.openEnemy("archangelHeptagon3"); p.setDetailScroll(290); });
  await page.screenshot({ path: "logs/encyclopedia-enemy-skills.png" });
  await page.evaluate(() => { const p = window.__testGame.scene.getScene("EncyclopediaScene").panel; p.openBoss("icosahedron"); p.changePreviewLevel(2); p.setDetailScroll(450); });
  await page.screenshot({ path: "logs/encyclopedia-boss-phase.png" });
  assert.deepEqual(errors, []); console.log("Encyclopedia browser checks passed", inspect);
} finally { await browser.close(); }
