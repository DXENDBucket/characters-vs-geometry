import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  await mkdir("logs", { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async () => {
    window.__module = path => import(performance.getEntriesByType("resource").map(r => r.name)
      .find(url => new URL(url).pathname === path) ?? path);
    window.__audio = await window.__module("/src/audio/player.ts");
    window.__prefs = await window.__module("/src/settings/preferences.ts");
  });
  assert.equal(await page.evaluate(() => !!window.__audio.soundPlayer.context), false, "Audio must wait for input");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  assert.equal(await page.evaluate(() => !!window.__audio.soundPlayer.context), false);
  await page.mouse.click(10, 10);
  await page.waitForFunction(() => window.__audio.soundPlayer.context?.state === "running");
  const audio = await page.evaluate(async () => {
    const { soundPlayer: player, MAX_AUDIO_VOICES } = window.__audio;
    const analyzer = player.context.createAnalyser();
    analyzer.fftSize = 256;
    player.master.connect(analyzer);
    const silent = player.context.createGain(); silent.gain.value = 0;
    analyzer.connect(silent).connect(player.context.destination);
    const results = Array.from({ length: 100 }, () => player.play("victory"));
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      const samples = new Float32Array(256); analyzer.getFloatTimeDomainData(samples);
      peak = Math.max(peak, ...samples.map(Math.abs));
    }
    player.master.disconnect(analyzer); analyzer.disconnect(); silent.disconnect();
    player.play("deploy");
    const buffer = player.buffers.get("deploy");
    await new Promise(resolve => setTimeout(resolve, 160));
    player.play("deploy");
    const reused = buffer === player.buffers.get("deploy");
    player.stop(); player.lastPlayed.clear();
    const { soundDefinitions } = await window.__module("/src/audio/sounds.ts");
    for (const id of Object.keys(soundDefinitions)) player.play(id);
    const limited = player.voices.size <= MAX_AUDIO_VOICES;
    const priority = [...player.voices].some(voice => voice.id === "victory");
    await new Promise(resolve => setTimeout(resolve, 900));
    return { accepted: results.filter(Boolean).length, peak, reused, limited, priority, remaining: player.voices.size };
  });
  assert.equal(audio.accepted, 1); assert(audio.peak > .001, "Live Web Audio output is silent");
  assert(audio.reused && audio.limited && audio.priority); assert.equal(audio.remaining, 0);
  console.log("Audio graph", audio);

  const start = async (key, data = {}) => {
    await page.evaluate(({ key, data }) => {
      const g = window.__testGame;
      for (const scene of g.scene.getScenes(true)) g.scene.stop(scene.sys.settings.key);
      g.scene.start(key, data);
    }, { key, data });
    await page.waitForTimeout(250);
  };
  const at = (x, y) => page.evaluate(({ x, y }) => {
    const g = window.__testGame, rect = g.canvas.getBoundingClientRect();
    return { x: rect.x + x * rect.width / g.scale.width, y: rect.y + y * rect.height / g.scale.height };
  }, { x, y });
  const click = async (x, y) => { const p = await at(x, y); await page.mouse.click(p.x, p.y); };
  await start("SettingsScene");
  await click(950, 634);
  assert.equal(await page.evaluate(() => window.__prefs.getAudioSettings().muted), true);
  assert.equal(await page.evaluate(() => window.__audio.playSound("deploy")), false);
  await click(950, 634);
  const p = await at(574, 684), end = await at(668, 684);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__prefs.getAudioSettings().master), .8);
  await click(1150, 634);
  await page.screenshot({ path: "logs/audio-settings-desktop.png" });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(200);
  await click(587, 684);
  const smallVolume = await page.evaluate(() => window.__prefs.getAudioSettings().master);
  assert(Math.abs(smallVolume - .2) <= .02);
  await page.screenshot({ path: "logs/audio-settings-small.png" });
  await click(222, 204);
  await page.waitForTimeout(650);
  await page.screenshot({ path: "logs/audio-settings-english.png" });

  await start("GameScene", { levelId: "1-1", selectedCards: ["A"], difficulty: 0, seed: 42 });
  await page.waitForFunction(() => window.__audio.soundPlayer.music.element?.currentTime > .05);
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.music.track), "battle");
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.music.element.loop), true);
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.music.element.playbackRate), 1);
  await page.evaluate(() => window.__testGame.scene.getScene("GameScene").openPauseMenu());
  await page.waitForFunction(() => window.__audio.soundPlayer.music.element.paused);
  const pausedAt = await page.evaluate(() => window.__audio.soundPlayer.music.element.currentTime);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.music.element.currentTime), pausedAt);
  await page.evaluate(() => window.__testGame.scene.getScene("GameScene").closePauseMenu());
  await page.waitForFunction(time => window.__audio.soundPlayer.music.element.currentTime > time, pausedAt);
  await page.evaluate(() => { const s = window.__testGame.scene.getScene("GameScene"); s.battlePaused = true; s.chars = 10000; window.__audio.soundPlayer.buffers.clear(); });
  await click(240 + 2.5 * 78, 138 + 3.5 * 78);
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.buffers.has("deploy")), true);
  await page.evaluate(() => { const s = window.__testGame.scene.getScene("GameScene"); s.cardStates[0].readyAt = 0; });
  await click(240 + 2.5 * 78, 138 + 3.5 * 78);
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.buffers.has("upgrade")), true);
  await page.evaluate(() => { window.__testGame.scene.getScene("GameScene").eraserMode = true; });
  await click(240 + 2.5 * 78, 138 + 3.5 * 78);
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.buffers.has("erase")), true);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForFunction(() => window.__audio.soundPlayer.context.state === "suspended");
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.voices.size), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => window.__audio.soundPlayer.context.state === "running");
  await start("GameScene", { levelId: "1-10", selectedCards: ["A"], difficulty: 0, seed: 42 });
  await page.waitForFunction(() => window.__audio.soundPlayer.music.element?.currentTime > .05);
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.music.track), "boss");
  assert.match(await page.evaluate(() => window.__audio.soundPlayer.music.element.src), /cubic-warning.mp3$/);
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.music.element.error), null);
  await start("SettingsScene");
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.music.element.paused), true);
  assert.equal(await page.evaluate(() => window.__audio.soundPlayer.music.track), undefined);
  await page.reload();
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const persisted = await page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").map(r => r.name).find(url => new URL(url).pathname === "/src/settings/preferences.ts");
    return (await import(url)).getAudioSettings();
  });
  assert.equal(persisted.master, smallVolume);
  assert.deepEqual(errors, []);
  await page.close();

  const unsupported = await browser.newPage();
  unsupported.on("pageerror", error => errors.push(error.message));
  await unsupported.addInitScript(() => { window.AudioContext = undefined; });
  await unsupported.goto(option("url") ?? "http://127.0.0.1:5173");
  await unsupported.mouse.click(10, 10);
  await unsupported.waitForTimeout(300);
  assert(await unsupported.locator("canvas").count());
  await unsupported.close();
  assert.deepEqual(errors, []);
  console.log("Audio controls, persistence, battle feedback, lifecycle and unavailable-device fallback passed.");
} finally { await browser.close(); }
