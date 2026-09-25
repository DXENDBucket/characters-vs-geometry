import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const storage = new Map();
const pure = createTypeScriptLoader({}, { window: { localStorage: {
  getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)
} } });
const { TOWER_SKILLS, TOWER_SKILL_CARD_IDS, towerSkillData } = pure("src/data/towerAbilities.ts");
const { initialTowerSkillStates, towerSkillCharge, chargeTowerSkill, towerSkillIsReady, spendTowerSkill,
  resetTowerSkillCharge } = pure("src/game/towerSkillRules.ts");
const { createSkillState } = pure("src/game/skillState.ts");

test("tower charge data and encyclopedia load without Phaser and agree at every preview level", () => {
  const { towerDetailSections } = pure("src/encyclopediaDetails.ts");
  const { cardDefinitions } = pure("src/data/cards.ts");
  const { skillChargeFields } = pure("src/encyclopediaSections.ts");
  const { setLanguage } = pure("src/i18n.ts");
  for (const language of ["zh-CN", "en"]) {
    setLanguage(language);
    for (const id of TOWER_SKILL_CARD_IDS) for (const level of [1, 2, 20, 60, 300, 10000]) {
      const data = TOWER_SKILLS[id], card = cardDefinitions.find(card => card.id === id);
      const section = towerDetailSections(card, level, "").find(s => s.tone === "skill");
      assert.equal(section.title, data.name[language === "en" ? "en" : "zh"]);
      assert.deepEqual(section.fields.slice(0, 5), skillChargeFields(towerSkillCharge(data, level)));
      assert.deepEqual(section.ranges[0].shape, data.range.shape);
      if (id === "S") assert.deepEqual(section.ranges[1].shape, data.impact.shape);
    }
  }
  assert.equal(towerSkillData("A"), undefined);
});

test("deployment and copy initialization keep independent, lazy skill states compatible with saves", () => {
  for (const id of ["A", "@", "?", ...TOWER_SKILL_CARD_IDS.filter(id => id !== "w")]) {
    assert.deepEqual(initialTowerSkillStates(id), {});
  }
  const a = initialTowerSkillStates("w"), b = initialTowerSkillStates("w");
  assert.deepEqual(a, { airPatrol: { sp: 8, spBuffer: 0, activeUntil: 0 } });
  a.airPatrol.sp = 0;
  assert.equal(b.airPatrol.sp, 8);
});

test("charge timing matches the old algorithms through active, ready and fractional boundary ticks", () => {
  const legacy = {
    w: { max: 10, cost: 10, duration: 10000, paused: true },
    o: { max: 10, cost: 10, duration: 6000, paused: true, elapsed: true },
    j: { max: 10, cost: 10, duration: 10000, paused: true, elapsed: true },
    c: { max: 20, cost: 20, duration: 10000, paused: true },
    h: { max: 20, cost: 20, duration: 0 },
    S: { max: 30, cost: 30, duration: 1000, paused: true },
    "#": { max: 30, cost: 30, duration: 500 }
  };
  for (const [id, old] of Object.entries(legacy)) for (const level of [1, 2, 20, 300]) {
    const actual = initialTowerSkillStates(id)[TOWER_SKILLS[id].stateKey] ?? createSkillState();
    const expected = structuredClone(actual);
    let time = 0;
    for (let tick = 0; tick < 6000; tick++) {
      const seconds = [1 / 60, .011, .023, 0][tick % 4];
      time += seconds * 1000;
      const paused = old.paused && time < expected.activeUntil;
      // These controller paths skip charging an already full state; o/j/# always call gainSkillSp.
      const callCharge = ["o", "j", "#"].includes(id) || actual.sp < old.max;
      if (callCharge) chargeTowerSkill(id, actual, seconds, time, level);
      if (!paused && callCharge) {
        const elapsed = old.elapsed ? Math.min(seconds, Math.max(0, (time - expected.activeUntil) / 1000)) : seconds;
        expected.spBuffer += elapsed * (id === "#" ? 1 + .5 * (level - 1) : 1);
        while (expected.spBuffer >= 1 && expected.sp < old.max) { expected.sp++; expected.spBuffer--; }
        if (expected.sp >= old.max) { expected.sp = old.max; expected.spBuffer = 0; }
      }
      assert.equal(towerSkillIsReady(id, actual, time), !paused && expected.sp >= old.max);
      // Full SP can wait for a target. Spending must remain separate from recovery/readiness.
      if (towerSkillIsReady(id, actual, time) && tick % 17 === 0) {
        spendTowerSkill(id, actual);
        expected.sp = Math.max(0, expected.sp - old.cost); expected.spBuffer = 0;
        // Push animation never set activeUntil, and guardian is instantaneous.
        if (old.paused) {
          actual.activeUntil = time + TOWER_SKILLS[id].duration;
          expected.activeUntil = time + old.duration;
        }
      }
      assert.deepEqual(actual, expected, `${id} level ${level} tick ${tick}`);
    }
  }
});

