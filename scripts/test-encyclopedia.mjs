import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const storage = new Map();
const load = createTypeScriptLoader({ phaser: { default: {} }, "src/render/unitShapes.ts": {} }, {
  window: { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } }
});
const { cardDefinitions } = load("src/data/cards.ts");
const { towerDetailSections, towerPreviewStats, towerDetailRange } = load("src/encyclopediaDetails.ts");
const { towerEncyclopediaEntry } = load("src/encyclopedia.ts");
const { setLanguage } = load("src/i18n.ts");
const card = id => cardDefinitions.find(card => card.id === id);
const sections = (id, level = 1) => towerDetailSections(card(id), level, towerEncyclopediaEntry(id).description);
const values = section => section.fields.map(field => field.value).join("\n");

test("detail ordering is stable and non-mutating: regular attack, talents/auras, then skills", () => {
  const { sortDetailSections } = load("src/encyclopediaSections.ts");
  const input = Object.freeze(["skill", "aura", "attack", "passive", "skill", "aura"].map((tone, i) =>
    Object.freeze({ title: String(i), tag: "", tone, fields: [] })));
  assert.deepEqual(sortDetailSections(input), [input[2], input[1], input[3], input[5], input[0], input[4]]);
  assert.deepEqual(input.map(section => section.title), ["0", "1", "2", "3", "4", "5"]);
  assert.deepEqual(sortDetailSections([]), []);
});

test("tower, enemy and Boss details consistently put all talents and auras before skills", () => {
  const { enemyEncyclopediaEntries } = load("src/encyclopedia.ts");
  const { enemyDetailSections } = load("src/enemyEncyclopediaDetails.ts");
  const { bossDetailSections, bossPreviewLimit } = load("src/bossEncyclopediaDetails.ts");
  const { enemyKindAtRank, enemyFamily } = load("src/registry/enemies.ts");
  const order = { attack: 0, passive: 1, aura: 1, skill: 2 };
  const check = (detail, id) => {
    const priorities = detail.map(section => order[section.tone]);
    assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b), id);
  };
  for (const language of ["zh-CN", "en"]) {
    setLanguage(language);
    for (const definition of cardDefinitions) for (const level of [1, 30]) check(sections(definition.id, level), definition.id);
    for (const entry of enemyEncyclopediaEntries()) {
      if (entry.enemyKind) {
        for (const rank of [1, 3, 99]) {
          const kind = enemyKindAtRank(enemyFamily(entry.enemyKind), rank);
          check(enemyDetailSections(kind, entry.description), kind);
        }
      } else if (entry.icon) {
        for (let level = 1; level <= Math.min(4, bossPreviewLimit(entry.icon)); level++) {
          check(bossDetailSections(entry.icon, level), `${entry.icon}:${level}`);
        }
      }
    }
  }
});

test("enemy catalog sorts every chapter group into minions, leaders and bosses without losing entries", () => {
  const { enemyEncyclopediaEntries } = load("src/encyclopedia.ts");
  const { enemyEncyclopediaGroup, enemyEncyclopediaRole, enemyEncyclopediaSections } = load("src/enemyEncyclopediaCatalog.ts");
  const { enemyIsLeader } = load("src/registry/enemies.ts");
  const { chapterGroups } = load("src/data/chapterGroups.ts");
  let previousIds;
  for (const language of ["en", "zh-CN"]) {
    setLanguage(language);
    const entries = enemyEncyclopediaEntries();
    const ids = entries.map(entry => entry.enemyKind ?? entry.icon);
    assert.equal(new Set(ids).size, ids.length);
    if (previousIds) assert.deepEqual(ids, previousIds, "translation must not change ordering");
    previousIds = ids;
    assert.deepEqual(entries.map(enemyEncyclopediaGroup),
      chapterGroups.flatMap(group => entries.filter(entry => enemyEncyclopediaGroup(entry) === group.id).map(() => group.id)));
    for (const group of chapterGroups) {
      const category = entries.filter(entry => enemyEncyclopediaGroup(entry) === group.id);
      const sections = enemyEncyclopediaSections(category);
      assert.deepEqual(sections.flatMap(section => section.entries), category);
      assert.deepEqual(sections.map(section => section.role), category.length ? ["minion", "leader", "boss"] : []);
      for (const entry of category) {
        assert.equal(enemyEncyclopediaRole(entry), entry.enemyKind ? (enemyIsLeader(entry.enemyKind) ? "leader" : "minion") : "boss");
      }
    }
  }
});

