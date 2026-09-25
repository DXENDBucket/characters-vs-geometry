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
    const { LOCAL_BATTLE_ACTOR } = await mod("/src/game/battleParticipants.ts");
    const { towerOperationRef } = await mod("/src/game/battleOperations.ts");
    const { dispatchBattleUi, assertSemanticRecording } = await mod("/scripts/helpers/battle-ui.mjs");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await mod("/src/game/validateBattleSave.ts");
    const cfg = await mod("/src/config.ts"), progress = await mod("/src/progress.ts");
    const game = window.__testGame, check = (value, label) => { if (!value) throw Error(label); };
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    const participants = [LOCAL_BATTLE_ACTOR, { id: "alice", permissions: ["build", "edit", "skill"] },
      { id: "bob", permissions: ["build", "edit"] }, { id: "observer", permissions: [] }];
    const data = { levelId: "IF-1", seed: 195, selectedCards: ["A", "B", "X", "w", "="], participants };
    const start = (key, options = data) => {
      game.scene.add(key, new GameScene(key), false); game.scene.start(key, options); return game.scene.getScene(key);
    };
    const host = start("AuthorityHost"), authority = host.commandAuthority;
    let alice = authority.connect("alice");
    const bob = authority.connect("bob"), observer = authority.connect("observer");
    const message = (sequence, intent) => ({ version: 1, battleId: authority.battleId, sequence, intent });
    const send = (channel, request, result) => {
      const receipt = authority.receiveText(channel, JSON.stringify(request));
      check(receipt.result === result, `${request.intent.type}: ${JSON.stringify(receipt)}, expected ${result}`);
      return receipt;
    };
    const control = control => ({ type: "control", control }), op = operation => ({ type: "operation", operation });
    const deploy = (card, lane, column, expected = null) => op({ type: "deploy", card, cell: { lane, column }, expected });
    let localCalls = 0;
    const submit = authority.submitTrusted.bind(authority);
    authority.submitTrusted = (...args) => { localCalls++; return submit(...args); };
    dispatchBattleUi(host, { type: "debugMode", enabled: true });
    dispatchBattleUi(host, { type: "tool", action: "tool:debugChars" });
    dispatchBattleUi(host, { type: "selectCard", id: "A" });
    dispatchBattleUi(host, { type: "pointer", pointer: { x: cfg.BOARD_X + .5 * cfg.CELL_WIDTH,
      y: cfg.BOARD_Y + 3.5 * cfg.CELL_HEIGHT, ctrl: false, shift: false, right: false } });
    check(localCalls === 3 && host.towers.some(t => t.type === "A"), "Local UI did not use authority");
    const request = message(0, deploy("B", 3, 1)), receipt = send(alice, request, "deployed");
    const afterDeploy = host.battleChecksum(), count = host.towers.length;
    check(JSON.stringify(authority.receive(alice, request)) === JSON.stringify(receipt), "Retry receipt changed");
    check(host.battleChecksum() === afterDeploy && host.towers.length === count, "Retry upgraded, charged or duplicated tower");
    check(authority.receive(alice, message(0, deploy("B", 3, 2))).reason === "conflict", "Conflicting retry accepted");
    check(authority.receive(alice, { ...request, actorId: "local" }).reason === "invalid", "Payload impersonation accepted");
    send(observer, message(0, deploy("X", 0, 0)), "forbidden");
    send(alice, message(1, control({ type: "debugChars" })), "forbidden");
    send(bob, message(0, deploy("B", 3, 2)), "cooldown");
    send(bob, message(1, deploy("A", 3, 0)), "stale");
    check(host.battleChecksum() === afterDeploy, "Rejected requests mutated real battle");
    check(authority.receive(alice, message(3, deploy("X", 0, 0))).reason === "gap", "Out-of-order input executed");
    send(alice, message(2, deploy("X", 0, 0)), "deployed");
    const oldChannel = alice; authority.disconnect(alice); alice = authority.connect("alice");
    check(authority.describe(alice).nextSequence === 3, "Reconnect has no authoritative sequence hint");
    check(authority.receive(oldChannel, message(3, deploy("w", 2, 1))).reason === "forbidden", "Disconnected channel survived");
    check(JSON.stringify(authority.receive(alice, request)) === JSON.stringify(receipt), "Reconnect lost receipt");
    send(alice, message(3, deploy("w", 2, 1)), "deployed");
    const wing = host.towers.find(t => t.type === "w");
    for (let i = 0; i < 240; i++) host.update(0, 1000 / 60);
    send(alice, message(4, op({ type: "skill", skill: "w", targets: [towerOperationRef(wing)], point: null })), "handled");
    check(wing.flyingUntil > host.battleTime, "Authorized skill did not affect live unit");
    send(bob, message(2, op({ type: "skill", skill: "w", targets: [towerOperationRef(wing)], point: null })), "forbidden");
    host.openPauseMenu();
    send(bob, message(3, op({ type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 3, column: 0 }, expected: null })), "handled");
    check(host.menuOpen && host.edgeTowers.length === 1, "Local modal rejected explicit peer command"); host.closePauseMenu();
    for (let i = 0; i < 360; i++) host.update(0, 1000 / 60);
    const checkpoint = captureBattleSnapshot(host.battleState());
    validateBattleSave(checkpoint, host.wave);
    const restored = start("AuthorityRestore", { ...data, participants: undefined });
    const staleAuthority = restored.commandAuthority, staleChannel = staleAuthority.connect("local");
    restored.applyBattleSave(restoreBattleSnapshot(restored, checkpoint)); restored.battlePaused = false;
    check(staleAuthority.receive(staleChannel, { ...message(0, control({ type: "debugChars" })), battleId: staleAuthority.battleId }).status === "rejected", "Pre-restore authority survived");
    check(restored.commandAuthority.connect("alice"), "Snapshot lost participant capabilities");
    check(host.battleChecksum() === restored.battleChecksum(), "Checkpoint state changed");
    for (let i = 0; i < 1200; i++) { host.update(0, 1000 / 60); restored.update(0, 1000 / 60); }
    check(host.battleChecksum() === restored.battleChecksum(), "Checkpoint continuation changed");
    const expected = host.battleChecksum(), replay = assertSemanticRecording(host);
    check(replay.commands.some(c => c.command.actorId === "alice") && replay.commands.some(c => c.command.actorId === "bob"), "Actor attribution lost");
    const persistent = JSON.stringify(localStorage);
    for (const [index, delta] of [1000 / 30, 1000 / 144].entries()) {
      const scene = start(`AuthorityReplay${index}`, { replay });
      for (let i = 0; scene.simulation.tick < replay.endTick && i < 20000; i++) scene.update(0, delta);
      check(scene.battleChecksum() === expected && scene.simulation.tick === replay.endTick,
        `Participant replay ${index}: ${scene.battleChecksum()} / ${expected}`);
      check(scene.commandAuthority.connect("alice") === undefined, "Replay accepted peer connection");
    }
    check(JSON.stringify(localStorage) === persistent, "Participant replay modified player progress");
    const resumedReplay = restored.exportReplay(), resumed = start("AuthorityCheckpointReplay", { replay: resumedReplay });
    for (let i = 0; resumed.simulation.tick < resumedReplay.endTick && i < 20000; i++) resumed.update(0, 1000 / 144);
    check(resumed.battleChecksum() === expected, "Participant checkpoint replay diverged");
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    check(authority.receive(alice, message(5, deploy("A", 3, 2))).reason === "forbidden", "Shutdown authority accepted request");
    return { ticks: replay.endTick, checksum: expected, commands: replay.commands.length, participants: participants.length,
      liveUi: true, deduplication: true, reconnectSameHost: true, checkpointReplay: true };
  });
  assert.deepEqual(errors, []); console.log("Live participant authority, retries, saves and replay passed", result);
} finally { await browser.close(); }
