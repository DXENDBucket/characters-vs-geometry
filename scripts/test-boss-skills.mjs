import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const storage = new Map();
// These rules, their dispatcher and encyclopedia data must not load Phaser or model rendering.
const load = createTypeScriptLoader({}, { window: { localStorage: {
  getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)
} } });
const { BOSS_SKILLS, ICOSAHEDRON_PHASE_SKILL_SP } = load("src/data/bossAbilities.ts");
const { initialBossSkillStates, createBossSkill, createConfiguredBossSkill, applyBossPhaseSkillState,
  bossSkillCharge, bossSkillRecoverySeconds, chargeBossSkill, isBossSkillReady, spendBossSkill,
  gainBossSkillSp, grantBossSkillSp } = load("src/game/bossSkillRules.ts");
const { runRegisteredBossSkills } = load("src/game/bossSkillRegistry.ts");

const legacyValues = {
  promotion: [90, 30, 0], advance: [120, 120, 0], charge: [60, 30, 0], impact: [120, 60, 0],
  suppression: [160, 40, 0], desperation: [10, 10, 0], endlessWings: [4, 4, 0],
  ultimateAdvance: [40, 40, 30], heartbeatAlpha: [60, 60, 30], heartbeatBeta: [60, 60, 0],
  leap: [50, 50, 35], deleteStack: [40, 40, 40], deleteFormat: [75, 75, 0]
};
const cube = ["promotion", "advance"], tetra = ["charge", "impact", "suppression", "desperation"];
const icoOnly = ["ultimateAdvance", "heartbeatAlpha", "heartbeatBeta", "leap"];
const skillNames = {
  cube, cube2: cube, tetrahedron: [...cube, ...tetra], tetrahedron2: [...cube, ...tetra],
  dodecahedron: [...cube, "endlessWings"], dodecahedron2: [...cube, "endlessWings"],
  smallStellatedDodecahedron: cube, octahedron: cube, octahedron2: cube,
  icosahedron: [...cube, ...tetra, "endlessWings", ...icoOnly], del: ["deleteStack", "deleteFormat", ...cube]
};
const boss = (kind = "tetrahedron") => ({ kind, hp: 1000, maxHp: 1000, criticalHpTriggered: false, skills: initialBossSkillStates(kind) });
const oldState = name => ({ name, sp: legacyValues[name][2], spBuffer: 0, activeUntil: 0,
  maxSp: legacyValues[name][0], cost: legacyValues[name][1] });

test("Boss state factories preserve every kind's legacy values, unused skills, property order and independence", () => {
  assert.deepEqual(Object.keys(BOSS_SKILLS).sort(), Object.keys(legacyValues).sort());
  for (const [kind, names] of Object.entries(skillNames)) {
    const expected = Object.fromEntries(names.map(name => [name, oldState(name)]));
    const actual = initialBossSkillStates(kind);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), kind);
    const second = initialBossSkillStates(kind);
    for (const name of names) { actual[name].sp = -1; assert.notEqual(second[name].sp, -1); }
  }
  assert.equal(createBossSkill("advance", 120, 120, -20).sp, 0);
  assert.equal(createBossSkill("advance", 120, 120, 200).sp, 120);
});

test("phase entry resets only its configured skills, keeping runtime maxima and unrelated state", () => {
  for (const phase of [0, 1, 2, 3, 4]) {
    const unit = boss("icosahedron");
    for (const state of Object.values(unit.skills)) Object.assign(state, { sp: 9, spBuffer: .6, activeUntil: 3456 });
    const previous = structuredClone(unit.skills);
    applyBossPhaseSkillState(unit, phase);
    const expected = phase === 1 ? { charge: 0, impact: 75, suppression: 75, desperation: 0, leap: 35 }
      : phase === 2 ? { endlessWings: 0 } : {};
    assert.deepEqual(ICOSAHEDRON_PHASE_SKILL_SP[phase] ?? {}, expected);
    for (const [name, state] of Object.entries(unit.skills)) {
      assert.deepEqual(state, name in expected ? { ...previous[name], sp: expected[name], spBuffer: 0, activeUntil: 0 } : previous[name]);
    }
  }
  const other = boss(), previous = structuredClone(other); applyBossPhaseSkillState(other, 1); assert.deepEqual(other, previous);
  const sparse = { kind: "icosahedron", skills: { impact: { ...oldState("impact"), maxSp: 12 } } };
  applyBossPhaseSkillState(sparse, 1); assert.equal(sparse.skills.impact.sp, 12);
});