test("catalog sorting is stable, non-mutating and handles generated ranks without separate classification", () => {
  const { sortEnemyEncyclopediaEntries, enemyEncyclopediaSections, enemyEncyclopediaRole } = load("src/enemyEncyclopediaCatalog.ts");
  const boss = { icon: "del", chapterGroupId: "ascii" };
  const leader = { enemyKind: "chevronLeader99", chapterGroupId: "ascii" };
  const first = { enemyKind: "dollar", chapterGroupId: "ascii" };
  const second = { enemyKind: "tilde99", chapterGroupId: "ascii" };
  const main = { enemyKind: "circle" };
  const input = Object.freeze([boss, leader, first, second, main]);
  assert.deepEqual(sortEnemyEncyclopediaEntries(input), [main, first, second, leader, boss]);
  assert.deepEqual(input, [boss, leader, first, second, main]);
  assert.equal(enemyEncyclopediaRole(leader), "leader");
  assert.deepEqual(enemyEncyclopediaSections([]), []);
  assert.deepEqual(enemyEncyclopediaSections([boss]).map(section => section.role), ["boss"]);
  assert.deepEqual(enemyEncyclopediaSections([first, second]).map(section => section.role), ["minion"]);
});

test("every combat effect has a mechanism entry and relevant units link to newly documented mechanics", () => {
  const { mechanicEncyclopediaEntries, mechanicLinksForEntry, enemyEncyclopediaEntries } = load("src/encyclopedia.ts");
  const { statusEffectDefinitions } = load("src/data/statusEffects.ts");
  for (const language of ["zh-CN", "en"]) {
    setLanguage(language);
    const entries = mechanicEncyclopediaEntries(), ids = new Set(entries.map(entry => entry.mechanicId));
    assert.equal(ids.size, entries.length);
    for (const effect of Object.keys(statusEffectDefinitions)) {
      assert.ok(ids.has({ frozen: "freeze", reversed: "reversal" }[effect] ?? effect), effect);
    }
    assert.doesNotMatch(JSON.stringify(entries), /undefined|NaN/);
    for (const [kind, id] of [["heart", "haste"], ["chargingHexagon", "haste"], ["hexagon", "armorBoost"],
      ["hexSpellBulwark", "magicResistanceBoost"], ["equals", "healthLink"]]) {
      assert.ok(mechanicLinksForEntry(enemyEncyclopediaEntries().find(entry => entry.enemyKind === kind)).includes(id), kind);
    }
    for (const [card, id] of [["u", "healthLink"], ["T", "slowField"], ["&", "topology"], ["0", "pipeline"], ["!", "continuousFire"]]) {
      assert.ok(mechanicLinksForEntry(towerEncyclopediaEntry(card)).includes(id), card);
    }
    assert.ok(mechanicLinksForEntry(enemyEncyclopediaEntries().find(entry => entry.icon === "tetrahedron")).includes("power"));
  }
});

