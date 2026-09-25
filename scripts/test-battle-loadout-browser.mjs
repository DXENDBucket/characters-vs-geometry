import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }), errors = [];
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
    const { towerOperationRef, edgeOperationRef } = await mod("/src/game/battleOperations.ts");
    const { createCardViews, destroyCardViews, updateCardViews } = await mod("/src/render/gameUi.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const progress = await mod("/src/progress.ts");
    const check = (value, message) => { if (!value) throw Error(message); };
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const data = { levelId: "IF-1", seed: 712, selectedCards: ["A", "?A", "c", "=", "b", "w"] };
    const start = (key, options = data) => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options); return game.scene.getScene(key);
    };
    const a = start("LoadoutWithView"), b = start("LoadoutWithoutView");
    const equal = label => check(a.battleChecksum() === b.battleChecksum(), `${label}: ${a.battleChecksum()} / ${b.battleChecksum()}`);
    const send = (scene, control) => check(scene.submitPlayerControl("local", control) === "handled", control.type);
    const op = (scene, operation, expected = "handled") => {
      const result = scene.submitPlayerOperation("local", operation);
      check(result === expected, `${JSON.stringify(operation)}: ${result}, expected ${expected}; tick ${scene.simulation.tick}`);
    };
    const dropView = scene => { scene.cardList?.destroy(); scene.cardList = undefined; };
    const advance = count => { for (let i = 0; i < count; i++) { a.update(0, 1000 / 60); b.update(0, 1000 / 60); } };
    const deploy = (scene, card, lane, column) => op(scene, { type: "deploy", card, cell: { lane, column }, expected: null }, "deployed");
    for (const scene of [a, b]) {
      check(scene.cardStates === scene.world.loadout.cards, "Scene copied authoritative slots");
      for (const card of scene.cardStates) check(!("frame" in card) && !("displayTime" in card), "Renderer fields leaked into card state");
      send(scene, { type: "debugMode", enabled: true }); send(scene, { type: "debugChars" });
      deploy(scene, "c", 0, 0); deploy(scene, "A", 3, 1); deploy(scene, "?A", 4, 1);
      op(scene, { type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 3, column: 0 }, expected: null });
    }
    const states = b.cardStates, slot = b.cardStatesById.get("?A"), beforeViewChanges = b.battleChecksum();
    for (let i = 0; i < 3; i++) {
      dropView(b); b.createCardList(); b.updateCards();
      check(b.cardStates === states && b.cardStatesById.get("?A") === slot, "Rebuilding a view recreated card state");
      check(b.battleChecksum() === beforeViewChanges, "Rebuilding a view reset cooldowns");
    }
    const extraView = createCardViews(b, b.cardStates);
    check(extraView[1].state === slot && b.cardList.cards[1].state === slot, "Multiple views did not share model");
    extraView[1].displayTime = -10000;
    destroyCardViews(extraView); check(b.battleChecksum() === beforeViewChanges, "Destroying secondary view changed state");
    dropView(b);
    // Suppress only the renderer factory. The actual reselection/deployment/control implementations run unchanged.
    const originalFactory = b.createCardList.bind(b); let rebuilds = 0;
    b.createCardList = () => { rebuilds++; };
    advance(1500);
    for (const scene of [a, b]) {
      const clock = scene.towers.find(t => t.inPlay && t.type === "c"); check(clock, "Missing live clock fixture");
      op(scene, { type: "skill", skill: "c", targets: [towerOperationRef(clock)], point: null });
      const tower = scene.towers.find(t => t.inPlay && t.type === "A"); check(tower, "Missing live auto-upgrade fixture");
      op(scene, { type: "autoUpgrade", targets: [towerOperationRef(tower), edgeOperationRef(scene.edgeTowers[0])], enabled: true });
    }
    advance(300); equal("cooldowns and auto upgrades without card rendering");
    check(b.cardTime > b.battleTime, "Clock skill did not accelerate eligible card clocks");
    check(b.edgeTowers[0].level > 1, "View-free edge auto-upgrades did not run");
    advance(12700);
    for (const scene of [a, b]) {
      send(scene, { type: "debugChars" });
      deploy(scene, "w", 6, 0);
      const tower = scene.towers.find(t => t.inPlay && t.type === "w");
      op(scene, { type: "effect", card: "b", cell: { lane: 6, column: 0 }, target: towerOperationRef(tower) });
      send(scene, { type: "reselect", cards: ["w", "B", "?B", "="] });
      const money = scene.chars, deadline = scene.cardStatesById.get("w").readyAt;
      check(scene.submitPlayerOperation("local", { type: "deploy", card: "w", cell: { lane: 6, column: 1 }, expected: null }) === "cooldown",
        "Reselection reset retained-card cooldown");
      check(scene.chars === money && scene.cardStatesById.get("w").readyAt === deadline, "Rejected deployment mutated cooldown/currency");
      op(scene, { type: "deploy", card: "?B", cell: { lane: 6, column: 1 }, expected: null }, "cooldown");
      deploy(scene, "B", 6, 1);
    }
    check(rebuilds === 1 && !b.cardList, "Suppressed card presentation unexpectedly recreated itself");
    equal("reselection and deployment without card rendering"); advance(240);
    for (const scene of [a, b]) deploy(scene, "?B", 6, 2);
    advance(2); equal("deferred attachment and imitator readiness after reselect");
    const expected = b.battleChecksum(), replay = b.exportReplay();
    originalFactory(); b.updateCards(); check(b.battleChecksum() === expected, "Late view attachment changed battle");
    const view = b.cardList.cards[0];
    check(view.state === b.cardStates[0] && view.displayTime === b.cardTimeFor("w"), "Reattached view did not use current slot/clock");
    const fresh = createCardViews(b, b.cardStates);
    for (const card of fresh) card.displayTime = b.cardTimeFor(card.state.definition.id);
    updateCardViews(fresh, { extraction: b.extraction, selectedCardId: b.selectedCardId, chars: b.effectiveChars(),
      eraserMode: false, shifterMode: false, autoUpgradeMode: false, debugDamageMode: false });
    check(fresh[0].cooldownFill.width === view.cooldownFill.width, "Independent card views rendered different cooldown ratios");
    destroyCardViews(fresh);
    const restored = start("LoadoutRestored", { ...data, selectedCards: [...b.selectedCardIds] });
    restored.applyBattleSave(restoreBattleSnapshot(restored, JSON.parse(JSON.stringify(captureBattleSnapshot(b.battleState())))));
    check(restored.battleChecksum() === expected, "Card deadlines changed after checkpoint restore");
    for (const [index, delta] of [1000 / 30, 1000 / 144].entries()) {
      const scene = start(`LoadoutReplay${index}`, { replay });
      let frames = 0;
      while (scene.simulation.tick < replay.endTick && frames++ < 60000) scene.update(0, delta);
      check(scene.battleChecksum() === expected, "View-free recording replay diverged");
      game.scene.stop(scene.sys.settings.key);
    }
    return { ticks: replay.endTick, checksum: expected, rendererRebuilds: rebuilds };
  });
  assert.deepEqual(errors, []);
  console.log("Pure card model / absent and rebuilt views / live cooldowns / reselection / checkpoint / replay passed", result);
} finally { await browser.close(); }