test("upgrade resets do not restore initial SP or erase guardian charge", () => {
  for (const id of TOWER_SKILL_CARD_IDS) {
    const state = { sp: 9, spBuffer: .75, activeUntil: 9876, regenMultiplier: 2 };
    resetTowerSkillCharge(id, state);
    assert.deepEqual(state, { sp: id === "h" ? 9 : 0, spBuffer: id === "h" ? .75 : 0,
      activeUntil: ["h", "#"].includes(id) ? 9876 : 0, regenMultiplier: 2 });
  }
});

const visual = () => ({ alpha: 1, visible: true, setAlpha(alpha) { this.alpha = alpha; return this; },
  setVisible(visible) { this.visible = visible; return this; } });
const runtimeLoad = createTypeScriptLoader({
  phaser: { default: { Utils: { Array: { Remove: (items, value) => items.splice(items.indexOf(value), 1) } } } },
  "src/game/towers.ts": {
    syncTowerFlyingVisual() {}, syncTowerFlyingPositionVisual() {}, syncNumberSkillRange() {}
  },
  "src/game/unitStatRules.ts": { towerFinalStats: tower => tower.finalStats, towerAttackAmount: () => 500 },
  "src/game/towerHealthRules.ts": { changeTowerHealth: (tower, amount) => {
    const before = tower.hp; tower.hp = Math.min(tower.finalStats.maxHp, tower.hp + amount); return tower.hp - before;
  } },
  "src/render/combatEffects.ts": { makeHealParticles() {}, makeShiftEffect() {} }
});
const { TowerSkillController } = runtimeLoad("src/game/towerSkills.ts");
const { getTowerSkillState } = runtimeLoad("src/game/skillState.ts");
const { withTowerActionContext } = runtimeLoad("src/game/towerIdentity.ts");
function tower(type, copiedType) {
  return { type, copiedType, inPlay: true, transient: false, level: 1, levelBonus: 0, mirrorLevelBonus: 0,
    placedOrder: 1, lane: 3, column: 4, x: 500, y: 400, hp: 3000, flyingUntil: 0, trueDamageUntil: 0, statusEffects: [],
    skills: initialTowerSkillStates(copiedType ?? type), border: visual(), rangeBorder: visual(), finalStats: { maxHp: 3000 } };
}
function controller(towers, extra = {}) {
  const runtime = { towers, enemies: [], boss: null, battleTime: 0, gameOver: false, battlePaused: false,
    getDefinition: () => ({}), prepareSkillTargeting() {}, onTargetingChanged() {}, beginTowerPush() {}, ...extra };
  return { runtime, skills: new TowerSkillController({}, () => runtime) };
}

test("skill registry metadata follows the catalog, including targeted/group/automatic dispatch", () => {
  const { createTowerSkillRegistry } = runtimeLoad("src/game/towerSkillRegistry.ts");
  const actions = new Proxy({}, { get: (_object, key) => () => key });
  const { NO_TOWER_SKILL_PRESENTATION } = runtimeLoad("src/game/towerSkillPresentation.ts");
  const registry = createTowerSkillRegistry(actions, () => NO_TOWER_SKILL_PRESENTATION);
  assert.deepEqual(Object.keys(registry).sort(), [...TOWER_SKILL_CARD_IDS].sort());
  for (const id of TOWER_SKILL_CARD_IDS) {
    const definition = registry[id], data = TOWER_SKILLS[id];
    assert.equal(definition.stateKey, data.stateKey);
    assert.equal(definition.maxSp, data.maxSp);
    assert.equal(!!definition.manual, data.activation === "manual");
    assert.equal(!!definition.reset, data.resetOnUpgrade !== "none");
    if (definition.manual) {
      assert.equal(!!definition.manual.requiresTarget, !!data.requiresTarget);
      assert.equal(!!definition.manual.supportsGroup, !!data.supportsGroup);
    }
  }
});