test("imitator aliases preserve panels, double independent cooldowns and never enter the catalog", () => {
  const { allCardDefinitions, canImitateCard, getCardDefinition, hasCardDefinition } = load("src/registry/cards.ts");
  const { isLoadoutCardId } = load("src/game/cardEligibility.ts");
  const { deploymentCardId, uniqueLoadout, towerPriceTier } = load("src/game/cardIdentity.ts");
  const { canUpgradeTowerWithCard } = load("src/game/towerIdentity.ts");
  const count = allCardDefinitions.length;
  for (const target of allCardDefinitions.filter(canImitateCard)) {
    const id = `?${target.id}`, variant = getCardDefinition(id);
    assert.ok(isLoadoutCardId(id), id);
    assert.equal(deploymentCardId(id), target.id);
    assert.equal(canUpgradeTowerWithCard({ type: target.id }, id), true);
    assert.deepEqual({ ...variant, id: target.id, cooldown: variant.cooldown / 2 }, target);
  }
  for (const id of ["?@", "?&", "?U", "??A", "?unknown"]) {
    assert.equal(hasCardDefinition(id), false, id);
    assert.equal(isLoadoutCardId(id), false, id);
  }
  assert.equal(isLoadoutCardId("?"), false);
  assert.equal(allCardDefinitions.length, count);
  assert.deepEqual(Array.from(uniqueLoadout(["A", "?A", "?B", "A", "?", "B"], 10)), ["A", "?A", "B"]);
  assert.deepEqual([999, 1000, 9999, 10000].map(towerPriceTier), ["regular", "super", "super", "ultimate"]);
  for (const language of ["zh-CN", "en"]) {
    setLanguage(language);
    assert.doesNotMatch(JSON.stringify(sections("?")), /undefined|NaN/);
    assert.equal(sections("?")[1].tone, "passive");
  }
});

test("enemy rank previews read actual combat stats, SP growth, volley hits and ranges", () => {
  const { enemyDetailSections, enemyPreviewAttackSpeed } = load("src/enemyEncyclopediaDetails.ts");
  const { enemyEncyclopediaEntries } = load("src/encyclopedia.ts");
  const { enemyKindAtRank, enemyFamily } = load("src/registry/enemies.ts");
  const { rangeContains } = load("src/rangeGeometry.ts");
  for (const language of ["en", "zh-CN"]) {
    setLanguage(language);
    for (const entry of enemyEncyclopediaEntries().filter(entry => entry.enemyKind)) {
      for (const rank of [1, 2, 6, 999]) {
        const detail = enemyDetailSections(enemyKindAtRank(enemyFamily(entry.enemyKind), rank), entry.description);
        assert.equal(detail[0].tone, "attack");
        assert.doesNotMatch(JSON.stringify(detail), /undefined|NaN|Infinity/);
        for (const range of detail.flatMap(section => section.ranges ?? [])) assert.ok(range.diagram.cells.length);
      }
    }
  }
  const detail = kind => enemyDetailSections(kind, "");
  const minus = detail("minus6");
  assert.match(values(minus[0]), /200.*25% ATK/);
  assert.match(values(minus[0]), /2\/1\/1\/1\/1/);
  assert.equal(minus[0].ranges[0].shape.kind, "global");
  assert.equal(minus.some(section => section.tone === "skill"), false);
  assert.equal(enemyPreviewAttackSpeed("minus3"), 60);
  assert.match(values(detail("shootingTriangle6")[0]), /2\/1\/1\/1\/1/);
  assert.equal(enemyPreviewAttackSpeed("triangleRam"), undefined);
  assert.equal(enemyPreviewAttackSpeed("slopeTriangle3"), undefined);
  assert.equal(enemyPreviewAttackSpeed("triangle3"), 180);
  assert.match(values(detail("angelPentagon3").find(section => section.tone === "skill")), /1.4\/秒/);
  assert.match(values(detail("archangelHeptagon3").find(section => section.tone === "skill")), /6s/);
  assert.match(values(detail("hexSpellBulwark3").find(section => section.tone === "aura")), /\+60/);
  const laser = detail("shootingPentagon")[0].ranges[0];
  assert.ok(rangeContains(laser.shape, -1000, 0));
  assert.ok(!rangeContains(laser.shape, 1, 0));
  assert.equal(laser.diagram.extensions[0], "left");
  assert.equal(detail("mortarTriangle")[0].ranges[1].origin, "impact");
});

