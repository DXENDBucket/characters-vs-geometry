import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const playwright = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const engine = option("engine") ?? "chromium";
const browser = await playwright[engine].launch({ headless: true,
  executablePath: engine === "chromium" ? option("browser") : undefined });
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
    const mod = path => import(performance.getEntriesByType("resource").map(entry => entry.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const { default: Phaser } = await mod("/node_modules/.vite/deps/phaser.js");
    const { createEnemyShape } = await mod("/src/render/unitShapes.ts");
    const { syncChevronVisual } = await mod("/src/render/chevronLeader.ts");
    const { syncEnemyFacingVisual } = await mod("/src/render/enemyFacing.ts");
    const game = window.__testGame;
    game.loop.stop();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const baseline = Object.keys(game.textures.list).sort();
    const scene = new Phaser.Scene("IonChargeRegression");
    game.scene.add("IonChargeRegression", scene, true);
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const shape = createEnemyShape(scene, "chevronLeader");
    const reference = createEnemyShape(scene, "chevronLeader");
    reference.getData("ionChargeOrb").destroy();
    reference.setData("ionChargeOrb", undefined);
    const unit = { kind: "chevronLeader", shape, statusEffects: [], movementDirection: -1, ionChargeMs: 0 };
    const legacy = { ...unit, shape: reference };
    const orb = shape.getData("ionChargeOrb");
    const key = orb.list[0].texture.key;
    check(orb.list.length === 3 && orb.list.every(image => image.texture.key === key), "Orb layers do not share one texture");
    for (let rank = 1; rank <= 50; rank++) {
      const extra = createEnemyShape(scene, rank === 1 ? "chevronLeader" : `chevronLeader${rank}`);
      check(extra.getData("ionChargeOrb").list.every(image => image.texture.key === key), "Rank duplicated the disk texture");
      extra.destroy();
    }
    const target = scene.add.renderTexture(0, 0, 128, 128).setVisible(false);
    const pixels = async object => {
      target.clear().draw(object, 64, 64);
      const image = await new Promise(resolve => target.snapshot(resolve));
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 128, 128).data;
    };
    const comparisons = [];
    for (const elapsed of [500, 1500, 6000, 10500, 11990]) {
      unit.ionChargeMs = legacy.ionChargeMs = elapsed;
      for (const direction of [-1, 1, -1]) {
        unit.movementDirection = legacy.movementDirection = direction;
        syncEnemyFacingVisual(unit); syncEnemyFacingVisual(legacy);
        const scale = (2 + Math.min(1, elapsed / 12000) * 7) / 16;
        check(orb.visible && orb.x === (direction === 1 ? 12 : -12) && Math.abs(Math.abs(orb.scaleX) - scale) < 1e-9 &&
          Math.abs(orb.scaleY - scale) < 1e-9, "Turning within a charge tick changed orb position or radius");
        const a = await pixels(shape), b = await pixels(reference);
        let difference = 0, energy = 0, lit = 0;
        const center = 64 + orb.x;
        for (let y = 40; y < 88; y++) for (let x = center - 23; x <= center + 23; x++) {
          const offset = (y * 128 + x) * 4;
          for (let c = 0; c < 4; c++) { difference += Math.abs(a[offset + c] - b[offset + c]); energy += b[offset + c]; }
          if (a[offset + 3]) lit++;
        }
        const relativeDifference = difference / energy;
        check(lit > 100 && Number.isFinite(relativeDifference) && relativeDifference < .05,
          `Orb raster comparison failed at ${elapsed}/${direction}: ${relativeDifference}, lit=${lit}`);
        comparisons.push({ elapsed, direction, relativeDifference });
        check(shape.getData("ionCharge").commandBuffer.length < reference.getData("ionCharge").commandBuffer.length,
          "Charge retained all filled-circle commands");
      }
    }
    unit.ionChargeMs = 0; syncChevronVisual(unit);
    check(!orb.visible, "Reset charge left the orb visible");
    unit.ionChargeMs = 9000; syncChevronVisual(unit);
    unit.chevronAssault = true; syncChevronVisual(unit);
    check(!orb.visible && shape.getData("ionCharge").commandBuffer.length === 0, "Assault left charge visuals active");
    target.destroy(); shape.destroy(); reference.destroy();
    game.scene.stop("IonChargeRegression"); game.scene.remove("IonChargeRegression");
    check(!game.textures.exists(key), "Shared orb texture survived scene shutdown");
    check(JSON.stringify(Object.keys(game.textures.list).sort()) === JSON.stringify(baseline), "Render regression leaked textures");
    return { comparisons, cleanup: "baseline restored" };
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ engine, browser: browser.version(), ...result }));
} finally { await browser.close(); }
