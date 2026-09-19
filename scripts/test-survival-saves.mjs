import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

function fixture() {
  const storage = new Map();
  const window = { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  } };
  const load = createTypeScriptLoader({}, { window });
  return { load, window, storage, graph: load("src/game/saveGraph.ts"), saves: load("src/survivalSaves.ts") };
}
const classify = value => ({ kind: Array.isArray(value) ? "array" : "object" });

test("save graph preserves cycles, shared identities and non-finite combat timestamps through JSON", () => {
  const { graph } = fixture();
  const tower = { id: "tower:1", lastFire: -Infinity, nextProduceAt: Infinity, cache: NaN };
  const pool = { members: [tower], hp: -100, maxHp: 3000 };
  tower.healthPool = pool;
  const state = { towers: [tower], projectile: { source: tower }, pool };
  const saved = JSON.parse(JSON.stringify(graph.encodeSaveGraph(state, classify)));
  const restored = graph.decodeSaveGraph(saved, () => { throw new Error("Unexpected unit"); });
  assert.equal(restored.towers[0], restored.projectile.source);
  assert.equal(restored.pool.members[0].healthPool, restored.pool);
  assert.equal(restored.towers[0].lastFire, -Infinity);
  assert.equal(restored.towers[0].nextProduceAt, Infinity);
  assert.ok(Number.isNaN(restored.towers[0].cache));
  assert.equal(restored.pool.hp, -100);
});

test("graph loading rejects broken references and prototype keys before constructing units", () => {
  const { graph } = fixture();
  for (const malformed of [
    { root: { ref: 1 }, nodes: [] },
    { root: null, nodes: [{ kind: "object", data: { child: { ref: -1 } } }] },
    JSON.parse('{"root":null,"nodes":[{"kind":"object","data":{"__proto__":1}}]}'),
    { root: null, nodes: [{ kind: "array", data: { "999999999": 1 } }] },
    { root: null, nodes: [{ kind: "unknown", data: {} }] }
  ]) assert.throws(() => graph.decodeSaveGraph(malformed, () => assert.fail("Factory must not run")));
});

test("pending volleys survive save/restore, keep stable ordering and execute exactly once", () => {
  const { load, graph } = fixture();
  const { BattleActionQueue } = load("src/game/battleActions.ts");
  const queue = new BattleActionQueue();
  queue.schedule(100, 20, { type: "volley", tower: { id: "tower:1" }, hitCount: 2 });
  queue.schedule(100, 10, { type: "volley", tower: { id: "tower:2" }, hitCount: 1 });
  queue.schedule(100, 20, { type: "volley", tower: { id: "tower:3" }, hitCount: 3 });
  const saved = JSON.parse(JSON.stringify(graph.encodeSaveGraph(queue.snapshot(), classify)));
  const resumed = new BattleActionQueue();
  resumed.restore(graph.decodeSaveGraph(saved, () => ({})));
  const hits = [];
  resumed.update(109, action => hits.push(action.hitCount));
  assert.deepEqual(hits, []);
  resumed.update(120, action => hits.push(action.hitCount));
  resumed.update(9999, action => hits.push(action.hitCount));
  assert.deepEqual(hits, [1, 2, 3]);
});

test("survival storage is durable, versioned, atomic on write failure and clears independently of best-wave records", () => {
  const f = fixture();
  const save = { version: 1, levelId: "IF-1", savedAt: 123, wave: 5, difficulty: 3,
    unlimitedFirepower: false, selectedCards: ["A"], graph: f.graph.encodeSaveGraph({
      battleTime: 1500, levelElapsed: 1500, cardTime: 1500, nextNaturalProduceAt: 5000, chars: 100,
      baseIntegrity: 6, wave: 5, waveTracker: null, enemiesDefeated: 0, towerOrder: 0, gameSpeed: 1,
      autoUpgradeEnabled: true, autoUpgradeReserveChars: 0, extraction: 0, towers: [], enemies: [],
      projectiles: [], enemyProjectiles: [], mortarProjectiles: [], cardDeadlines: [], actions: [],
      storage: [], spellMortarFlights: [], sealedCells: [], shifter: { readyAt: 0, cooldownStartedAt: 0, cooldownDuration: 15000 },
      reselection: { readyAt: 240000, cards: [] }
    }, classify) };
  assert.equal(f.saves.writeSurvivalSave(save), true);
  assert.deepEqual(f.saves.readSurvivalSave("IF-1"), save);
  f.window.localStorage.setItem = () => { throw new Error("Quota exceeded"); };
  assert.equal(f.saves.writeSurvivalSave({ ...save, savedAt: 999 }), false);
  assert.equal(f.saves.readSurvivalSave("IF-1").wave, 5);
  f.saves.deleteSurvivalSave("IF-1");
  assert.equal(f.saves.readSurvivalSave("IF-1"), undefined);
  f.storage.set("charset-survival-v1:IF-1", JSON.stringify({ ...save, version: 999 }));
  assert.equal(f.saves.readSurvivalSave("IF-1"), undefined);
  assert.equal(f.storage.size, 1);
  f.storage.set("charset-survival-v1:IF-1", JSON.stringify({ ...save, graph: f.graph.encodeSaveGraph({ wave: 5 }, classify) }));
  assert.equal(f.saves.readSurvivalSave("IF-1"), undefined);
  assert.equal(f.storage.size, 1);
  f.saves.clearSurvivalSaves();
  assert.equal(f.storage.size, 0);
});

