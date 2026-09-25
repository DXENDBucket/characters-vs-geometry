import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// Pure state construction, queries and snapshot capture must not load Phaser.
const load = createTypeScriptLoader();
const { createTowerState, towerBaseStatsFromDefinition } = load("src/game/towerState.ts");
const rules = load("src/game/towerRules.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
const { withTowerActionContext } = load("src/game/towerIdentity.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { encodeSaveGraph, decodeSaveGraph } = load("src/game/saveGraph.ts");
const { applyReversalEffect, expireReversalEffect } = load("src/game/rules/reversal.ts");
const { scaledByEffectiveUpgrades } = load("src/game/upgrades.ts");
const definition = id => cardDefinitions.find(d => d.id === id);
const tower = (id = "A", order = 1) => createTowerState(definition(id), 3, 4, 2500, order);

function legacyState(def, lane, column, time, order, options = {}) {
  const sourceCardId = def.id, id = sourceCardId.startsWith("?") && sourceCardId.length > 1 ? sourceCardId.slice(1) : sourceCardId;
  const baseStats = { maxHp: def.maxHp, armor: def.armor ?? 0, magicResistance: def.magicResistance ?? 0,
    attackSpeed: def.attackSpeed, attackPower: def.attackPower, damageType: def.damageType };
  return {
    id: `tower:${order}`, type: id, sourceCardId: sourceCardId !== id ? sourceCardId : undefined,
    lane, column, x: BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2, y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2,
    hp: baseStats.maxHp, baseStats, finalStats: { ...baseStats }, maxHp: baseStats.maxHp,
    baseMaxHp: baseStats.maxHp, armor: baseStats.armor, magicResistance: baseStats.magicResistance,
    attackSpeed: baseStats.attackSpeed, lastFire: def.category === "production" && def.attackSpeed && def.produceAmount ? time : -Infinity,
    level: 1, levelBonus: 0, mirrorLevelBonus: 0,
    nextProduceAt: def.produceEvery ? time + def.produceEvery : Infinity, armedAt: def.armTime ? time + def.armTime : 0,
    skills: id === "w" ? { airPatrol: { sp: 8, spBuffer: 0, activeUntil: 0 } } : {},
    autoUpgrade: false, reflectProjectiles: Boolean(def.reflectProjectiles), nextRepelDirection: order % 2 === 0 ? -1 : 1,
    facingDirection: 1, statusEffects: [], transient: Boolean(options.transient), mirroredEffect: false,
    turnTargetId: options.turnTargetId, placedOrder: order, deployedAt: time, inPlay: true, trueDamageUntil: 0, flyingUntil: 0
  };
}

test("all card/imitator state factories preserve legacy values, timer sentinels and property order", () => {
  const definitions = [...cardDefinitions, ...cardDefinitions.filter(d => d.cost <= 999 && d.id !== "?")
    .map(d => ({ ...d, id: `?${d.id}`, cooldown: d.cooldown * 2 }))];
  for (const def of definitions) for (const time of [0, 12345]) for (const order of [1, 2]) {
    const options = { transient: order === 2, turnTargetId: order === 2 ? "tower:8" : undefined };
    const actual = createTowerState(def, 2, 7, time, order, options);
    const expected = legacyState(def, 2, 7, time, order, options);
    assert.deepEqual(actual, expected, def.id);
    assert.equal(JSON.stringify(captureBattleSnapshot({ towers: [actual] })),
      JSON.stringify(captureBattleSnapshot({ towers: [expected] })), def.id);
    assert.equal("body" in actual, false);
  }
});

test("tower construction does not mutate definitions or share mutable panels, skills and effects", () => {
  const def = Object.freeze({ ...definition("w"), id: "?w" });
  const a = createTowerState(def, 0, 0, 123, 1), b = createTowerState(def, 0, 0, 123, 2);
  assert.equal(a.type, "w"); assert.equal(a.sourceCardId, "?w"); assert.equal(def.id, "?w");
  a.baseStats.maxHp = 1; a.finalStats.maxHp = 2; a.skills.airPatrol.sp = 0;
  a.statusEffects.push({ name: "reversed", expiresAt: 999 });
  assert.equal(b.baseStats.maxHp, def.maxHp); assert.equal(b.finalStats.maxHp, def.maxHp);
  assert.equal(b.skills.airPatrol.sp, 8); assert.equal(b.statusEffects.length, 0);
  for (const id of ["o", "j", "h", "c", "S", "#"]) assert.deepEqual(tower(id).skills, {});
});

test("base panels retain optional fields, zero attack, production delay and arming deadlines", () => {
  const d = { id: "A", category: "attack", maxHp: 10, attackPower: 0 };
  assert.deepEqual(towerBaseStatsFromDefinition(d), {
    maxHp: 10, armor: 0, magicResistance: 0, attackSpeed: undefined, attackPower: 0, damageType: undefined
  });
  const t = createTowerState(d, 0, 0, 600, 1);
  assert.equal(t.lastFire, -Infinity); assert.equal(t.nextProduceAt, Infinity); assert.equal(t.armedAt, 0);
  assert.equal(tower("X").lastFire, 2500);
  assert.equal(tower("G").armedAt, 2500 + definition("G").armTime);
  const timed = createTowerState({ ...d, produceEvery: 4000 }, 0, 0, 600, 1);
  assert.equal(timed.nextProduceAt, 4600);
});

test("facing, flight and damage queries preserve reversal and exact deadline semantics", () => {
  const t = tower("w");
  assert.equal(rules.towerFacingDirection(t), 1);
  applyReversalEffect(t, 100, 0); assert.equal(rules.towerFacingDirection(t), -1);
  t.facingDirection = -1; assert.equal(rules.towerFacingDirection(t), 1);
  expireReversalEffect(t, 100); assert.equal(rules.towerFacingDirection(t), -1);
  t.trueDamageUntil = 100;
  assert.equal(rules.towerDamageType(t, "magic", 99), "true");
  assert.equal(rules.towerDamageType(t, "magic", 100), "magic");
  assert.equal(rules.towerDamageType(t, undefined, 100), "physical");
  rules.setTowerFlyingUntil(t, 50); assert.equal(rules.towerIsFlying(t), true);
  rules.setTowerFlyingUntil(t, 0); assert.equal(rules.towerIsFlying(t), false);
  const trap = tower("G");
  assert.equal(rules.isTrapArmed(trap, trap.armedAt - 1), false);
  assert.equal(rules.isTrapArmed(trap, trap.armedAt), true);
  assert.equal(rules.isTrapArmed(t, 1e9), false);
});

test("queries retain copied behavior, action context and distinct trigger scaling rules", () => {
  const t = tower("@");
  Object.assign(t, { copiedType: "G", level: 21, levelBonus: 3, mirrorLevelBonus: 2, armedAt: 40 });
  assert.equal(rules.effectiveTowerLevel(t), 26);
  assert.equal(rules.isTrapArmed(t, 40), true);
  assert.equal(rules.getProductionAmount(t, definition("X")), scaledByEffectiveUpgrades(definition("X").produceAmount, 26));
  assert.equal(rules.getHitProductionAmount(t, { hitProduceAmount: 11 }), scaledByEffectiveUpgrades(11, 26));
  assert.equal(rules.getProductionAmount(t, {}), 0);
  assert.equal(rules.getShockCount(t, { triggerCount: 5 }), scaledByEffectiveUpgrades(5, 26));
  assert.equal(rules.getTriggerDebuffDuration(t, { triggerDebuff: "frozen", triggerDebuffDuration: 15000 }), scaledByEffectiveUpgrades(15000, 26));
  assert.equal(rules.getTriggerDebuffDuration(t, { triggerDebuff: "reversed", triggerDebuffDuration: 5000 }), 130000);
  withTowerActionContext(t, { type: "l", level: 7, stats: { damageType: "magic" } }, () => {
    assert.equal(rules.effectiveTowerLevel(t), 7); assert.equal(rules.getShockCount(t, {}), 1);
    t.trueDamageUntil = 1000;
    assert.equal(rules.towerDamageType(t, "physical", 0), "magic");
    assert.equal(rules.isTrapArmed(t, 100), false);
  });
  assert.equal(rules.effectiveTowerLevel(t), 26);
  assert.equal(rules.towerDamageType(t, "physical", 0), "true");
});

test("automatic upgrade queries keep lowest-level then earliest-placement ordering and numeric eligibility", () => {
  const first = tower("A", 1), second = tower("A", 2), low = tower("A", 3), removed = tower("A", 4), off = tower("A", 5);
  for (const t of [first, second, low, removed]) t.autoUpgrade = true;
  first.level = second.level = 3; removed.inPlay = false;
  const all = [second, first, low, removed, off];
  assert.equal(rules.findAutoUpgradeTarget(all, "?A"), low);
  low.level = 3; assert.equal(rules.findAutoUpgradeTarget(all, "A"), first);
  const zero = tower("0"), one = tower("1"); zero.autoUpgrade = one.autoUpgrade = true;
  assert.equal(rules.findAutoUpgradeTarget([zero, one], "0"), zero);
  assert.equal(rules.findAutoUpgradeTarget([zero, one], "1"), undefined);
  assert.equal(rules.isCardReadyForAutoUpgrade({ readyAt: 100 }, 99), false);
  assert.equal(rules.isCardReadyForAutoUpgrade({ readyAt: 100 }, 100), true);
});

class Visual {}
const visualKeys = ["body", "border", "label", "facingIcon", "autoUpgradeBorder", "trueDamageBorder",
  "flyingHalo", "hpFill", "negativeHpBack", "negativeHpFill", "rangeBorder", "levelText"];
const visuals = () => Object.fromEntries(visualKeys.map(key => [key, new Visual()]));
function networkFixture() {
  const a = Object.assign(tower("A", 1), visuals(), { mirrorGroupId: 9, mirrorLevelBonus: 2, unyieldingRatio: .3 });
  const b = Object.assign(tower("u", 2), visuals());
  const shell = Object.assign(tower("()", 3), visuals());
  a.healthPool = b.healthPool = { members: [a, b], hp: 1200, maxHp: 6000, linkCount: 1 };
  a.parenthesisGuard = shell; shell.parenthesisInner = a;
  Object.assign(a, { continuousAttack: true, topologyTarget: { lane: 1, column: 2 }, topologyOrder: 90,
    moveVisual: { fromX: 10, fromY: 20, startedAt: 100, duration: 500 },
    imitatedSkills: ["w"], imitatedSkillLevels: { w: 4 }, routedSkills: { w: 2500 },
    pipelineSkillContexts: { w: { level: 4, stats: a.finalStats } }, nextInterceptionAt: 123,
    healingCredit: 5, healingUpdatedAt: 789, projectileRouteIndex: 3, copyRevision: 2, copiedType: "X",
    numberValue: 3, equationLevel: 2, numberMemory: [{ type: "X", sourceIds: [b.id], count: 7 }],
    numberChannels: { horizontal: { numberValue: 0, numberMemory: [{ type: "A", sourceIds: [b.id], count: 9 }] } }
  });
  const shot = { type: "bolt", vx: 430, vy: 0, damage: 400, damageType: "physical", hitCount: 3,
    partialHitDamage: 150, initialDamageBudget: 1200, splashRadius: 0, remainingRange: Infinity,
    sourceTower: a, sourceBehaviorType: "A", pipelineMovedAt: 1000 };
  a.projectileBank = { shots: [shot], remaining: 0, nextAt: 2000, outletIndex: 2 };
  b.projectileNode = { input: [shot], output: [], processing: { shots: [shot], count: 1, completeAt: 3000 } };
  b.inPlay = false; b.nullified = true; b.nullifiedUntil = 14000; b.nextNullificationAt = 60000;
  return { towers: [a, shell], nullifiedTowers: { towers: [b], until: 14000 }, actions: [{ source: b }], projectiles: [] };
}
function legacyCapture(state) {
  return encodeSaveGraph(state, value => value.id?.startsWith("tower:")
    ? { kind: "tower", omit: new Set(visualKeys) } : { kind: Array.isArray(value) ? "array" : "object" });
}

test("explicit tower fields retain the legacy graph layout including all optional network state", () => {
  const state = networkFixture();
  assert.equal(JSON.stringify(captureBattleSnapshot(state)), JSON.stringify(legacyCapture(state)));
});

test("tower render caches and callbacks cannot enter snapshots, while state works without visuals", () => {
  const state = networkFixture(), expected = JSON.stringify(captureBattleSnapshot(state));
  for (const t of [...state.towers, ...state.nullifiedTowers.towers]) {
    const cache = new Visual(); cache.self = cache;
    t.previewCache = cache; t.onDraw = () => {};
    for (const key of visualKeys) delete t[key];
  }
  assert.equal(JSON.stringify(captureBattleSnapshot(state)), expected);
});

test("legacy decode retains shared pools, parentheses, NUL sources and shared pipeline packets", () => {
  const graph = JSON.parse(JSON.stringify(legacyCapture(networkFixture())));
  const state = decodeSaveGraph(graph, () => ({}));
  const [a, shell] = state.towers, b = state.nullifiedTowers.towers[0];
  assert.equal(a.healthPool, b.healthPool); assert.deepEqual(a.healthPool.members, [a, b]);
  assert.equal(a.parenthesisGuard, shell); assert.equal(shell.parenthesisInner, a);
  assert.equal(b, state.actions[0].source); assert.equal(b.inPlay, false);
  const shot = a.projectileBank.shots[0];
  assert.equal(shot.sourceTower, a); assert.equal(shot, b.projectileNode.input[0]);
  assert.equal(shot, b.projectileNode.processing.shots[0]); assert.equal(shot.remainingRange, Infinity);
  assert.equal(a.pipelineSkillContexts.w.stats, a.finalStats);
  assert.equal(a.lastFire, -Infinity); assert.equal(a.nextProduceAt, Infinity);
  assert.deepEqual(a.moveVisual, { fromX: 10, fromY: 20, startedAt: 100, duration: 500 });
  assert.equal(a.numberMemory[0].count, 7); assert.equal(a.numberChannels.horizontal.numberMemory[0].count, 9);
  assert.equal(JSON.stringify(captureBattleSnapshot(state)), JSON.stringify(graph));
});

test("the narrow facing renderer uses pure direction rules and preserves reversal visuals", () => {
  const { syncTowerFacingVisual } = load("src/render/towerFacing.ts");
  const scale = () => ({ scaleX: 1, scaleY: 1, setScale(x, y) { this.scaleX = x; this.scaleY = y; } });
  const t = Object.assign(tower("A"), { border: scale(), label: scale(), facingIcon: { visible: false,
    setVisible(value) { this.visible = value; } } });
  applyReversalEffect(t, 1000, 0); syncTowerFacingVisual(t);
  assert.equal(t.border.scaleX, -1); assert.equal(t.label.scaleX, -1); assert.equal(t.facingIcon.visible, true);
  t.facingDirection = -1; syncTowerFacingVisual(t);
  assert.equal(t.border.scaleX, 1); assert.equal(t.label.scaleX, 1); assert.equal(t.facingIcon.visible, false);
});