test("! automatically casts untargeted skills on originals and copies, but never aims S or #", () => {
  const routed = [], pushed = [];
  const towers = ["w", "o", "j", "c", "S", "#"].flatMap(id => [tower(id), tower("@", id)]);
  const { runtime, skills } = controller(towers, { onTowerAction: unit => { routed.push(unit); }, beginTowerPush: unit => pushed.push(unit) });
  runtime.battleTime = 5000;
  for (const unit of towers) {
    unit.continuousAttack = true;
    const data = TOWER_SKILLS[unit.copiedType ?? unit.type];
    getTowerSkillState(unit, data.stateKey).sp = data.maxSp;
  }
  skills.update(0, runtime.battleTime);
  assert.equal(routed.length, 8);
  assert.equal(pushed.length, 0);
  assert.equal(skills.hasSpellMortarTargeting(), false);
  for (const unit of towers) {
    const id = unit.copiedType ?? unit.type, state = unit.skills[TOWER_SKILLS[id].stateKey];
    if (["S", "#"].includes(id)) { assert.equal(state.sp, TOWER_SKILLS[id].maxSp); continue; }
    assert.equal(state.sp, 0);
    assert.equal(state.activeUntil, runtime.battleTime + TOWER_SKILLS[id].duration);
  }
  for (const blocked of ["battlePaused", "gameOver"]) {
    const unit = tower("w"); unit.continuousAttack = true; unit.skills.airPatrol.sp = 10;
    const run = controller([unit], { [blocked]: true }); run.skills.update(0, 0);
    assert.equal(unit.flyingUntil, 0, blocked);
  }
});

test("controller upgrades cancel flight/aiming and preserve h SP, including copied forms", () => {
  const units = TOWER_SKILL_CARD_IDS.flatMap(id => [tower(id), tower("@", id)]);
  const { skills } = controller(units);
  for (const unit of units) {
    const id = unit.copiedType ?? unit.type, state = getTowerSkillState(unit, TOWER_SKILLS[id].stateKey);
    Object.assign(state, { sp: 8, spBuffer: .5, activeUntil: 5000 });
    unit.routedSkills = { [id]: 5000 };
    if (id === "w") unit.flyingUntil = 5000;
    if (id === "S") { skills.spellMortarTargetingTowers.push(unit); skills.spellMortarTargetingTowerSet.add(unit); }
    skills.resetTowerSkill(unit);
    assert.equal(state.sp, id === "h" ? 8 : 0);
    assert.equal(state.spBuffer, id === "h" ? .5 : 0);
    assert.equal(state.activeUntil, ["h", "#"].includes(id) ? 5000 : 0);
    assert.equal(unit.routedSkills[id], undefined);
    if (id === "w") assert.equal(unit.flyingUntil, 0);
  }
  assert.equal(skills.hasSpellMortarTargeting(), false);
});

test("guardian waits at full SP for injured targets, then spends once and heals", () => {
  const unit = tower("h"), ally = tower("B"); ally.column++;
  const { runtime, skills } = controller([unit, ally]);
  skills.update(20, 20000);
  assert.equal(unit.skills.guardian.sp, 20);
  ally.hp = 100;
  runtime.battleTime = 21000; skills.update(1, runtime.battleTime);
  assert.equal(unit.skills.guardian.sp, 0);
  assert.equal(ally.hp, 1300);
});

test("local S targeting cannot pause authoritative SP recovery", () => {
  const unit = tower("S"), { skills } = controller([unit]);
  const state = getTowerSkillState(unit, "spellMortar"); state.sp = 10;
  skills.spellMortarTargetingTowers.push(unit); skills.spellMortarTargetingTowerSet.add(unit);
  skills.update(5, 5000); assert.equal(state.sp, 15);
  skills.cancelSpellMortarTargeting(); assert.equal(state.sp, 15);
  skills.update(5, 10000); assert.equal(state.sp, 20);
});

test("explicit skills preflight all sources and never spend a subset or switch a copied behavior", () => {
  const a = tower("c"), b = tower("@", "c"), { skills } = controller([a, b]);
  getTowerSkillState(a, "clock").sp = 20;
  assert.equal(skills.activateManualSkills([a, b], "c", null), "cooldown");
  assert.equal(a.skills.clock.sp, 20); assert.deepEqual(b.skills, {}, "Readiness must not initialize a rejected target");
  getTowerSkillState(b, "clock").sp = 20;
  b.copiedType = "w";
  assert.equal(skills.activateManualSkills([a, b], "c", null), "stale");
  b.copiedType = "c"; b.nullified = true;
  assert.equal(skills.activateManualSkills([a, b], "c", null), "cooldown");
  assert.equal(a.skills.clock.sp, 20); assert.equal(b.skills.clock.sp, 20);
  b.nullified = false;
  assert.deepEqual(skills.manualSkillTargets(a, true), [a, b]);
  assert.equal(skills.activateManualSkills([a, b], "c", null), "handled");
  assert.equal(a.skills.clock.sp, 0); assert.equal(b.skills.clock.sp, 0);
  assert.equal(skills.activateManualSkills([a, b], "c", null), "cooldown");
});

