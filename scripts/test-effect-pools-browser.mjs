import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const playwright = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const engine = option("engine") ?? "chromium";
const browser = await playwright[engine].launch({ headless: true,
  executablePath: engine === "chromium" ? option("browser") : undefined });
try {
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const result = await page.evaluate(async () => {
    const effects = await import("/src/render/combatEffects.ts");
    const game = window.__testGame; game.loop.stop();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    game.scene.add("PoolTest", { create() {} }, true);
    const scene = game.scene.getScene("PoolTest"), manager = scene.tweens;
    const check = (value, message) => { if (!value) throw Error(message); };
    const emit = () => {
      effects.makeEraseMark(scene, 400, 300);
      effects.makeShockPulse(scene, 400, 300, 80, 80);
      effects.makeAutoUpgradePulse(scene, 400, 300);
      effects.makeProductionPulse(scene, 400, 300, 25);
      effects.makeEnemyLaserEffect(scene, 400, 300, 500);
    };
    const scan = manager.getTweensOf;
    let scans = 0;
    manager.getTweensOf = function(...args) { scans++; return scan.apply(this, args); };
    // Leave completed tweens in the real manager while their objects get reused.
    emit();
    const old = [...manager.tweens], targets = new Set(old.flatMap(tween => tween.targets));
    check(targets.size === 7, "Expected all four pool types and the shared laser tween");
    for (let step = 0; step < 80; step++) for (const tween of old) tween.forward(16);
    check(old.every(tween => tween.isPendingRemove()), "Effects did not finish");
    check([...targets].every(target => !target.active && !target.visible), "Completed objects still visible");
    emit();
    const next = manager.tweens.filter(tween => !old.includes(tween));
    check(next.flatMap(tween => tween.targets).every(target => targets.has(target)), "Completed objects were not reused");
    manager.getDelta = () => 16;
    manager.tick();
    check([...targets].every(target => target.scene === scene && target.active), "Old tween cleanup damaged reused objects");
    check(next.every(tween => tween.isActive()), "New tween was canceled");
    const unrelated = { x: 0 };
    const background = manager.add({ targets: unrelated, x: 100, duration: 10000 });
    for (let step = 0; step < 80; step++) manager.tick();
    check(background.isActive() && unrelated.x > 0, "Unrelated tween was changed");
    check(scans === 0, "Pooled acquisition scanned active tweens");
    // An active shield is different: replacing its animation still cancels the old one.
    const tower = { inPlay: true, body: { x: 400, y: 300 } };
    effects.makeTowerPipelineShield(scene, tower, "magic");
    effects.makeTowerPipelineShield(scene, tower, "physical");
    check(scans === 1, "Refreshing an active shield must still cancel its tween");
    for (let step = 0; step < 40; step++) manager.tick();
    check([...targets].every(target => !target.visible && !target.active), "Effect did not return to pool");
    game.scene.stop("PoolTest"); game.scene.start("PoolTest");
    emit();
    check(scene.children.list.every(target => !targets.has(target)), "Restart reused destroyed objects");
    game.scene.stop("PoolTest"); game.scene.remove("PoolTest");
    return { reusedObjects: targets.size, scans };
  });
  assert.deepEqual(errors, []);
  console.log("Real Phaser pooled effects, pending cleanup, active shields and restart passed", { engine, ...result });
} finally { await browser.close(); }
