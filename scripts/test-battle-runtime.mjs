import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
import { load, createRuntime, runtimeFromOptions, cloneCheckpoint, captureBattleSnapshot, battleChecksum, place, step } from "./helpers/battle-runtime.mjs";
const { getTowerSkillState } = load("src/game/skillState.ts");
const { towerOperationRef: ref } = load("src/game/battleOperations.ts");
const { collectBattleEntities } = load("src/game/battleEntityGraph.ts");
const { damageBoss } = load("src/game/unitLifecycle.ts");
const { applyStatusEffect } = load("src/game/statusEffects.ts");
const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { restoreBattleData } = load("src/game/restoreBattleData.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const checksum = runtime => battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0]));
const prepared = (level = "1-9", cards = ["A", "B", "X"]) => {
  const runtime = createRuntime(level, cards);
  runtime.initialize();
  runtime.world.chars = 100000;
  runtime.world.baseIntegrity = 100;
  runtime.session.controls.autoUpgradeEnabled = false;
  return runtime;
};

test("cell seals erase NUL towers and shells permanently, including after restoration", () => {
  for (const seal of ["timed", "warning", "column"]) {
    const runtime = prepared("AE-LM-2", ["B", "()"]);
    const tower = place(runtime, "B", 2, 2), shell = place(runtime, "()", 2, 2);
    const survivor = place(runtime, "B", 3, 3);
    runtime.nullification.start(runtime.world.battleTime, 10000);
    assert.equal(runtime.world.towers.length, 0);
    if (seal === "timed") runtime.cells.sealTimedCell(2, 2, 5000);
    else if (seal === "column") runtime.cells.sealColumn(2);
    else {
      runtime.cells.warnCell(2, 2, BATTLE_STEP_MS, 5000, 0);
      assert.equal(tower.nullified, true, "Warnings alone do not erase towers");
      step(runtime, 2);
    }
    assert.equal(tower.inPlay, false); assert.equal(shell.inPlay, false);
    assert.equal(tower.nullified, undefined); assert.equal(shell.nullified, undefined);
    assert.equal(runtime.nullification.isOccupied(2, 2), false);
    assert.deepEqual(runtime.nullification.snapshot().towers, [survivor]);
    const restored = cloneCheckpoint(runtime);
    for (let i = 0; i < 660; i++) { step(runtime); step(restored); }
    assert.equal(checksum(runtime), checksum(restored));
    assert.equal(runtime.nullification.snapshot(), undefined);
    assert.deepEqual(runtime.world.towers, [survivor]);
    assert.equal(runtime.world.occupied.has("2:2"), false);
  }
});

test("legacy NUL and sealed-cell overlap is cleaned before recovery", () => {
  const runtime = prepared("AE-T-2", ["B"]), tower = place(runtime, "B", 2, 2);
  runtime.nullification.start(0, 10000);
  runtime.world.sealedCells.add("2:2");
  const restored = cloneCheckpoint(runtime);
  step(restored);
  assert.equal(restored.nullification.snapshot(), undefined);
  assert.equal(restored.world.towers.length, 0);
  step(restored, 660);
  assert.equal(restored.world.towers.length, 0);
});

test("archive hazards and seals survive validated replay restoration and expire normally", () => {
  const runtime = prepared("AE-LM-1", ["B"]);
  place(runtime, "B", 0, 12);
  step(runtime, 2040);
  assert.ok(runtime.world.boss?.environmentalDel);
  assert.equal(runtime.world.boss.independentBosses.length, 1);
  const graph = captureBattleSnapshot(runtime.snapshot("B"));
  const { validateBattleSave } = load("src/game/validateBattleSave.ts");
  assert.doesNotThrow(() => validateBattleSave(graph, runtime.world.wave, undefined, true));
  assert.throws(() => validateBattleSave(graph, runtime.world.wave), /Invalid battle save/);
  const restored = cloneCheckpoint(runtime, runtime.session.exportReplay(), true);
  assert.equal(checksum(runtime), checksum(restored));
  const integrity = runtime.world.baseIntegrity;
  for (let i = 0; i < 600; i++) { step(runtime); step(restored); }
  assert.equal(checksum(runtime), checksum(restored));
  assert.equal(runtime.world.boss, null);
  assert.equal(runtime.world.baseIntegrity, integrity);
  assert.equal(runtime.world.timedCellSeals.snapshot().length, 0);
  assert.equal(runtime.world.gameOver, false);
});

test("debug damage targets the clicked DEL and checks only that DEL's invulnerability", () => {
  for (const mode of ["normal", "super"]) {
    const runtime = prepared("AE-T-4");
    runtime.executeControl("local", { type: "debugMode", enabled: true });
    const first = runtime.world.boss, second = first.independentBosses[0];
    const click = boss => runtime.executeControl("local", { type: "debugDamage", mode, point: { x: boss.x, y: boss.y } });
    first.invincibleUntil = Infinity;
    assert.equal(click(second), "handled");
    assert.equal(first.hp, first.maxHp); assert.ok(second.hp < second.maxHp);
    const secondHp = second.hp;
    click(first); assert.equal(first.hp, first.maxHp); assert.equal(second.hp, secondHp);
    first.invincibleUntil = 0; second.invincibleUntil = Infinity;
    click(first); assert.ok(first.hp < first.maxHp);
    click(second); assert.equal(second.hp, secondHp);
  }
});

test("dual DEL combat and independent skill state restore deterministically", () => {
  const runtime = prepared("AE-T-4", ["B"]);
  place(runtime, "B", 3, 1);
  step(runtime, 10);
  const root = runtime.world.boss, second = root.independentBosses[0];
  damageBoss(runtime.lifecycle, 200000, "true", second);
  const restored = cloneCheckpoint(runtime, runtime.session.exportReplay(), true);
  assert.equal(checksum(runtime), checksum(restored));
  assert.equal(restored.world.boss.delSweep, undefined);
  assert.equal(restored.world.boss.independentBosses[0].delSweep.phase, "warning");
  for (let i = 0; i < 240; i++) { step(runtime); step(restored); }
  assert.equal(checksum(runtime), checksum(restored));
});

test("the assembly rejects a world attached to a different session random stream", () => {
  const a = createRuntime(), b = createRuntime();
  const { BattleRuntime } = load("src/game/battleRuntime.ts");
  assert.throws(() => new BattleRuntime(a.world, b.session), /one random stream/);
});

test("complete assembly boots without display factories and advances actual waves, targeting, damage and production", () => {
  const runtime = prepared();
  for (let lane = 0; lane < 7; lane++) { place(runtime, "A", lane, 9); place(runtime, "B", lane, 11); }
  place(runtime, "X", 3, 0);
  const before = runtime.world.chars;
  step(runtime, 3600);
  assert.ok(runtime.world.wave >= 2);
  assert.ok(runtime.world.enemiesDefeated > 0);
  assert.ok(runtime.world.chars > before);
  const entities = collectBattleEntities(runtime.snapshot("A"));
  assert.ok(entities.length > 0);
  assert.ok(entities.every(({ entity }) => !("body" in entity) && !("scene" in entity)));
  assert.ok(new Set(entities.map(e => e.entity.entityId)).size === entities.length);
});

test("roster, time and control replacement remain live after restore; unsupported actors cannot mutate the board", () => {
  const runtime = prepared();
  place(runtime, "A", 3, 2); step(runtime, 50);
  const restored = cloneCheckpoint(runtime);
  assert.equal(checksum(runtime), checksum(restored));
  assert.equal(restored.combat.towers, restored.world.towers);
  assert.equal(restored.combat.enemies, restored.world.enemies);
  const before = checksum(restored);
  assert.equal(restored.executeOperation("intruder", { type: "deploy", card: "B", cell: { lane: 1, column: 1 }, expected: null }), "forbidden");
  assert.equal(checksum(restored), before);
  for (let i = 0; i < 600; i++) { step(runtime); step(restored); }
  assert.equal(checksum(runtime), checksum(restored));
  assert.equal(restored.combat.battleTime, restored.world.battleTime);
});

test("pipeline, mirrored layered push, transient sources, NUL and queued attacks survive complete-runtime restore", () => {
  const runtime = prepared("IF-1", ["A", "m", "[]", "#", "0", "1", "=", "f", "S", "u"]);
  place(runtime, "A", 0, 1); place(runtime, "[]", 0, 1); place(runtime, "m", 0, 2);
  const push = place(runtime, "#", 0, 0);
  place(runtime, "u", 4, 0); place(runtime, "A", 4, 1);
  const source = place(runtime, "f", 6, 0);
  place(runtime, "0", 6, 1); place(runtime, "1", 6, 3);
  for (let column = 0; column < 3; column++) runtime.world.edgeTowers.push(runtime.world.entityIds.identify("edge", {
    type: "=", axis: "horizontal", lane: 6, column, mode: ">", level: 1
  }));
  runtime.circuit.sync();
  runtime.triggerShockTower(source);
  assert.equal(source.inPlay, false);
  assert.ok(runtime.world.towers.find(t => t.type === "0").projectileBank.shots.length > 0);
  getTowerSkillState(push, "push").sp = 30;
  assert.equal(runtime.executeOperation("local", { type: "push", target: ref(push), cell: { lane: 0, column: 1 } }), "handled");
  assert.ok(runtime.world.towers.some(t => t.moveVisual));
  const mortar = place(runtime, "S", 2, 0);
  getTowerSkillState(mortar, "spellMortar").sp = 60;
  assert.equal(runtime.skills.activateManualSkills([mortar], "S", { x: 900, y: 400 }), "handled");
  runtime.nullification.start(runtime.world.battleTime, 1000, runtime.world.towers.filter(t => t.lane === 4));
  assert.equal(runtime.cellIsDeployable(4, 0), false);
  const restored = cloneCheckpoint(runtime);
  assert.equal(checksum(runtime), checksum(restored));
  for (let tick = 0; tick < 1200; tick++) { step(runtime); step(restored); }
  assert.equal(checksum(runtime), checksum(restored));
  assert.equal(restored.nullification.snapshot(), undefined);
});

test("tutorial, timed cell sealing and reversal expiry do not depend on display observers", () => {
  const tutorial = createRuntime("0-2"); tutorial.initialize();
  assert.equal(tutorial.world.sealedCells.size, 78);
  assert.ok(tutorial.world.tutorial);
  const runtime = prepared("AE-EX-2");
  const tower = place(runtime, "A", 3, 0);
  applyStatusEffect(tower, "reversed", 100, 0);
  step(runtime, 12);
  assert.ok(tower.statusEffects.every(effect => effect.name !== "reversed"));
  runtime.cells.warnCell(3, 0, 100, 1000, 0);
  step(runtime, 12);
  assert.equal(tower.inPlay, false);
  assert.equal(runtime.cellIsDeployable(3, 0), false);
  step(runtime, 61);
  assert.equal(runtime.cellIsDeployable(3, 0), true);
});

test("boss phase transitions and endless succession run through the same complete assembly", () => {
  const runtime = prepared("5-10");
  runtime.world.wave = 22;
  runtime.spawnEnemy({ kind: "circle", lane: 3, time: 0, waveNumber: 22, waveWeight: 10, finalDamageReduction: 0 });
  runtime.world.boss.hp = 1;
  damageBoss(runtime.lifecycle, 100000000, "true");
  assert.equal(runtime.world.bossPhaseIndex, 1);
  assert.equal(runtime.boss.bossPhaseIndex, 1);
  assert.equal(runtime.world.wave, 22);
  assert.equal(runtime.world.enemies.length, 0);
  const restored = cloneCheckpoint(runtime);
  step(runtime, 300); step(restored, 300);
  assert.equal(checksum(runtime), checksum(restored));
  const endless = prepared("IF-BE-1");
  const previous = endless.world.boss;
  damageBoss(endless.lifecycle, 100000000, "true");
  assert.equal(endless.world.boss.rank, 2);
  assert.notEqual(endless.world.boss.entityId, previous.entityId);
});

test("restoring active mortar flights twice does not duplicate them or terminal notifications", () => {
  const finished = [];
  const runtime = runtimeFromOptions(createRuntime("1-9", ["S"]).session.exportReplay(), undefined, { finished: result => finished.push(result) });
  runtime.world.chars = 100000;
  const tower = place(runtime, "S", 3, 0);
  runtime.skills.restoreSpellMortarFlight({ source: tower, fromX: tower.x, fromY: tower.y, targetX: 900, targetY: 400, damage: 100, damageType: "magic", progress: 0.2 });
  const { decodeSaveGraph } = load("src/game/saveGraph.ts");
  const graph = captureBattleSnapshot(runtime.snapshot("S"));
  runtime.restore(decodeSaveGraph(graph, () => ({}))); runtime.restore(decodeSaveGraph(graph, () => ({})));
  assert.equal(runtime.skills.snapshotFlights().length, 1);
  runtime.finish("victory"); runtime.finish("defeat");
  assert.equal(finished.length, 1);
  assert.equal(runtime.world.result.outcome, "victory");
});

test("AE-EX-2 mirrored shells keep exact checksums across wire restore and the first occupancy/NUL refresh", () => {
  const runtime = prepared("AE-EX-2", ["A", "m", "[]"]);
  place(runtime, "A", 0, 1); place(runtime, "[]", 0, 1); place(runtime, "m", 0, 2);
  const local = cloneCheckpoint(runtime), remote = cloneCheckpoint(runtime, undefined, true);
  assert.equal(checksum(remote), checksum(runtime));
  for (let tick = 0; tick < 4200; tick++) {
    step(runtime); step(local); step(remote);
    if (tick === 0 || tick % 300 === 0) {
      assert.equal(checksum(local), checksum(runtime), "local checkpoint at " + tick);
      assert.equal(checksum(remote), checksum(runtime), "wire checkpoint at " + tick);
    }
  }
});

test("independent boot shares tutorial/unlimited rules and rejects invalid captured configuration", () => {
  const options = createRuntime().session.exportReplay();
  const normal = createIndependentBattle(options);
  const unlimited = createIndependentBattle({ ...options, unlimitedFirepower: true });
  assert.equal(unlimited.world.options.difficulty.weightMultiplier, normal.world.options.difficulty.weightMultiplier * 10);
  const tutorial = createIndependentBattle({ ...options, levelId: "0-2", unlimitedFirepower: true });
  assert.equal(tutorial.world.options.unlimitedFirepower, false);
  assert.equal(tutorial.world.sealedCells.size, 78);
  assert.throws(() => createIndependentBattle({ ...options, levelId: "missing" }), /Unknown battle level/);
  assert.throws(() => createIndependentBattle({ ...options, difficulty: NaN }), /Unsupported battle replay/);
  assert.throws(() => createIndependentBattle({ ...options, selectedCards: ["?"] }), /Invalid battle cards/);
  assert.throws(() => createIndependentBattle(options, { replica: true }), /checkpoint/);
  assert.throws(() => createIndependentBattle(options, { playback: { ...options, commands: [
    { tick: 0, sequence: 0, command: { type: "selectCard", id: "A" } }
  ] } }), /Legacy input replay/);
});

test("the production independent entry boots and executes controls without browser shims", () => {
  const bare = createTypeScriptLoader({}, { window: undefined, navigator: undefined })("src/game/independentBattle.ts");
  const runtime = bare.createIndependentBattle({ ...createRuntime("AE-10").session.exportReplay(), debug: true });
  assert.equal(runtime.executeControl("local", { type: "debugChars" }), "handled");
  runtime.session.advance(BATTLE_STEP_MS, runtime.sessionRuntime);
  assert.equal(runtime.session.clock.tick, 1);
  assert.ok(runtime.world.boss);
});

test("real independent authority applies controls, settings, cooldown-preserving reselection and semantic replay", () => {
  const options = { ...createRuntime("IF-1").session.exportReplay(), policy: LEGACY_BATTLE_POLICY };
  const runtime = createIndependentBattle(options);
  const authority = new BattleAuthority("headless", runtime.session, {
    available: () => !runtime.world.gameOver, inputTime: () => 0, execute: command => runtime.executeCommand(command)
  });
  const control = data => authority.submitTrusted("local", { type: "control", control: data });
  assert.equal(control({ type: "debugChars" }), "forbidden");
  control({ type: "debugMode", enabled: true });
  control({ type: "debugChars" });
  assert.equal(runtime.world.lifecycleSnapshot().flawlessEligible, false);
  control({ type: "autoUpgradeEnabled", enabled: false });
  control({ type: "reserve", value: 450 });
  assert.equal(authority.submitTrusted("local", { type: "operation", operation: {
    type: "deploy", card: "A", cell: { lane: 3, column: 8 }, expected: null
  } }), "deployed");
  control({ type: "pause", paused: true });
  step(runtime, 100); assert.equal(runtime.session.clock.tick, 0);
  control({ type: "pause", paused: false });
  control({ type: "speed", speed: 2 });
  assert.equal(control({ type: "reselect", cards: ["A", "B"] }), "cooldown");
  step(runtime, 7201);
  assert.ok(!runtime.world.gameOver);
  assert.equal(control({ type: "reselect", cards: ["B", "A"] }), "handled");
  assert.deepEqual(runtime.world.loadout.ids, ["B", "A"]);
  assert.equal(control({ type: "reselect", cards: ["X"] }), "cooldown");
  step(runtime, 60);
  const replay = runtime.session.exportReplay(), expected = checksum(runtime);
  for (const delta of [1000 / 30, 1000 / 144]) {
    const restored = createIndependentBattle(replay, { playback: replay });
    while (!restored.session.playbackComplete) restored.session.advance(delta, restored.sessionRuntime);
    assert.equal(checksum(restored), expected);
  }
  const checkpoint = captureBattleSnapshot(runtime.snapshot("B"));
  const resumedOptions = { ...replay, selectedCards: [...runtime.world.loadout.ids] };
  const resumed = createIndependentBattle(resumedOptions, { checkpoint });
  assert.equal(checksum(resumed), expected);
  assert.equal(resumed.executeControl("local", { type: "reselect", cards: ["X"] }), "cooldown");
  assert.throws(() => createIndependentBattle({ ...resumedOptions, selectedCards: ["A", "B"] }, { checkpoint }), /loadout differs/);
  step(runtime, 200); step(resumed, 200);
  assert.equal(checksum(resumed), checksum(runtime));
});

test("independent control damage hits actual enemies and Bosses without display callbacks", () => {
  const runtime = createIndependentBattle({ ...createRuntime("2-10").session.exportReplay(), debug: true });
  runtime.spawnEnemy({ kind: "circle", waveNumber: 1, lane: 0, x: 700, time: 0, waveWeight: 10, finalDamageReduction: 0 });
  const enemy = runtime.world.enemies[0];
  assert.equal(runtime.executeControl("local", { type: "debugDamage", mode: "normal", point: { x: enemy.x, y: enemy.y } }), "handled");
  assert.equal(enemy.inPlay, false);
  const hp = runtime.world.boss.hp, { x, y } = runtime.world.boss;
  runtime.executeControl("local", { type: "debugDamage", mode: "super", point: { x, y } });
  assert.ok(runtime.world.boss.hp < hp);
  assert.equal(runtime.executeControl("unknown", { type: "debugChars" }), "forbidden");
});

test("independent tutorial controls reject stale selections and advance without views", () => {
  const runtime = createIndependentBattle({ ...createRuntime("0-5").session.exportReplay(), selectedCards: ["A", "B", "X"] });
  assert.equal(runtime.executeControl("local", { type: "tutorialInput", input: { tool: "shifter", selected: ["tower:999"] } }), "stale");
  assert.equal(runtime.executeControl("local", { type: "tutorialInput", input: { tool: "erase", selected: [] } }), "handled");
  const before = runtime.world.tutorialSnapshot();
  assert.equal(runtime.executeControl("local", { type: "tutorialAdvance" }), "handled");
  assert.notDeepEqual(runtime.world.tutorialSnapshot(), before);
  const checkpoint = captureBattleSnapshot(runtime.snapshot("A"));
  const replica = createIndependentBattle(runtime.session.exportReplay(), { checkpoint, replica: true });
  assert.equal(checksum(replica), checksum(runtime));
  replica.session.advance(BATTLE_STEP_MS, replica.sessionRuntime);
  assert.equal(replica.session.clock.tick, runtime.session.clock.tick);
});

test("pure snapshot migration supplies identical authoritative defaults to arbitrary display factories", () => {
  const runtime = prepared("2-10", ["x"]);
  const tower = place(runtime, "x", 0, 0);
  tower.level = 2; tower.baseStats.attackPower = 200; tower.finalStats.attackPower = 360;
  runtime.world.boss.bossHasteUntil = 5000;
  const state = runtime.snapshot("x"); state.simulation.version = 3;
  delete tower.deployedAt;
  const graph = captureBattleSnapshot(state), savedRandom = runtime.session.random.state;
  const plain = restoreBattleData(graph);
  const displayed = restoreBattleData(graph, () => ({ body: { fake: true }, speed: 12345, deployedAt: 999 }));
  assert.equal(plain.towers[0].deployedAt, 0);
  assert.equal(displayed.towers[0].deployedAt, 0);
  assert.equal(plain.towers[0].baseStats.attackPower, getCardDefinition("x").attackPower);
  assert.equal(plain.towers[0].finalStats.attackPower, getCardDefinition("x").attackPower);
  assert.equal(plain.boss.bossHasteUntil, 0);
  assert.equal(plain.boss.statusEffects.find(e => e.name === "haste").expiresAt, 5000);
  assert.equal(runtime.session.random.state, savedRandom);
  assert.equal(battleChecksum(plain), battleChecksum(displayed));
});

test("independent Boss checkpoints validate without visual pose, while malformed optional pose is rejected", () => {
  for (const levelId of ["1-10", "2-10", "5-5", "5-10", "AE-10", "IF-BE-4"]) {
    const options = createRuntime(levelId).session.exportReplay(), runtime = createIndependentBattle(options);
    const checkpoint = captureBattleSnapshot(runtime.snapshot("A"));
    const replica = createIndependentBattle(options, { checkpoint, replica: true });
    assert.equal(checksum(replica), checksum(runtime), levelId);
    step(runtime, 300);
    replica.session.followFrame(300, [], replica.sessionRuntime);
    assert.equal(checksum(replica), checksum(runtime), levelId + " continuation");
    const malformed = structuredClone(checkpoint);
    malformed.nodes.find(node => node.kind === "boss").data.rotationX = { number: "Infinity" };
    assert.throws(() => createIndependentBattle(options, { checkpoint: malformed }), /Invalid battle save/);
  }
});