test("Boss encyclopedia charge fields use shared metadata and phase entry SP in both languages", () => {
  const { bossDetailSections } = load("src/bossEncyclopediaDetails.ts");
  const { skillChargeFields } = load("src/encyclopediaSections.ts");
  const { setLanguage } = load("src/i18n.ts");
  const previewSkills = { cube, tetrahedron: tetra, dodecahedron: ["endlessWings"],
    octahedron: [], del: ["deleteFormat", "deleteStack"], smallStellatedDodecahedron: [] };
  const phases = [["ultimateAdvance", "heartbeatAlpha", "heartbeatBeta"], [...tetra, "leap"], ["endlessWings"], []];
  for (const language of ["zh-CN", "en"]) {
    setLanguage(language);
    for (const icon of [...Object.keys(previewSkills), "icosahedron"]) {
      for (const level of icon === "icosahedron" ? [1, 2, 3, 4] : [1, 2, 20, 999]) {
        const expected = icon === "icosahedron" ? phases[level - 1] : previewSkills[icon];
        const sections = bossDetailSections(icon, level).filter(section => section.tone === "skill");
        assert.equal(sections.length, expected.length, `${icon} ${level}`);
        for (const [index, name] of expected.entries()) {
          const section = sections[index], data = BOSS_SKILLS[name];
          assert.equal(section.title, data.name[language === "en" ? "en" : "zh"]);
          const charge = bossSkillCharge(name, icon, icon === "icosahedron" ? level - 1 : 0);
          assert.deepEqual(section.fields.slice(0, 5), skillChargeFields(charge));
          const unit = boss(icon); applyBossPhaseSkillState(unit, level - 1);
          assert.equal(unit.skills[name].sp, charge.initial);
        }
      }
    }
  }
});

test("half-HP recovery boundaries and critical doubling retain their distinct inclusive rules", () => {
  const unit = boss();
  for (const hp of [501, 500, 499, 0]) for (const critical of [false, true]) {
    unit.hp = hp; unit.criticalHpTriggered = critical;
    for (const name of Object.keys(BOSS_SKILLS)) {
      const skill = createConfiguredBossSkill(name);
      const eligible = name === "desperation" ? hp <= 500 : name === "deleteFormat" ? hp < 500 : true;
      const multiplier = critical && tetra.includes(name) ? 2 : 1;
      assert.equal(bossSkillRecoverySeconds(unit, skill, .016), eligible ? .016 * multiplier : 0, `${name} ${hp} ${critical}`);
    }
  }
});

test("skill SP matches pre-refactor arithmetic tick for tick, including grants and serialized continuation", () => {
  for (const name of Object.keys(BOSS_SKILLS)) {
    const actual = createConfiguredBossSkill(name), expected = oldState(name), unit = boss();
    for (let tick = 0; tick < 12000; tick++) {
      const seconds = [1 / 60, .007, .11, 0][tick % 4];
      unit.hp = tick < 4000 ? 501 : tick < 8000 ? 500 : 499; unit.criticalHpTriggered = tick >= 6000;
      chargeBossSkill(actual, bossSkillRecoverySeconds(unit, actual, seconds));
      const eligible = name === "desperation" ? unit.hp <= 500 : name === "deleteFormat" ? unit.hp < 500 : true;
      expected.spBuffer += eligible ? seconds * (unit.criticalHpTriggered && tetra.includes(name) ? 2 : 1) : 0;
      while (expected.spBuffer >= 1 && expected.sp < expected.maxSp) { expected.sp++; expected.spBuffer--; }
      if (expected.sp >= expected.maxSp) { expected.sp = expected.maxSp; expected.spBuffer = 0; }
      if (tick % 191 === 0) {
        gainBossSkillSp(actual, 5); expected.sp = Math.min(expected.maxSp, expected.sp + 5);
      }
      assert.equal(isBossSkillReady(actual), expected.sp >= expected.maxSp);
      if (isBossSkillReady(actual) && tick % 3 === 0) {
        spendBossSkill(actual); expected.sp = Math.max(0, expected.sp - expected.cost); expected.spBuffer = 0;
      }
      if (tick === 4321) Object.assign(actual, JSON.parse(JSON.stringify(actual)));
      assert.deepEqual(actual, expected, `${name} tick ${tick}`);
    }
  }
});

test("cross-skill grants cap SP but preserve fractional buffer and do not charge unrelated skills", () => {
  const grants = { charge: ["suppression", 15], impact: ["charge", 10], suppression: ["impact", 20], desperation: ["charge", 5] };
  for (const [source, [target, amount]] of Object.entries(grants)) {
    const unit = boss(); const state = unit.skills[target]; state.spBuffer = .8;
    grantBossSkillSp(unit, source); assert.equal(state.sp, amount); assert.equal(state.spBuffer, .8);
    state.sp = state.maxSp - 1; grantBossSkillSp(unit, source);
    assert.equal(state.sp, state.maxSp); assert.equal(state.spBuffer, .8);
  }
  const missing = boss("cube"), previous = structuredClone(missing);
  grantBossSkillSp(missing, "charge"); grantBossSkillSp(missing, "advance"); assert.deepEqual(missing, previous);
});

