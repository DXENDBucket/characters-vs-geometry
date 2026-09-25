import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// No Phaser or browser stubs: these are the same constructors and rules used by live Bosses.
const load = createTypeScriptLoader();
const { createBossState, bossBaseStatsFromValues } = load("src/game/bossState.ts");
const rules = load("src/game/bossRules.ts");
const { initialBossSkillStates, applyBossPhaseSkillState } = load("src/game/bossSkillRules.ts");
const { bossStatsAtRank, rankedBossFamily } = load("src/bosses/bossRanks.ts");
const { applyReversalEffect } = load("src/game/rules/reversal.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { encodeSaveGraph, decodeSaveGraph } = load("src/game/saveGraph.ts");
const { enemyKindAtRank } = load("src/game/enemyIdentity.ts");
const { toRomanNumeral } = load("src/format.ts");
const { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, BOSS_HITBOX_HEIGHT, BOSS_HITBOX_WIDTH,
  CELL_HEIGHT, CELL_WIDTH, CUBE_BOSS_STATS, LANES } = load("src/config.ts");
const kinds = Object.keys(CUBE_BOSS_STATS);
const initialKeys = ["kind", "rank", "label", "x", "y", "hitboxWidth", "hitboxHeight", "hp", "baseStats", "finalStats",
  "maxHp", "armor", "magicResistance", "finalDamageReduction", "speed", "movementAxis", "movementDirection",
  "statusEffects", "advanceMinionKind", "hasSkills", "skills", "contactAttackBuffer", "chargeExpiresAt",
  "halfHpTriggered", "criticalHpTriggered", "pendingCriticalSummon", "companionsInitialized", "companionDeathsHandled",
  "invincibleUntil", "bossHasteUntil", "nextBossHasteTrailAt", "octahedronCopies", "octahedronSpawn75Triggered",
  "octahedronSpawn50Triggered", "octahedronSpawn25Triggered"];

test("all Boss families and dynamic ranks construct independent panels without presentation state or random draws", () => {
  const random = Math.random;
  Math.random = () => assert.fail("Boss logic must not consume cosmetic randomness");
  try {
    for (const kind of kinds) for (const requestedRank of [undefined, 2, 10000]) {
      const rank = rankedBossFamily(kind) ? requestedRank ?? rules.bossRank(kind) : rules.bossRank(kind);
      const stats = rankedBossFamily(kind) ? bossStatsAtRank(kind, rank) : CUBE_BOSS_STATS[kind];
      const state = createBossState(kind, .45, { rank: requestedRank });
      const base = bossBaseStatsFromValues(stats, .45);
      assert.equal(state.rank, rank, kind);
      assert.equal(state.label, kind === "del" ? "DEL" : toRomanNumeral(rank));
      assert.deepEqual(state.baseStats, base); assert.deepEqual(state.finalStats, base);
      assert.notEqual(state.baseStats, state.finalStats);
      assert.equal(state.hp, stats.hp); assert.equal(state.hp, state.maxHp);
      assert.equal(state.armor, base.armor); assert.equal(state.magicResistance, base.magicResistance);
      assert.equal(state.speed, base.speed); assert.equal(state.finalDamageReduction, .45);
      assert.equal(state.hitboxWidth, stats.hitboxCells ? CELL_WIDTH * stats.hitboxCells : BOSS_HITBOX_WIDTH);
      assert.equal(state.hitboxHeight, stats.hitboxCells ? CELL_HEIGHT * stats.hitboxCells : BOSS_HITBOX_HEIGHT);
      assert.equal(state.x, BOARD_X + BOARD_WIDTH - state.hitboxWidth / 2);
      assert.equal(state.y, BOARD_Y + BOARD_HEIGHT / 2);
      assert.equal(state.advanceMinionKind, enemyKindAtRank("square", rank));
      assert.equal(state.hasSkills, !rules.isSkilllessBossKind(kind));
      assert.deepEqual(state.skills, initialBossSkillStates(kind));
      assert.deepEqual(Object.keys(state), initialKeys, "legacy field traversal order");
      assert.equal("body" in state, false); assert.equal("rotationX" in state, false);
    }
  } finally { Math.random = random; }
});

test("Boss family predicates, rank defaults and independent mutable state match all registered kinds", () => {
  for (const kind of kinds) {
    const state = createBossState(kind, 0), other = createBossState(kind, 0);
    const family = rankedBossFamily(kind) ?? kind;
    for (const [name, expected] of [["Tetrahedron", "tetrahedron"], ["Dodecahedron", "dodecahedron"],
      ["SmallStellatedDodecahedron", "smallStellatedDodecahedron"], ["Octahedron", "octahedron"], ["Icosahedron", "icosahedron"]]) {
      assert.equal(rules[`is${name}Boss`](state), family === expected);
      assert.equal(rules[`is${name}BossKind`](kind), family === expected);
    }
    assert.equal(state.rank, kind.endsWith("2") ? 2 : 1);
    state.baseStats.maxHp = 1; state.finalStats.armor = 123; state.skills.promotion.sp = 0;
    state.statusEffects.push({ name: "reversed", expiresAt: 1000 });
    assert.notEqual(other.baseStats.maxHp, 1); assert.notEqual(other.finalStats.armor, 123);
    assert.equal(other.skills.promotion.sp, initialBossSkillStates(kind).promotion.sp);
    assert.deepEqual(other.statusEffects, []);
    if (family === "octahedron") { state.octahedronCopies.push(other); assert.deepEqual(other.octahedronCopies, []); }
    else assert.equal(state.octahedronCopies, undefined);
  }
});

test("Boss movement uses final speed, requested axis and direction and expires reversal at the exact deadline", () => {
  for (const axis of [undefined, "x", "y"]) for (const direction of [-1, 1]) {
    const boss = createBossState("octahedron", 0, { x: 0, y: 0, movementAxis: axis, movementDirection: direction });
    assert.equal(boss.x, 0); assert.equal(boss.y, 0);
    boss.finalStats.speed = 10;
    applyReversalEffect(boss, 1000, 0);
    rules.advanceBossPosition(boss, .5, 2, 999);
    assert.equal(boss.x, axis === "y" ? 0 : -direction * 10);
    assert.equal(boss.y, axis === "y" ? direction * 10 : 0);
    rules.advanceBossPosition(boss, .5, 2, 1000);
    assert.equal(boss.x, 0); assert.equal(boss.y, axis === "y" ? direction * 20 : 0);
    assert.deepEqual(boss.statusEffects, []);
    const before = { x: boss.x, y: boss.y };
    rules.advanceBossPosition(boss, 0, 100, 2000);
    rules.advanceBossPosition(boss, 10, 0, 2000);
    assert.deepEqual({ x: boss.x, y: boss.y }, before);
  }
});

test("Boss base-stat synchronization and armor changes preserve existing clamp and replacement semantics", () => {
  const boss = createBossState("cube", .2), previousFinal = boss.finalStats;
  Object.assign(boss.baseStats, { maxHp: 100, speed: 33, armor: 555, magicResistance: 44, finalDamageReduction: .5 });
  rules.syncBossBaseStats(boss);
  assert.deepEqual(boss.finalStats, boss.baseStats);
  assert.notEqual(boss.finalStats, boss.baseStats); assert.notEqual(boss.finalStats, previousFinal);
  assert.equal(boss.hp, 100); assert.equal(boss.maxHp, 100); assert.equal(boss.armor, 555);
  assert.equal(boss.speed, 33); assert.equal(boss.magicResistance, 44); assert.equal(boss.finalDamageReduction, .5);
  boss.hp = -1; boss.baseStats.maxHp = 200; rules.setBossBaseArmor(boss, -5);
  assert.equal(boss.hp, -1); assert.equal(boss.armor, 0); assert.equal(boss.baseStats.armor, 0);
  rules.setBossBaseArmor(boss, 888); assert.equal(boss.finalStats.armor, 888);
});

test("advance spawn points use physical Boss width and ascending row order", () => {
  for (const kind of kinds) {
    const boss = createBossState(kind, 0);
    assert.deepEqual(rules.bossAdvanceSpawnPoints(boss), Array.from({ length: LANES }, (_, lane) => ({
      lane, x: boss.x - boss.hitboxWidth / 2 - CELL_WIDTH / 2, y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2
    })));
  }
});

test("finale phase skills can initialize on a pure Boss state without render objects", () => {
  const boss = createBossState("icosahedron", 0);
  const { ICOSAHEDRON_PHASE_SKILL_SP } = load("src/data/bossAbilities.ts");
  for (const [phase, configured] of Object.entries(ICOSAHEDRON_PHASE_SKILL_SP)) {
    for (const skill of Object.values(boss.skills)) { skill.sp = 0; skill.spBuffer = .5; skill.activeUntil = 1000; }
    applyBossPhaseSkillState(boss, Number(phase));
    for (const [name, initial] of Object.entries(configured)) {
      const skill = boss.skills[name];
      assert.equal(skill.sp, Math.min(initial, skill.maxSp));
      assert.equal(skill.spBuffer, 0); assert.equal(skill.activeUntil, 0);
    }
  }
});

class Visual {}
const visuals = new Set(["body", "frame", "labelText"]);
function fixture(kind) {
  const boss = createBossState(kind, .3), copy = createBossState(kind, .3, { x: 400, y: 300, movementAxis: "y", movementDirection: 1 });
  for (const part of [boss, copy]) Object.assign(part, {
    body: new Visual(), frame: new Visual(), labelText: new Visual(), rotationX: .1, rotationY: .2, rotationZ: .3,
    velocityX: .4, velocityY: .5, velocityZ: .6, targetVelocityX: .7, targetVelocityY: .8, targetVelocityZ: .9, nextTurnIn: 2
  });
  Object.assign(boss, { deleteFormatReadyAt: 1000, deleteStackPending: true, octahedronSolarBombsInitialized: true,
    pendingCopies: [{ x: 200, y: 300, movementAxis: "y", movementDirection: -1, startedAt: 1000, readyAt: 5000,
      phaseIndex: 3, invincibleUntil: Infinity, triggerReinforcements: true }],
    delSweep: { phase: "returning", startedAt: 0, homeX: 1000, homeY: 400, previousInvincibleUntil: 0, sealedCells: ["1:2"] } });
  if (kind === "del") {
    copy.delEcho = true;
    boss.delLaneSweep = { stage: "quarter", phase: "sweeping", startedAt: 1000, previousInvincibleUntil: 0,
      sealedCells: [], parts: [copy], summons: 0 };
  } else boss.octahedronCopies = [copy];
  boss.statusEffects.push({ name: "reversed", expiresAt: Infinity });
  return { boss, actions: [{ target: copy }, { source: boss }], removedTargets: [copy] };
}
function legacyCapture(state) {
  return encodeSaveGraph(state, value => "advanceMinionKind" in value
    ? { kind: "boss", omit: visuals } : { kind: Array.isArray(value) ? "array" : "object" });
}

test("Boss snapshots preserve legacy fields, traversal order, pending summons and shared part references", () => {
  for (const kind of kinds.filter(k => k !== "smallStellatedDodecahedron")) {
    const state = fixture(kind), graph = JSON.parse(JSON.stringify(legacyCapture(state)));
    assert.equal(JSON.stringify(captureBattleSnapshot(state)), JSON.stringify(graph));
    const restored = decodeSaveGraph(graph, () => ({}));
    const copy = restored.boss.delLaneSweep?.parts[0] ?? restored.boss.octahedronCopies[0];
    assert.equal(restored.actions[0].target, copy); assert.equal(restored.actions[1].source, restored.boss);
    assert.equal(restored.removedTargets[0], copy);
    assert.equal(restored.boss.pendingCopies[0].invincibleUntil, Infinity);
    assert.equal(restored.boss.statusEffects[0].expiresAt, Infinity);
    assert.equal(restored.boss.rotationX, .1);
    assert.equal(JSON.stringify(captureBattleSnapshot(restored)), JSON.stringify(graph));
  }
});

test("Boss snapshots allow pure data and cannot capture newly added render caches or callbacks", () => {
  for (const kind of ["icosahedron", "del"]) {
    const state = fixture(kind), expected = JSON.stringify(captureBattleSnapshot(state));
    for (const boss of [state.boss, state.removedTargets[0]]) {
      const cache = new Visual(); cache.self = cache;
      boss.futureVisualCache = cache; boss.onDraw = () => {};
      for (const key of visuals) delete boss[key];
    }
    assert.equal(JSON.stringify(captureBattleSnapshot(state)), expected);
    const pure = { boss: createBossState(kind, 0) };
    const restored = decodeSaveGraph(captureBattleSnapshot(pure), () => ({}));
    assert.equal(restored.boss.kind, kind); assert.equal("rotationX" in restored.boss, false);
  }
  assert.throws(() => captureBattleSnapshot({ boss: createBossState("smallStellatedDodecahedron", 0) }), /Unsupported boss save/);
});
