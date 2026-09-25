import assert from "node:assert/strict";
import { test } from "node:test";
import { load, createRuntime, runtimeFromOptions, cloneCheckpoint, captureBattleSnapshot, battleChecksum, place, step } from "./helpers/battle-runtime.mjs";
const { getTowerSkillState } = load("src/game/skillState.ts");
const { towerOperationRef: ref } = load("src/game/battleOperations.ts");
const { collectBattleEntities } = load("src/game/battleEntityGraph.ts");
const { damageBoss } = load("src/game/unitLifecycle.ts");
const { applyStatusEffect } = load("src/game/statusEffects.ts");
const checksum = runtime => battleChecksum(runtime.snapshot(runtime.world.loadout.ids[0]));
const prepared = (level = "1-9", cards = ["A", "B", "X"]) => {
  const runtime = createRuntime(level, cards);
  runtime.initialize();
  runtime.world.chars = 100000;
  runtime.world.baseIntegrity = 100;
  runtime.session.controls.autoUpgradeEnabled = false;
  return runtime;
};

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