test("dispatcher charges everyone, snapshots readiness and pays every cost before any skill effect", () => {
  const unit = boss(); const events = [];
  unit.skills.charge.sp = 59; unit.skills.impact.sp = 119;
  const definitions = ["charge", "impact"].map(skillKey => ({ skillKey,
    canUse: () => { assert.equal(unit.skills.charge.sp, 60); assert.equal(unit.skills.impact.sp, 120); return true; },
    use: (_runtime, owner, state) => {
      if (!events.length) { assert.equal(owner.skills.charge.sp, 30); assert.equal(owner.skills.impact.sp, 60); }
      events.push(state.name); grantBossSkillSp(owner, state.name);
    }
  }));
  runRegisteredBossSkills({}, unit, definitions, 1);
  assert.deepEqual(events, ["charge", "impact"]);
  assert.equal(unit.skills.charge.sp, 40); assert.equal(unit.skills.suppression.sp, 15);
});

test("SP grants never add a new same-tick cast; no-target skills hold SP and absent states are ignored", () => {
  const unit = boss(), events = [];
  unit.skills.charge.sp = 60; unit.skills.suppression.sp = 145;
  const definitions = ["charge", "suppression"].map(skillKey => ({ skillKey,
    use: (_runtime, owner, state) => { events.push(state.name); grantBossSkillSp(owner, state.name); }
  }));
  runRegisteredBossSkills({}, unit, definitions, 0);
  assert.deepEqual(events, ["charge"]); assert.equal(unit.skills.suppression.sp, 160);
  runRegisteredBossSkills({}, unit, definitions, 0);
  assert.deepEqual(events, ["charge", "suppression"]);
  const cubeBoss = boss("cube"); cubeBoss.skills.promotion.sp = 90;
  runRegisteredBossSkills({}, cubeBoss, [{ skillKey: "promotion", canUse: () => false, use: () => assert.fail("No target") },
    { skillKey: "charge", use: () => assert.fail("Absent skill") }], .5);
  assert.equal(cubeBoss.skills.promotion.sp, 90);
});

test("dispatcher honors conditional recovery without universally pausing at activeUntil", () => {
  const unit = boss("del"); unit.hp = 500;
  const format = unit.skills.deleteFormat; format.sp = 74; format.activeUntil = 5000;
  let time = 2000, casts = 0;
  const definitions = [{ skillKey: "deleteFormat", chargeSeconds: (_runtime, owner, skill, seconds) => bossSkillRecoverySeconds(owner, skill, seconds),
    canUse: () => time >= format.activeUntil, use: () => casts++ }];
  runRegisteredBossSkills({}, unit, definitions, 1); assert.equal(format.sp, 74);
  unit.hp = 499; runRegisteredBossSkills({}, unit, definitions, 1);
  assert.equal(format.sp, 75); assert.equal(casts, 0);
  time = 5000; runRegisteredBossSkills({}, unit, definitions, 0);
  assert.equal(casts, 1); assert.equal(format.sp, 0);
});

test("dispatch has the same tick-by-tick state as the original three-pass implementation", () => {
  const legacyRun = (runtime, owner, definitions, seconds) => {
    const ready = [];
    for (const definition of definitions) {
      const state = owner.skills[definition.skillKey]; if (!state) continue;
      const elapsed = definition.chargeSeconds?.(runtime, owner, state, seconds) ?? seconds;
      if (elapsed > 0) {
        state.spBuffer += elapsed;
        while (state.spBuffer >= 1 && state.sp < state.maxSp) { state.sp++; state.spBuffer--; }
        if (state.sp >= state.maxSp) { state.sp = state.maxSp; state.spBuffer = 0; }
      }
    }
    for (const definition of definitions) {
      const state = owner.skills[definition.skillKey];
      if (state && state.sp >= state.maxSp && definition.canUse?.(runtime, owner, state) !== false) ready.push({ definition, state });
    }
    for (const { state } of ready) { state.sp = Math.max(0, state.sp - state.cost); state.spBuffer = 0; }
    for (const { definition, state } of ready) definition.use(runtime, owner, state);
  };
  const definitions = tetra.map(skillKey => ({ skillKey,
    chargeSeconds: (_runtime, owner, state, seconds) => state.name === "desperation" && owner.hp > owner.maxHp / 2 ? 0
      : seconds * (owner.criticalHpTriggered ? 2 : 1),
    canUse: runtime => runtime.tick % 13 !== 0,
    use: (runtime, owner, state) => { runtime.events.push(state.name); grantBossSkillSp(owner, state.name); }
  }));
  const actual = boss(), expected = structuredClone(actual);
  const a = { tick: 0, events: [] }, b = { tick: 0, events: [] };
  for (let tick = 0; tick < 15000; tick++) {
    a.tick = b.tick = tick; actual.hp = expected.hp = tick < 2000 ? 501 : 500;
    actual.criticalHpTriggered = expected.criticalHpTriggered = tick >= 7000;
    runRegisteredBossSkills(a, actual, definitions, 1 / 60); legacyRun(b, expected, definitions, 1 / 60);
    assert.deepEqual(actual, expected); assert.deepEqual(a.events, b.events);
  }
});
