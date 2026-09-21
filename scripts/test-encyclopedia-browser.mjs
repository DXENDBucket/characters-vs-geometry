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
    check(text().includes("巡空") && text().includes("10 / 10") && text().includes("6s"), "Skill fields missing");
    panel.setDetailScroll(240); check(panel.detailScrollY > 0, "Cannot scroll skills");
    panel.setTab("enemies"); panel.openEnemy("parentheses3"); check(panel.selectedEntryId.includes("parentheses"), "Enemy deep link failed");
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
  assert.deepEqual(errors, []); console.log("Encyclopedia browser checks passed", inspect);
} finally { await browser.close(); }
