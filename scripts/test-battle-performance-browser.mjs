// Requires Vite and Playwright. Timings are diagnostic; structural regressions fail the test.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const modulePath = option("playwright");
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1410, height: 900 } });
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
    const progress = await mod("/src/progress.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { enemyDefenseStats } = await mod("/src/game/combatStats.ts");
    const { applyStatusEffect, statusMultipliers, addFrozenPhysicalDamage } = await mod("/src/game/statusEffects.ts");
    const { createSharedGlyph } = await mod("/src/render/sharedGlyphs.ts");
    const { createEnemyShape } = await mod("/src/render/unitShapes.ts");
    const { applyEnemyPromotion, syncEnemyFacingVisual } = await mod("/src/game/enemyBehaviors.ts");
    const { enemyKindAtRank } = await mod("/src/registry/enemies.ts");
    const { BOARD_X, CELL_WIDTH } = await mod("/src/config.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const textureCount = () => Object.keys(game.textures.list).length;
    const start = () => {
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start("GameScene", { levelId: "AE-7", seed: 12345, selectedCards: ["A", "B", "X"], difficulty: 3 });
      const scene = game.scene.getScene("GameScene");
      scene.updateWaveSchedule = () => {};
      return scene;
    };
    const spawn = (scene, kind, lane, x) => {
      spawnEnemyAt(scene.combatRuntime(), { kind, waveNumber: 1, time: scene.battleTime, lane, x, waveWeight: 0, finalDamageReduction: 0 });
      return scene.enemies.at(-1);
    };
    const measure = (fn, iterations) => {
      for (let i = 0; i < Math.min(iterations, 100); i++) fn();
      const samples = [];
      for (let r = 0; r < 9; r++) {
        const started = performance.now();
        for (let i = 0; i < iterations; i++) fn();
        samples.push((performance.now() - started) / iterations);
      }
      samples.sort((a, b) => a - b);
      return { median: samples[4], slowestBatch: samples[8] };
    };
    const measurements = [];
    for (const count of [50, 200, 800]) {
      const scene = start(), initialTextures = textureCount(), started = performance.now();
      for (let i = 0; i < count; i++) spawn(scene, "circle", i % 7, BOARD_X + CELL_WIDTH * (10 + (i % 20) / 20));
      const spawnMs = performance.now() - started, addedTextures = textureCount() - initialTextures;
      check(addedTextures === 5, `${count} enemies added ${addedTextures} textures instead of 5`);
      const target = scene.enemies[0];
      const defense = measure(() => enemyDefenseStats(target, scene.enemies, scene.battleTime), 2000);
      const tick = measure(() => scene.stepBattle(), 10);
      let scans = 0;
      const iterator = scene.enemies[Symbol.iterator];
      scene.enemies[Symbol.iterator] = function* () { scans++; yield* iterator.call(this); };
      scene.combatRuntime().damageEnemy(target, 1, "true");
      delete scene.enemies[Symbol.iterator];
      check(scans === 0, "A warmed-up hit scanned the entire enemy roster");
      measurements.push({ count, initialTextures, addedTextures, spawnMs, defenseMs: defense, tickMs: tick });
    }
    check(measurements.every(m => m.initialTextures === measurements[0].initialTextures), "Scene restarts leaked textures");

    const scene = start(), target = spawn(scene, "hexagon", 3, BOARD_X + CELL_WIDTH * 7);
    // Shared canvases retain the exact pixels and logical size of Phaser's high-resolution Text.
    for (const text of ["I", "XL", "▣", "⬡"]) {
      const style = { color: "#9fdcff", fontFamily: "monospace", fontSize: "22px", fontStyle: "700" };
      const reference = scene.add.text(0, 0, text, { ...style, resolution: 2 });
      const glyph = createSharedGlyph(scene, 0, 0, text, style);
      const canvas = glyph.texture.getSourceImage();
      check(canvas.width === reference.canvas.width && canvas.height === reference.canvas.height, "Glyph backing dimensions changed");
      const a = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      const b = reference.context.getImageData(0, 0, canvas.width, canvas.height).data;
      check(a.some(value => value > 0) && a.every((value, i) => value === b[i]), "Glyph pixels changed or became blank");
      check(glyph.displayWidth === reference.width && glyph.displayHeight === reference.height, "Glyph logical size changed");
      reference.destroy(); glyph.destroy();
    }
    for (let i = 0; i < 100; i++) applyEnemyPromotion(scene, target, i % 2 ? "hexagon2" : "hexagon", scene.battleTime);
    check(target.body.list.includes(target.armorIcon) && target.armorIcon.texture.source[0].width > 0, "Promotion lost its shared glyph");

    const reversed = spawn(scene, "triangleRam14", 2, BOARD_X + CELL_WIDTH * 9);
    const labels = reversed.shape.list.filter(child => child.getData("enemyRankLabel"));
    check(labels.length === 2, "Reversal fixture needs both rank labels");
    const positions = labels.map(label => label.x);
    for (const direction of [1, -1, 1, -1]) {
      reversed.movementDirection = direction;
      syncEnemyFacingVisual(reversed);
      check(labels.every((label, i) => label.scaleX > 0 && label.x === -direction * positions[i]),
        "Turning must move rank labels with the shape without mirroring the glyphs");
    }

    const counts = [0, 0, 0];
    applyStatusEffect(target, "stasis", 10000, scene.battleTime);
    applyStatusEffect(target, "power", 10000, scene.battleTime);
    let statusDraws = 0;
    const setStroke = target.statusBorder.setStrokeStyle;
    target.statusBorder.setStrokeStyle = function (...args) { statusDraws++; return setStroke.apply(this, args); };
    for (let i = 0; i < 100; i++) enemyDefenseStats(target, scene.enemies, scene.battleTime);
    check(statusDraws === 0, "Attribute queries drew status visuals");
    const layers = [scene.nullifiedTowerGraphics, scene.timedCellSealGraphics, scene.enemyHealthLinks];
    const clears = layers.map(g => g.clear);
    layers.forEach((g, i) => { g.clear = function () { counts[i]++; return clears[i].call(this); }; });
    const tickBefore = scene.simulation.tick;
    scene.update(0, 150);
    const catchUpTicks = scene.simulation.tick - tickBefore;
    layers.forEach((g, i) => { g.clear = clears[i]; });
    target.statusBorder.setStrokeStyle = setStroke;
    check(catchUpTicks > 1 && counts.every(n => n === 1), `Catch-up redrew overlays: ${counts}; ticks: ${catchUpTicks}`);
    check(statusDraws === 1 && target.powerIcon.visible && target.statusBorder.visible, "Status visuals were not rendered once per frame");
    applyStatusEffect(target, "frozen", 10000, scene.battleTime);
    scene.battlePaused = true; scene.update(0, 0);
    check(target.frozenBorder.visible && !target.statusBorder.visible, "Paused rendering lost freeze priority");
    addFrozenPhysicalDamage(target, target.maxHp / 2, scene.battleTime);
    scene.update(0, 0);
    check(!target.frozenBorder.visible && target.statusBorder.visible, "Freeze break did not refresh on the same paused tick");
    const checksum = scene.battleChecksum();
    scene.syncBattleOverlays();
    check(scene.battleChecksum() === checksum, "Status rendering changed authoritative state");

    for (let rank = 1; rank <= 300; rank++) createEnemyShape(scene, enemyKindAtRank("triangle", rank)).destroy();
    const glyphCount = Object.keys(game.textures.list).filter(key => key.startsWith("shared-glyph-")).length;
    check(glyphCount <= 128 + 6, `Unused rank glyphs are unbounded: ${glyphCount}`);

    const gallery = start();
    const kinds = ["circle", "triangle2", "triangleRam3", "hexMace2", "hexSpellBulwark3", "heart3",
      "tilde3", "parentheses3", "archangelHeptagon3", "burrowArrow2", "equals3", "chevronLeader"];
    kinds.forEach((kind, i) => spawn(gallery, kind, 1 + Math.floor(i / 6) * 3, BOARD_X + (1 + i % 6 * 1.7) * CELL_WIDTH));
    const status = gallery.enemies[0];
    applyStatusEffect(status, "power", 10000, gallery.battleTime);
    applyStatusEffect(status, "sunder", 10000, gallery.battleTime);
    statusMultipliers(status, gallery.battleTime);
    gallery.syncBattleOverlays();
    gallery.battlePaused = true;
    game.loop.start(game.step.bind(game));
    return { measurements, catchUpTicks, overlayDraws: counts, statusDraws, cachedGlyphsAfter300Ranks: glyphCount };
  });
  if (option("screenshots")) {
    const directory = option("screenshots"); await mkdir(directory, { recursive: true });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${directory}/performance-desktop.png` });
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${directory}/performance-small.png` });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
