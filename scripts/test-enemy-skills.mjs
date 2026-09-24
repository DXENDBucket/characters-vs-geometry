import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// No Phaser override: data, charge rules and encyclopedia details must load without the engine.
const storage = new Map();
const pure = createTypeScriptLoader({}, { window: { localStorage: {
  getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)
} } });
const { ENEMY_SKILLS, ENEMY_SKILL_IDS, ENEMY_AURAS, enemyFamilyProvidesSupport } = pure("src/data/enemyAbilities.ts");
const { initialEnemySkillStates, enemySkillCharge, chargeEnemySkill } = pure("src/game/enemySkillRules.ts");
const { createSkillState, spendSkillSp } = pure("src/game/skillState.ts");
const { enemyKindAtRank } = pure("src/registry/enemies.ts");

test("skill data, registration, initial states and encyclopedia agree at ordinary and endless ranks", () => {
  const { createEnemySkillRegistry, enemySkillDefinitions } = pure("src/game/enemySkillRegistry.ts");
  const { enemyDetailSections } = pure("src/enemyEncyclopediaDetails.ts");
  const { skillChargeFields } = pure("src/encyclopediaSections.ts");
  const { setLanguage } = pure("src/i18n.ts");
  const actions = Object.fromEntries(ENEMY_SKILL_IDS.map(id => [id, () => id]));
  const registry = createEnemySkillRegistry(actions);
  for (const language of ["en", "zh-CN"]) {
    setLanguage(language);
    for (const id of ENEMY_SKILL_IDS) for (const rank of [1, 2, 3, 20, 100, 10000]) {
      const data = ENEMY_SKILLS[id], kind = enemyKindAtRank(data.family, rank);
      const definition = enemySkillDefinitions(registry, { kind }).find(d => d.stateKey === id);
      assert.equal(definition.update, actions[id]);
      const state = initialEnemySkillStates(kind)[id] ?? createSkillState();
      const charge = enemySkillCharge(data, rank);
      assert.equal(state.sp, charge.initial);
      assert.equal(data.regen * (state.regenMultiplier ?? 1), charge.regen);
      const section = enemyDetailSections(kind, "").find(s => s.title === data.name[language === "en" ? "en" : "zh"]);
      assert.equal(section.tone, "skill");
      assert.deepEqual(section.fields.slice(0, 5), skillChargeFields(charge));
      assert.deepEqual(section.ranges[0].shape, data.range.shape);
    }
  }
  assert.deepEqual(enemySkillDefinitions(registry, { kind: "circle" }), []);
});

test("lazy state layout and initial rank scaling remain compatible with existing saves", () => {
  for (const kind of ["circle", "heart", "hexagon", "angelPentagon"]) assert.deepEqual(initialEnemySkillStates(kind), {});
  for (const rank of [1, 2, 3, 100]) {
    assert.deepEqual(initialEnemySkillStates(enemyKindAtRank("archangelHeptagon", rank)), {
      ascension: { sp: 10, spBuffer: 0, activeUntil: 0 }
    });
    assert.deepEqual(initialEnemySkillStates(enemyKindAtRank("dollar", rank)), {
      incitement: { sp: 20, spBuffer: 0, activeUntil: 0 }
    });
    if (rank > 1) assert.deepEqual(initialEnemySkillStates(enemyKindAtRank("angelPentagon", rank)), {
      wings: { sp: Math.min(15, (rank - 1) * 2), spBuffer: 0, activeUntil: 0, regenMultiplier: 1 + (rank - 1) * .2 }
    });
  }
  const a = initialEnemySkillStates("angelPentagon3"), b = initialEnemySkillStates("angelPentagon3");
  a.wings.sp = 0; assert.equal(b.wings.sp, 4);
});