test("explicit skill shape matches the registered ability, without invoking a target picker", () => {
  const units = ["w", "c", "S", "#", "h"].map(id => tower(id));
  const { skills } = controller(units, { prepareSkillTargeting() { throw Error("Player UI was used by execution"); } });
  for (const unit of units) getTowerSkillState(unit, TOWER_SKILLS[unit.type].stateKey).sp = TOWER_SKILLS[unit.type].maxSp;
  for (const [targets, id, point] of [
    [[], "c", null], [[units[1], units[1]], "c", null], [[units[0]], "w", { x: 500, y: 400 }],
    [[units[2]], "S", null], [[units[3]], "#", null], [[units[4]], "h", null],
    [[units[0], tower("w")], "w", null]
  ]) assert.equal(skills.activateManualSkills(targets, id, point), "invalid");
  assert.equal(skills.activateManualSkills([units[0]], "w", null), "handled");
});

test("explicit mortar commands schedule real volleys and preserve another player's local aiming", () => {
  const a = tower("S"), b = tower("@", "S"), events = [];
  const { skills, runtime } = controller([a, b], { scheduleBattleAction: (delay, action) => events.push({ delay, action }) });
  for (const unit of [a, b]) getTowerSkillState(unit, "spellMortar").sp = 30;
  skills.spellMortarTargetingTowers.push(b); skills.spellMortarTargetingTowerSet.add(b);
  assert.equal(skills.activateManualSkills([a], "S", { x: 700, y: 400 }), "handled");
  assert.equal(events.length, 3); assert.deepEqual(events.map(event => event.delay), [0, 500, 1000]);
  assert.ok(events.every(({ action }) => action.tower === a && action.targetX === 700 && action.targetY === 400));
  assert.deepEqual(skills.selectedSpellMortars(), [b]); assert.equal(b.skills.spellMortar.sp, 30);
  // A remote activation of the locally aimed tower must not inhibit subsequent SP recovery.
  assert.equal(skills.activateManualSkills([b], "S", { x: 800, y: 400 }), "handled");
  runtime.battleTime = 2000; skills.update(1, 2000);
  assert.equal(a.skills.spellMortar.sp, 1); assert.equal(b.skills.spellMortar.sp, 1);
  assert.equal(skills.hasSpellMortarTargeting(), true); assert.deepEqual(skills.selectedSpellMortars(), []);
});

test("manual target queries are read-only and filter stale, NUL and transient group members", () => {
  const units = [tower("c"), tower("c"), tower("@", "c"), tower("c"), tower("c"), tower("c")];
  const { skills } = controller(units);
  const before = JSON.stringify(units);
  assert.deepEqual(skills.manualSkillTargets(units[0], true), []);
  assert.equal(JSON.stringify(units), before);
  for (const unit of units) getTowerSkillState(unit, "clock").sp = 20;
  units[3].inPlay = false; units[4].nullified = true; units[5].transient = true;
  assert.deepEqual(skills.manualSkillTargets(units[0], true), units.slice(0, 3));
});

test("routed active skills keep their duration without acting locally; numeric outlets do not recharge", () => {
  const units = ["w", "o", "j", "c"].map(id => tower(id));
  const { runtime, skills } = controller(units, { onTowerAction: () => true }); runtime.battleTime = 1000;
  for (const unit of units) {
    const data = TOWER_SKILLS[unit.type]; getTowerSkillState(unit, data.stateKey).sp = data.maxSp;
    assert.equal(skills.tryActivateManualSkill(unit, { x: 0, y: 0, allReady: false }), true);
    assert.equal(unit.routedSkills[unit.type], 1000 + data.duration);
  }
  runtime.battleTime = 2000; skills.update(1, 2000);
  assert.equal(units[0].flyingUntil, 0);
  assert.equal(skills.cardCooldownMultiplier(), 1);
  const outlet = tower("1"), output = controller([outlet]);
  withTowerActionContext(outlet, { type: "w", level: 3, stats: outlet.finalStats }, () => {
    assert.equal(output.skills.imitateSkill(outlet, { kind: "skill" }), true);
  });
  outlet.pipelineSkillContexts = { w: { level: 3, stats: outlet.finalStats } };
  assert.equal(outlet.flyingUntil, 10000);
  output.runtime.battleTime = 10001; output.skills.update(10, 10001);
  assert.equal(outlet.flyingUntil, 0);
  assert.equal(outlet.skills.airPatrol.sp, 0);
});
