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
  assert.equal(towerPreviewStats(card("V"), 2).attackPower, 3060);
  assert.match(values(sections("V", 2)[0]), /3060.*100% ATK/);
  assert.match(values(sections("E", 6)[0]), /5 连发 × 3 发／次 · 各发判定 2\/1\/1\/1\/1/);
  assert.match(values(sections("x")[0]), /4 发／次/);
  assert.match(values(sections("x")[0]), /130/);
  assert.match(values(sections("r")[1]), /1000.*500% ATK/);
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
  assert.equal(w.fields.find(field => field.label === "持续时间").value, "6s");
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
  assert.equal(towerDetailRange(card("e")).cells.length, 21);
  assert.equal(towerDetailRange(card("g")).cells.length, 9);
  assert.equal(towerDetailRange(card("U")).cells.length, 8);
  assert.equal(towerDetailRange(card("P")).cells.length, 24);
  const e = sections("e").find(section => section.tone === "aura");
  assert.match(values(e), /攻击速度 \+35%/);
  assert.match(values(e), /不叠加/);
  assert.match(values(sections("g", 3).find(section => section.tone === "aura")), /45%/);
});