test("charge and cast deadlines match the pre-refactor algorithms tick for tick", () => {
  const legacy = {
    heal: { max: 20, cost: 20, regen: 1, duration: 0 },
    lead: { max: 5, cost: 5, regen: 1, duration: 0 },
    incitement: { max: 25, cost: 20, regen: 1, duration: 0 },
    wings: { max: 15, cost: 15, regen: 1, duration: 3000 },
    ascension: { max: 15, cost: 15, regen: 1, duration: 6000 }
  };
  for (const [id, old] of Object.entries(legacy)) for (const rank of [1, 2, 3, 100]) {
    const kind = enemyKindAtRank(ENEMY_SKILLS[id].family, rank);
    const actual = initialEnemySkillStates(kind)[id] ?? createSkillState(), expected = structuredClone(actual);
    for (let tick = 0; tick < 5000; tick++) {
      const time = tick * (1000 / 60), seconds = 1 / 60;
      const ready = chargeEnemySkill(id, actual, seconds, time);
      const paused = old.duration > 0 && time < expected.activeUntil;
      if (!paused) {
        expected.spBuffer += seconds * old.regen * (expected.regenMultiplier ?? 1);
        while (expected.spBuffer >= 1 && expected.sp < old.max) { expected.sp++; expected.spBuffer--; }
        if (expected.sp >= old.max) { expected.sp = old.max; expected.spBuffer = 0; }
      }
      assert.equal(ready, !paused && expected.sp >= old.max, `${kind} at tick ${tick}`);
      // Occasionally lack a target: full SP must be retained, not spent by the charge helper.
      if (ready && tick % 17 !== 0) {
        spendSkillSp(actual, ENEMY_SKILLS[id].cost); actual.activeUntil = time + ENEMY_SKILLS[id].duration;
        expected.sp = Math.max(0, expected.sp - old.cost); expected.spBuffer = 0; expected.activeUntil = time + old.duration;
      }
      assert.deepEqual(actual, expected, `${kind} at tick ${tick}`);
    }
  }
});

test("support index membership follows the shared aura catalog", () => {
  const expected = new Set(Object.values(ENEMY_AURAS).flatMap(aura => aura.families));
  const { enemyArchetypes } = pure("src/data/enemyArchetypes.ts");
  for (const family of Object.keys(enemyArchetypes)) assert.equal(enemyFamilyProvidesSupport(family), expected.has(family), family);
});