test("boss previews distinguish dynamic ranks and the four final-boss phases", () => {
  setLanguage("zh-CN");
  const { bossDetailSections, bossPreviewStats, bossPreviewLimit } = load("src/bossEncyclopediaDetails.ts");
  const { getLevelConfig } = load("src/data/levels.ts");
  assert.equal(bossPreviewLimit("icosahedron"), 4);
  assert.equal(bossPreviewLimit("smallStellatedDodecahedron"), 1);
  assert.equal(bossPreviewStats("cube", 3).hp, 250000);
  assert.equal(bossPreviewStats("cube", 3).armor, 900);
  for (const icon of ["cube", "tetrahedron", "dodecahedron", "octahedron", "smallStellatedDodecahedron", "icosahedron"]) {
    for (const rank of [1, Math.min(bossPreviewLimit(icon), 6)]) {
      assert.doesNotMatch(JSON.stringify(bossDetailSections(icon, rank)), /undefined|NaN|Infinity/);
    }
  }
  for (const [index, phase] of getLevelConfig("5-10").bossPhases.entries()) {
    const stats = bossPreviewStats("icosahedron", index + 1);
    assert.equal(stats.hp, phase.maxHp);
    assert.equal(stats.armor, phase.armor);
    assert.equal(stats.magicResistance, phase.magicResistance);
    assert.equal(stats.reduction, phase.finalDamageReduction ?? 0);
  }
  const p2 = bossDetailSections("icosahedron", 2);
  assert.equal(p2.find(section => section.title === "冲击").fields[0].value, "75");
  assert.equal(p2.find(section => section.title === "飞跃").fields[0].value, "35");
  assert.ok(!p2.some(section => section.title === "心跳 α"));
  const p3 = bossDetailSections("icosahedron", 3);
  assert.ok(p3.some(section => section.title === "无尽羽翼"));
  assert.match(p3.find(section => section.title === "眷属与庇护").description, /7 个 1 级/);
});

test("every tower has structured, localized regular-action details at base and high levels", () => {
  for (const language of ["zh-CN", "en"]) {
    setLanguage(language);
    for (const definition of cardDefinitions) for (const level of [1, 6, 30, 999]) {
      const detail = sections(definition.id, level);
      assert.equal(detail[0].tone, "attack", definition.id);
      assert.ok(detail[0].fields.length);
      for (const section of detail) {
        assert.ok(section.title);
        assert.ok(!/undefined|NaN|Infinity/.test(JSON.stringify(section)), definition.id);
      }
      assert.ok(Number.isFinite(towerPreviewStats(definition, level).attackPower));
    }
  }
});

test("attack previews retain actual multipliers, simultaneous shots, volley hit counts and upgrade rules", () => {
  setLanguage("zh-CN");
  assert.equal(towerPreviewStats(card("V"), 2).attackPower, 680);
  assert.match(values(sections("V", 2)[0]), /3060.*450% ATK/);
  assert.match(values(sections("E", 6)[0]), /5 连发 × 3 发／次 · 各发判定 2\/1\/1\/1\/1/);
  assert.match(values(sections("x")[0]), /4 发／次/);
  assert.match(values(sections("x")[0]), /130/);
  assert.match(values(sections("r")[1]), /1000.*250% ATK/);
  assert.match(values(sections("r", 3)[1]), /15s/);
  assert.match(values(sections("X", 2)[0]), /45 字符/);
  assert.equal(towerPreviewStats(card("B"), 2).maxHp, 5400);
  assert.match(values(sections("B").find(section => section.title === "近战反伤")), /400/);
  assert.match(values(sections("w")[0]), /无主动常规攻击/);
});

test("SP skills distinguish initial charge, cost, duration, regeneration and healing source", () => {
  setLanguage("zh-CN");
  const w = sections("w").find(section => section.tone === "skill");
  assert.equal(w.fields.find(field => field.label === "初始技力").value, "8");
  assert.equal(w.fields.find(field => field.label === "消耗 / 上限").value, "10 / 10");
  assert.equal(w.fields.find(field => field.label === "持续时间").value, "10s");
  assert.equal(w.fields.find(field => field.label === "期间回复").value, "暂停");
  const push = sections("#", 3).find(section => section.tone === "skill");
  assert.match(values(push), /2\/秒/);
  assert.match(values(push), /30 \/ 30/);
  const heal = sections("h", 2).find(section => section.tone === "skill");
  const { GUARDIAN_TOWER_HEAL_RATIO } = load("src/config.ts");
  assert.match(values(heal), new RegExp(`${Math.round(5400 * GUARDIAN_TOWER_HEAL_RATIO)} HP`));
  assert.match(values(heal), /小 h 生命上限/);
});

