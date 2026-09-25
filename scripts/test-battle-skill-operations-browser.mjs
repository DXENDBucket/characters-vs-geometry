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
    const { dispatchBattleUi: input, assertSemanticRecording } = await import("/scripts/helpers/battle-ui.mjs");
    const cfg = await mod("/src/config.ts"), progress = await mod("/src/progress.ts");
    const { battleChecksum } = await mod("/src/game/battleChecksum.ts");
    const { towerOperationRef: ref } = await mod("/src/game/battleOperations.ts");
    const { executeLiveBattleOperation } = await mod("/src/game/battleOperationRuntime.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const check = (value, message) => { if (!value) throw Error(message); };
    const game = window.__testGame;
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const data = { levelId: "IF-1", seed: 809, selectedCards: ["S", "c", "w", "o", "j", "#", "&", "i", "m", "@"] };
    const start = (key, options = data) => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options);
      return game.scene.getScene(key);
    };
    const a = start("SkillPointer"), b = start("SkillOperations");
    const calls = [], apply = a.applyPlayerOperation.bind(a);
    a.applyPlayerOperation = (actor, operation) => { calls.push(operation.type); return apply(actor, operation); };
    const cellPoint = (lane, column) => ({ x: cfg.BOARD_X + (column + .5) * cfg.CELL_WIDTH,
      y: cfg.BOARD_Y + (lane + .5) * cfg.CELL_HEIGHT });
    const click = (scene, lane, column, shift = false) => input(scene, { type: "pointer",
      pointer: { ...cellPoint(lane, column), shift, ctrl: false, right: false } });
    const select = (scene, id) => input(scene, { type: "selectCard", id });
    const unit = (scene, type, lane, column) => scene.towers.find(t => t.inPlay && t.type === type && t.lane === lane && t.column === column);
    const send = (operation, expected = "handled", scene = b) => {
      const result = scene.submitPlayerOperation("local", JSON.parse(JSON.stringify(operation)));
      check(result === expected, `${operation.type}: expected ${expected}, got ${result}`);
    };
    const hash = scene => battleChecksum(scene.battleState());
    const equal = label => check(hash(a) === hash(b), `${label}: ${hash(a)} / ${hash(b)}`);
    const debug = () => { for (const scene of [a, b]) input(scene, { type: "tool", action: "tool:debugChars" }); };
    for (const scene of [a, b]) input(scene, { type: "debugMode", enabled: true });
    debug(); debug();
    const deploy = (card, lane, column) => {
      select(a, card); click(a, lane, column);
      send({ type: "deploy", card, cell: { lane, column }, expected: null }, "deployed");
      equal(`deploy ${card}`);
    };
    deploy("S", 0, 0); debug(); deploy("S", 1, 0);
    deploy("c", 2, 0); debug(); deploy("c", 2, 1);
    deploy("w", 3, 0); deploy("o", 4, 0); deploy("j", 5, 0); deploy("#", 6, 0);
    debug(); deploy("w", 6, 2); deploy("@", 6, 1);
    deploy("&", 6, 6);
    // A direct topology command works even if the local player is aiming elsewhere.
    b.topology.begin(unit(b, "&", 6, 6));
    click(a, 5, 6);
    const topology = { type: "topology", target: ref(unit(b, "&", 6, 6)), cell: { lane: 5, column: 6 } };
    send(topology); equal("topology");
    check(b.topology.selectedSource() === unit(b, "&", 6, 6), "Explicit topology cleared local selection");
    b.topology.cancel();
    const before = b.battleChecksum(); send(topology, "unavailable");
    check(b.battleChecksum() === before, "Repeated topology changed the established swap");
    for (let i = 0; i < 2000; i++) { a.update(0, 1000 / 60); b.update(0, 1000 / 60); }
    equal("warmup");
    check(unit(b, "@", 6, 1)?.copiedType === "w", "Copied skill fixture was not active");
    select(a, "m"); select(b, "&");
    for (const [skill, lane, column, shift] of [["c", 2, 0, true], ["w", 3, 0, false], ["o", 4, 0, false], ["j", 5, 0, false], ["w", 6, 1, false]]) {
      const targets = skill === "c" ? [ref(unit(b, "c", 2, 0)), ref(unit(b, "c", 2, 1))] : [ref(b.occupied.get(`${lane}:${column}`))];
      click(a, lane, column, shift);
      send({ type: "skill", skill, targets, point: null }); equal(`skill ${skill}`);
      const checksum = b.battleChecksum();
      send({ type: "skill", skill, targets, point: null }, "cooldown");
      check(b.battleChecksum() === checksum, "Duplicate activation spent SP twice");
    }
    const s = unit(b, "S", 0, 0), s2 = unit(b, "S", 1, 0), aim = cellPoint(3, 8);
    const mortar = { type: "skill", skill: "S", targets: [ref(s), ref(s2)], point: aim };
    const restricted = b.createPlayerOperationRuntime(); restricted.authorize = (_actor, _op, affected) => !affected.towers.includes(s2);
    const deniedHash = b.battleChecksum();
    check(executeLiveBattleOperation(restricted, "local", mortar) === "forbidden", "Group skill skipped ownership preflight");
    check(b.battleChecksum() === deniedHash, "Denied group cast changed battle");
    click(a, 0, 0, true);
    b.towerSkills.activateSpellMortarTargeting([s2], aim.x, aim.y);
    click(a, 3, 8); send(mortar); equal("mortar volley");
    check(b.towerSkills.hasSpellMortarTargeting(), "Explicit S cleared local aiming");
    for (let i = 0; i < 120; i++) { a.update(0, 1000 / 60); b.update(0, 1000 / 60); }
    equal("S recovery while another player is aiming");
    check(s2.skills.spellMortar.sp > 0, "Local aim froze remote caster SP recovery");
    b.towerSkills.cancelSpellMortarTargeting();
    // Capture with an active volley, so restore/replay must preserve delayed actions and their identities.
    const checkpoint = JSON.parse(JSON.stringify(captureBattleSnapshot(b.battleState())));
    const restored = start("SkillRestore"); restored.applyBattleSave(restoreBattleSnapshot(restored, checkpoint)); restored.battlePaused = false;
    const push = { type: "push", target: ref(unit(b, "#", 6, 0)), cell: { lane: 6, column: 1 } };
    const pushRuntime = b.createPlayerOperationRuntime(); pushRuntime.authorize = (_actor, _op, affected) => !affected.towers.includes(unit(b, "w", 6, 2));
    const pushHash = b.battleChecksum();
    check(executeLiveBattleOperation(pushRuntime, "local", push) === "forbidden", "Push skipped downstream target ownership");
    check(b.battleChecksum() === pushHash, "Denied push changed SP or position");
    click(a, 6, 0); click(a, 6, 1);
    b.towerPush.begin(unit(b, "#", 6, 0));
    send(push); send(push, "handled", restored); equal("push");
    check(b.towerPush.selectedSource() === unit(b, "#", 6, 0), "Explicit push cleared local targeting");
    b.towerPush.cancel();
    check(restored.battleChecksum() === b.battleChecksum(), "Restored push/volley state diverged");
    for (let i = 0; i < 180; i++) { a.update(0, 1000 / 60); b.update(0, 1000 / 60); restored.update(0, 1000 / 60); }
    check(restored.battleChecksum() === b.battleChecksum(), "Restored volley execution diverged"); equal("continued skills");
    debug(); deploy("m", 3, 4); deploy("i", 3, 3);
    check(unit(b, "i", 3, 5)?.mirrorGroupId, "Shock mirror fixture missing");
    const trigger = { type: "trigger", target: ref(unit(b, "i", 3, 3)), behavior: "i" };
    const triggerRuntime = b.createPlayerOperationRuntime(); triggerRuntime.authorize = (_actor, _op, affected) => !affected.towers.includes(unit(b, "i", 3, 5));
    const triggerHash = b.battleChecksum();
    check(executeLiveBattleOperation(triggerRuntime, "local", trigger) === "forbidden", "Shock skipped mirror ownership");
    check(b.battleChecksum() === triggerHash, "Denied shock removed a mirror");
    select(a, "c"); click(a, 3, 3); send(trigger); equal("mirror shock");
    check(!b.towers.some(t => t.inPlay && t.type === "i"), "Triggered mirror survived"); send(trigger, "stale");
    // A stale copied ability cannot turn into a different command after @ changes form.
    const copy = unit(b, "@", 6, 2), oldSkill = copy.copiedType; copy.copiedType = "c";
    const staleHash = b.battleChecksum();
    check(executeLiveBattleOperation(b.createPlayerOperationRuntime(), "local",
      { type: "skill", skill: "w", targets: [ref(copy)], point: null }) === "stale", "Copied behavior guard missing");
    check(b.battleChecksum() === staleHash, "Stale copied ability mutated state"); copy.copiedType = oldSkill;
    for (const kind of ["skill", "push", "topology", "trigger"]) check(calls.includes(kind), `UI bypassed ${kind} gate`);
    for (let i = 0; i < 120; i++) { a.update(0, 1000 / 60); b.update(0, 1000 / 60); }
    equal("final");
    const expected = b.battleChecksum(), replay = b.exportReplay(), uiReplay = assertSemanticRecording(a);
    for (const [mode, recording] of [["UI", uiReplay], ["API", replay]]) {
      for (const [index, delta] of [1000 / 30, 1000 / 144].entries()) {
        const scene = start(`SkillReplay${mode}${index}`, { replay: recording });
        for (let i = 0; scene.simulation.tick < recording.endTick && i < 15000; i++) scene.update(0, delta);
        check(scene.battleChecksum() === expected, `${mode} skill replay diverged at ${delta}ms: ${scene.battleChecksum()} / ${expected}`);
      }
    }
    const layers = start("LayerSkillAuthorization", { ...data, selectedCards: ["#", "B", "()", "&"] });
    input(layers, { type: "debugMode", enabled: true });
    for (const [card, lane, column] of [["#", 3, 0], ["B", 3, 1], ["()", 3, 1], ["&", 1, 0], ["&", 2, 0]]) {
      input(layers, { type: "tool", action: "tool:debugChars" });
      send({ type: "deploy", card, cell: { lane, column }, expected: null }, "deployed", layers);
    }
    for (let i = 0; i < 1900; i++) layers.update(0, 1000 / 60);
    const pusher = unit(layers, "#", 3, 0), inner = unit(layers, "B", 3, 1), shell = unit(layers, "()", 3, 1);
    const layeredPush = { type: "push", target: ref(pusher), cell: { lane: 3, column: 1 } };
    const guardRuntime = layers.createPlayerOperationRuntime(); guardRuntime.authorize = (_actor, _op, affected) => !affected.towers.includes(shell);
    const layerHash = layers.battleChecksum();
    check(executeLiveBattleOperation(guardRuntime, "local", layeredPush) === "forbidden", "Push skipped shell authorization");
    check(layers.battleChecksum() === layerHash, "Denied shell push changed state");
    inner.nullified = true;
    const nulHash = layers.battleChecksum(); send(layeredPush, "unavailable", layers);
    check(layers.battleChecksum() === nulHash, "Push moved a NUL inner tower or spent charge"); inner.nullified = false;
    send(layeredPush, "handled", layers);
    check(inner.column === 2 && shell.column === 2 && pusher.column === 0, "Layered push did not preserve shell and inner positions");
    const swapper = unit(layers, "&", 1, 0), otherSwapper = unit(layers, "&", 2, 0);
    const swapRuntime = layers.createPlayerOperationRuntime(); swapRuntime.authorize = (_actor, _op, affected) => !affected.towers.includes(inner);
    const swap = { type: "topology", target: ref(swapper), cell: { lane: 3, column: 2 } }, swapHash = layers.battleChecksum();
    check(executeLiveBattleOperation(swapRuntime, "local", swap) === "forbidden", "Topology skipped destination occupant authorization");
    check(layers.battleChecksum() === swapHash, "Denied topology changed state");
    layers.topology.begin(otherSwapper); send(swap, "handled", layers);
    check(layers.topology.selectedSource() === otherSwapper, "Remote topology cleared another player's target picker");
    send({ ...swap, target: ref(inner) }, "unavailable", layers);
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    return { ticks: replay.endTick, checksum: expected, operations: new Set(calls).size, restored: true };
  });
  assert.deepEqual(errors, []);
  console.log("Semantic skill/UI/save/replay checks passed", result);
} finally { await browser.close(); }