const runtimeLoad = createTypeScriptLoader({
  phaser: { default: { Math: { Clamp: (v, min, max) => Math.max(min, Math.min(max, v)) }, GameObjects: { Text: class {} } } },
  "src/render/unitShapes.ts": {},
  "src/render/combatEffects.ts": { makeHealParticles() {}, makeShiftEffect() {} },
  "src/render/enemySkillEffects.ts": { makeWingPulse() {} }
});
const { updateEnemySkills } = runtimeLoad("src/game/enemySkills.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = runtimeLoad("src/config.ts");
const visual = () => new Proxy({ list: [], getData() {}, setScale() {}, setPosition() {}, setVisible() {}, setDepth() {} }, {
  get: (object, key) => key in object ? object[key] : () => {}
});
function enemy(kind, lane = 3, column = 5) {
  const definition = pure("src/registry/enemies.ts").getEnemyDefinition(kind);
  return { kind, x: BOARD_X + (column + .5) * CELL_WIDTH, y: BOARD_Y + (lane + .5) * CELL_HEIGHT, lane,
    hp: definition.hp, inPlay: true, baseStats: { maxHp: definition.hp }, skills: initialEnemySkillStates(kind), statusEffects: [],
    statusMultiplierCache: { speed: 1, attack: 1, armor: 1, reversed: false }, body: visual(), shape: visual(),
    statusBorder: visual(), frozenBorder: visual(), flyingHalo: visual(), powerIcon: visual(), sunderIcon: visual() };
}

test("Wings/Ascension preserve ranges, flight durations, carrier propagation and pause recovery", () => {
  for (const [kind, id, duration] of [["angelPentagon", "wings", 3000], ["archangelHeptagon", "ascension", 6000]]) {
    const caster = enemy(kind), near = enemy("circle"), edge = enemy("circle"), outside = enemy("circle");
    const carrier = enemy("parentheses"), passenger = enemy("triangle"), high = enemy("circle");
    carrier.parenthesisCargo = [passenger]; passenger.parenthesisCarrier = carrier; passenger.inPlay = false;
    high.highFlightUntil = 20000;
    edge.x += CELL_WIDTH * (id === "wings" ? 1.5 : 2.5); outside.x = edge.x + .01;
    caster.skills[id] = { sp: 15, spBuffer: 0, activeUntil: 0 };
    const runtime = { scene: {}, enemies: [caster, near, edge, outside, carrier, high] };
    updateEnemySkills(runtime, 0, 1000);
    assert.equal(caster.skills[id].sp, 0);
    assert.equal(caster.skills[id].activeUntil, 1000 + duration);
    for (const target of [near, edge, carrier]) {
      assert.equal(target.statusEffects.length, 1);
      assert.equal(target.statusEffects[0].name, "flying");
      assert.equal(target.statusEffects[0].expiresAt, 1000 + duration);
      assert.equal(target.statusEffects[0].speedMultiplier, 2);
    }
    for (const target of [outside, passenger, high]) assert.deepEqual(target.statusEffects, []);
    // Ignore flight eligibility here; the pure charge helper independently owns active-time gating.
    assert.equal(chargeEnemySkill(id, caster.skills[id], 1, 1000 + duration - 1), false);
    assert.equal(caster.skills[id].sp, 0);
    chargeEnemySkill(id, caster.skills[id], 1, 1000 + duration);
    assert.equal(caster.skills[id].sp, 1);
  }
});

test("Heal waits for an injured target, uses the lowest ratio and honors its exact range", () => {
  const caster = enemy("hexagon"), target = enemy("circle"), outside = enemy("triangle");
  caster.skills.heal = { sp: 20, spBuffer: 0, activeUntil: 0 };
  const runtime = { scene: {}, enemies: [caster, target, outside] };
  updateEnemySkills(runtime, 0, 0); assert.equal(caster.skills.heal.sp, 20);
  caster.x = 0;
  target.hp = 100; target.x = CELL_WIDTH * 1.4;
  outside.hp = 1; outside.x = CELL_WIDTH * 1.4 + .01;
  updateEnemySkills(runtime, 0, 0);
  assert.equal(caster.skills.heal.sp, 0);
  assert.equal(target.hp, Math.min(target.baseStats.maxHp, 100 + caster.baseStats.maxHp * .3));
  assert.equal(outside.hp, 1);
});

test("simultaneous Hearts claim targets once using original positions, including oscillating units", () => {
  const first = enemy("heart", 2), second = enemy("heart", 4), target = enemy("tilde", 3, 6), outside = enemy("circle", 6, 6);
  target.oscillationCenterY = target.y; target.oscillationPhase = 1; target.oscillationLastY = target.y;
  for (const caster of [first, second]) caster.skills.lead = { sp: 5, spBuffer: 0, activeUntil: 0 };
  updateEnemySkills({ scene: {}, enemies: [first, second, target, outside] }, 0, 0);
  assert.equal(target.lane, first.lane); assert.equal(target.y, first.y);
  assert.equal(target.oscillationCenterY, first.y); assert.equal(target.oscillationPhase, 0);
  assert.equal(outside.lane, 6);
  assert.equal(first.skills.lead.sp, 0); assert.equal(second.skills.lead.sp, 5);
});

test("Frozen and High Flight pause registered skills, including a frozen carrier's passenger", () => {
  const caster = enemy("angelPentagon2"), carrier = enemy("parentheses");
  const runtime = { scene: {}, enemies: [caster] };
  caster.statusEffects = [{ name: "frozen", expiresAt: 1000 }];
  updateEnemySkills(runtime, 1, 0); assert.equal(caster.skills.wings.sp, 2);
  caster.statusEffects = []; caster.highFlightUntil = 2000;
  updateEnemySkills(runtime, 1, 1000); assert.equal(caster.skills.wings.sp, 2);
  delete caster.highFlightUntil;
  carrier.parenthesisCargo = [caster]; caster.parenthesisCarrier = carrier; caster.inPlay = false;
  carrier.statusEffects = [{ name: "frozen", expiresAt: 3000 }]; runtime.enemies = [carrier];
  updateEnemySkills(runtime, 1, 2000); assert.equal(caster.skills.wings.sp, 2);
  updateEnemySkills(runtime, 1, 3000); assert.equal(caster.skills.wings.sp, 3);
});