test("auras and range diagrams use distinct centered areas and stacking rules", () => {
  setLanguage("zh-CN");
  assert.equal(towerDetailRange(card("e")).diagram.cells.length, 21);
  assert.equal(towerDetailRange(card("g")).diagram.cells.length, 9);
  assert.equal(towerDetailRange(card("U")).diagram.cells.length, 8);
  assert.equal(towerDetailRange(card("P")).diagram.cells.length, 24);
  const e = sections("e").find(section => section.tone === "aura");
  assert.match(values(e), /攻击速度 \+35%/);
  assert.match(values(e), /不叠加/);
  assert.match(values(sections("g", 3).find(section => section.tone === "aura")), /45%/);
});

test("range geometry is generated from reusable shapes and live attack/trigger configuration", () => {
  const { towerRanges } = load("src/data/towerRanges.ts");
  const { rangeContains, rangeDiagram } = load("src/rangeGeometry.ts");
  const { CELL_WIDTH, CELL_HEIGHT, SPELL_MORTAR_AOE_RANGE_X } = load("src/config.ts");
  const { cardAttackAreas } = load("src/game/cardAttackConfigs.ts");
  assert.equal(towerRanges(card("a")).attack.shape.right, cardAttackAreas.a.rangeCells - 1);
  assert.equal(rangeContains(towerRanges(card("a")).attack.shape, 5, 0), false);
  assert.equal(rangeContains(towerRanges(card("e")).aura.shape, 2, 2), false);
  assert.equal(rangeContains(towerRanges(card("e")).aura.shape, 2, 1), true);
  assert.equal(rangeContains(towerRanges(card("U")).aura.shape, 0, 0), false);
  assert.equal(towerRanges(card("i")).skill.shape.radius, card("i").triggerRangeX / CELL_WIDTH);
  assert.equal(towerRanges(card("F")).skill.shape.halfHeight, card("F").triggerRangeY / CELL_HEIGHT);
  assert.equal(towerRanges(card("S")).impact.shape.halfWidth, SPELL_MORTAR_AOE_RANGE_X / CELL_WIDTH);
  assert.equal(towerRanges({ ...card("i"), triggerRangeX: CELL_WIDTH * 3 }).skill.shape.radius, 3);
  assert.deepEqual([...rangeDiagram(towerRanges(card("l")).skill.shape).extensions], ["up", "down"]);
  const entireRow = { kind: "row", halfHeight: .5 };
  assert.deepEqual([...rangeDiagram(entireRow).extensions], ["left", "right"]);
  assert.equal(rangeContains(entireRow, 1000, 0), true);
  assert.equal(rangeContains(entireRow, 0, 1), false);
  assert.deepEqual([...rangeDiagram(towerRanges(card("A")).attack.shape).extensions], ["right"]);
  assert.equal(rangeDiagram(towerRanges(card("x")).attack.shape).extensions.length, 4);
  assert.equal(rangeContains(towerRanges(card("M")).attack.shape, 0, 4), true);
  assert.equal(rangeContains(towerRanges(card("M")).attack.shape, 0, -4), false);
  assert.equal(rangeContains(towerRanges(card("W")).attack.shape, 0, -4), true);
  assert.equal(towerRanges(card("c")).skill.shape.kind, "nonSpatial");
  const shape = { kind: "grid", left: -2, right: 2, top: -2, bottom: 2, cutCorners: true };
  assert.equal(rangeDiagram(shape).cells.length, 21);
});