test("Boss Endless saves preserve Boss references and reject missing, dead or invalid active Bosses", () => {
  const f = fixture();
  const stats = { maxHp: 250000, armor: 900, magicResistance: 20, speed: 0.6, finalDamageReduction: 0 };
  const boss = {
    kind: "cube", rank: 3, hp: 123456, maxHp: 250000, x: 1100, y: 400,
    baseStats: stats, finalStats: { ...stats }, statusEffects: [], advanceMinionKind: "square3",
    skills: { promotion: { sp: 37, spBuffer: 0.25, activeUntil: 0, maxSp: 90, cost: 30 },
      advance: { sp: 20, spBuffer: 0, activeUntil: 0, maxSp: 120, cost: 120 } },
    hitboxWidth: 230, hitboxHeight: 230, rotationX: 0.1, rotationY: 0.2, rotationZ: 0.3,
    velocityX: 0, velocityY: 0, velocityZ: 0, targetVelocityX: 0.1, targetVelocityY: 0.1, targetVelocityZ: 0.1,
    nextTurnIn: 1, invincibleUntil: 0, contactAttackBuffer: 0
  };
  const state = {
    battleTime: 1500, levelElapsed: 1500, cardTime: 1500, nextNaturalProduceAt: 5000, chars: 300,
    baseIntegrity: 6, wave: 5, waveTracker: null, enemiesDefeated: 0, towerOrder: 0, gameSpeed: 1,
    autoUpgradeEnabled: true, autoUpgradeReserveChars: 0, extraction: 0, towers: [], enemies: [], boss,
    projectiles: [], enemyProjectiles: [], mortarProjectiles: [], cardDeadlines: [], actions: [],
    storage: [], spellMortarFlights: [], sealedCells: [], shifter: { readyAt: 0, cooldownStartedAt: 0, cooldownDuration: 15000 },
    reselection: { readyAt: 240000, cards: [] }, target: boss
  };
  const makeSave = (savedState = state, levelId = "IF-BE-1") => ({
    version: 1, levelId, savedAt: 123, wave: 5, difficulty: 3, unlimitedFirepower: false, selectedCards: ["B"],
    graph: f.graph.encodeSaveGraph(savedState, value => value === savedState.boss ? { kind: "boss" } : classify(value))
  });
  const valid = makeSave();
  assert.equal(f.saves.writeSurvivalSave(valid), true);
  const loaded = f.saves.readSurvivalSave("IF-BE-1");
  const decoded = f.graph.decodeSaveGraph(loaded.graph, () => ({}));
  assert.equal(decoded.boss, decoded.target);
  assert.equal(decoded.boss.skills.promotion.sp, 37);
  for (const change of [{ rank: 0 }, { rank: 1.5 }, { hp: 0 }, { hp: 999999 }, { kind: "octahedron" },
    { advanceMinionKind: "square2" }, { skills: {} }]) {
    assert.equal(f.saves.writeSurvivalSave(makeSave({ ...state, target: undefined, boss: { ...boss, ...change } })), false);
  }
  assert.equal(f.saves.writeSurvivalSave(makeSave({ ...state, boss: null, target: undefined })), false);
  assert.equal(f.saves.writeSurvivalSave(makeSave(state, "IF-1")), false);
  assert.deepEqual(f.saves.readSurvivalSave("IF-BE-1"), valid);
  const tetraStats = { ...stats, maxHp: 120000, armor: 150, speed: 1.2 };
  const tetraBoss = { ...boss, kind: "tetrahedron", hp: 1, maxHp: 120000, baseStats: tetraStats, finalStats: { ...tetraStats },
    halfHpTriggered: true, criticalHpTriggered: true, pendingCriticalSummon: true,
    chargeExpiresAt: 7000, bossHasteUntil: 60000, nextBossHasteTrailAt: 1500, invincibleUntil: 15000,
    skills: { ...boss.skills, ...Object.fromEntries(["charge", "impact", "suppression", "desperation"].map(name =>
      [name, { sp: 10, spBuffer: 0.5, activeUntil: 0, maxSp: 120, cost: 30 }])) } };
  const tetraState = { ...state, boss: tetraBoss, target: undefined };
  const tetraSave = makeSave(tetraState, "IF-BE-2");
  assert.equal(f.saves.writeSurvivalSave(tetraSave), true);
  const tetraLoaded = f.graph.decodeSaveGraph(f.saves.readSurvivalSave("IF-BE-2").graph, () => ({}));
  assert.equal(tetraLoaded.boss.pendingCriticalSummon, true);
  assert.equal(tetraLoaded.boss.invincibleUntil, 15000);
  assert.equal(tetraLoaded.boss.skills.charge.spBuffer, 0.5);
  assert.equal(f.saves.writeSurvivalSave(makeSave(tetraState, "IF-BE-1")), false);
  assert.equal(f.saves.writeSurvivalSave(makeSave(state, "IF-BE-2")), false);
  for (const change of [{ pendingCriticalSummon: undefined }, { bossHasteUntil: NaN }, { skills: boss.skills }])
    assert.equal(f.saves.writeSurvivalSave(makeSave({ ...tetraState, boss: { ...tetraBoss, ...change } }, "IF-BE-2")), false);
  assert.deepEqual(f.saves.readSurvivalSave("IF-BE-2"), tetraSave);
});