test("attack, skill, aura and impact diagrams retain distinct scopes without stale free-card text", () => {
  setLanguage("zh-CN");
  assert.equal(card("a").cost, 15);
  assert.doesNotMatch(towerEncyclopediaEntry("a").description, /免费/);
  const t = sections("T");
  assert.equal(t[0].ranges[0].diagram.cells.length, 1);
  assert.equal(t.find(section => section.tone === "aura").ranges[0].diagram.cells.length, 21);
  for (const id of ["w", "o", "j", "c", "h", "S", "#", "F", "f", "i", "l", "r", "G"]) {
    assert.ok(sections(id).find(section => section.tone === "skill").ranges.length, id);
  }
  for (const id of ["e", "g", "T", "U"]) {
    assert.ok(sections(id).find(section => section.tone === "aura").ranges.length, id);
  }
  const s = sections("S").find(section => section.tone === "skill");
  assert.equal(s.ranges[0].shape.kind, "global");
  assert.equal(s.ranges[1].origin, "impact");
  assert.equal(sections("J")[0].ranges[0].shape.kind, "grid");
  assert.equal(sections("J")[0].ranges[1].shape.kind, "circle");
  assert.match(towerDetailRange(card("U")).labelText, /不含自身/);
  setLanguage("en");
  assert.doesNotMatch(towerEncyclopediaEntry("a").description, /free/i);
});

test("E uses the shared forward fan, mirrors with facing, and retains three projectile angles", () => {
  const targetingLoad = createTypeScriptLoader({
    phaser: { default: {} }, "src/render/unitShapes.ts": {}
  });
  const { hasAttackTarget, canAttackBossPart } = targetingLoad("src/game/targeting.ts");
  const { cardAttackAreas, getProjectilePattern } = targetingLoad("src/game/cardAttackConfigs.ts");
  const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = targetingLoad("src/config.ts");
  const tower = { type: "E", lane: 3, column: 5, statusEffects: [], x: BOARD_X + 5.5 * CELL_WIDTH, y: BOARD_Y + 3.5 * CELL_HEIGHT };
  const target = (dx, dy, extra = {}) => ({ kind: "circle", statusEffects: [], inPlay: true, x: tower.x + dx, y: tower.y + dy,
    lane: tower.lane + Math.round(dy / CELL_HEIGHT), ...extra });
  const canFire = enemy => hasAttackTarget(tower, card("E"), [enemy], null);
  const distance = CELL_WIDTH * 5;
  const edge = cardAttackAreas.E.halfWidth + cardAttackAreas.E.spreadSlope * distance;
  assert.equal(canFire(target(distance, CELL_HEIGHT)), true, "Enemy in adjacent lane can trigger E");
  for (const sign of [-1, 1]) {
    assert.equal(canFire(target(distance, sign * (edge - .01))), true);
    assert.equal(canFire(target(distance, sign * (edge + .01))), false);
  }
  assert.equal(canFire(target(-distance, 0)), false);
  assert.equal(canFire(target(0, 0)), false);
  assert.equal(canFire(target(distance, 0, { burrowed: true })), false);
  assert.equal(canFire(target(distance, 0, { highFlightUntil: 9999 })), false);
  tower.facingDirection = -1;
  assert.equal(canFire(target(-distance, CELL_HEIGHT)), true);
  assert.equal(canFire(target(distance, 0)), false);
  assert.deepEqual(getProjectilePattern("E").shots.map(shot => shot.angleDegrees), [-10, 0, 10]);
  const boss = { x: tower.x - distance, y: tower.y + CELL_HEIGHT, hitboxWidth: 50, hitboxHeight: 50 };
  assert.equal(canAttackBossPart(tower, card("E"), boss), true);
  assert.equal(canAttackBossPart(tower, card("E"), { ...boss, x: tower.x + distance }), false);
  assert.equal(canAttackBossPart(tower, card("E"), { ...boss, y: tower.y + 300 }), false);
  const copied = { ...tower, type: "@", copiedType: "E" };
  assert.equal(hasAttackTarget(copied, card("E"), [target(-distance, CELL_HEIGHT)], null), true);
  for (const [id, sign] of [["W", -1], ["M", 1]]) {
    const verticalTower = { ...tower, type: id };
    assert.equal(hasAttackTarget(verticalTower, card(id), [target(20, sign * 200)], null), true);
    assert.equal(hasAttackTarget(verticalTower, card(id), [target(20, -sign * 200)], null), false);
    assert.equal(canAttackBossPart(verticalTower, card(id), { x: tower.x, y: tower.y + sign * 200, hitboxWidth: 50, hitboxHeight: 50 }), true);
  }
  assert.equal(towerDetailRange(card("E")).shape.direction, "right");
});
