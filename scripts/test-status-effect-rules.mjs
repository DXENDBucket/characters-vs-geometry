import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const rules = load("src/game/rules/statusEffectRules.ts");
const unit = () => ({ statusEffects: [], maxHp: 1000 });
const multipliers = () => ({ speed: 1, attack: 1, armor: 1 });

test("pure status expiry compacts in place at the exact deadline and retains surviving identities", () => {
  const target = unit(), list = target.statusEffects;
  rules.refreshStatusEffect(target, "haste", 100);
  rules.refreshStatusEffect(target, "power", Infinity);
  rules.refreshStatusEffect(target, "stasis", 99);
  const power = list[1];
  assert.equal(rules.expireStatusEffects(target, 98), false);
  assert.equal(rules.expireStatusEffects(target, 99), true);
  assert.equal(rules.expireStatusEffects(target, 100), true);
  assert.equal(target.statusEffects, list); assert.equal(list[0], power);
  assert.equal(rules.expireStatusEffects(target, 101), false);
  assert.equal(rules.removeStatusEffectState(target, "power"), true);
  assert.equal(rules.removeStatusEffectState(target, "power"), false);
  assert.equal(list.length, 0);
});

test("pure status calculations reuse their output without implicitly advancing expiry", () => {
  const target = unit(), out = { ...multipliers(), visualSyncedAt: 1234 };
  rules.refreshStatusEffect(target, "haste", 0, 2);
  rules.refreshStatusEffect(target, "flying", 500, 2.5);
  rules.refreshStatusEffect(target, "stasis", 500);
  rules.refreshStatusEffect(target, "sunder", 500);
  assert.equal(rules.calculateStatusMultipliers(target, out), out);
  assert.deepEqual(out, { speed: 3.5, attack: 1, armor: .5, visualSyncedAt: 1234 });
  assert.equal(rules.hasStatusEffectName(target, "haste"), true);
  rules.expireStatusEffects(target, 500);
  rules.calculateStatusMultipliers(target, out);
  assert.deepEqual(out, { ...multipliers(), visualSyncedAt: 1234 });
});

test("Power selects the strongest surviving value while other multipliers retain stacking order", () => {
  const target = unit();
  rules.refreshStatusEffect(target, "power", Infinity);
  rules.refreshStatusEffect(target, "power", 100, { attackMultiplier: 1.8 });
  rules.refreshStatusEffect(target, "power", 200, { attackMultiplier: 1.5 });
  rules.refreshStatusEffect(target, "haste", 300, { speedMultiplier: 2, attackMultiplier: 1.2 });
  rules.setMovementHasteEffect(target, 1.5);
  const out = multipliers();
  rules.calculateStatusMultipliers(target, out); assert.equal(out.attack, 1.2 * 1.8); assert.equal(out.speed, 3);
  rules.expireStatusEffects(target, 100);
  rules.calculateStatusMultipliers(target, out); assert.equal(out.attack, 1.2 * 1.5);
  rules.expireStatusEffects(target, 200);
  rules.calculateStatusMultipliers(target, out); assert.equal(out.attack, 1.2 * 1.3);
});

test("freeze breaks on cumulative physical damage at half maximum HP and refresh resets accumulation", () => {
  const target = unit(), list = target.statusEffects;
  rules.refreshStatusEffect(target, "frozen", 1000);
  assert.equal(rules.calculateStatusMultipliers(target, multipliers()).speed, 0);
  assert.equal(rules.addFrozenPhysicalDamageState(target, 300), false);
  assert.equal(rules.addFrozenPhysicalDamageState(target, 199), false);
  rules.refreshStatusEffect(target, "frozen", 2000);
  assert.equal(rules.statusEffectByName(target, "frozen").physicalDamageTaken, 0);
  assert.equal(rules.addFrozenPhysicalDamageState(target, 499), false);
  assert.equal(rules.addFrozenPhysicalDamageState(target, 1), true);
  assert.equal(target.statusEffects, list); assert.equal(list.length, 0);
  assert.equal(rules.addFrozenPhysicalDamageState(target, 1000), false);
});

test("sunder refresh replaces its duration while general refresh keeps the longest deadline", () => {
  const target = unit();
  rules.refreshStatusEffect(target, "sunder", 1000);
  rules.refreshStatusEffect(target, "sunder", 500);
  assert.equal(rules.statusEffectByName(target, "sunder").expiresAt, 500);
  rules.refreshStatusEffect(target, "flying", 1000, 2, true);
  rules.refreshStatusEffect(target, "flying", 500, 1, false);
  const flying = rules.statusEffectByName(target, "flying");
  assert.equal(flying.expiresAt, 1000); assert.equal(flying.speedMultiplier, 2); assert.equal(flying.showHalo, true);
});

test("status removal removes all matching strengths without reallocating or disturbing other effects", () => {
  const target = unit(), list = target.statusEffects;
  rules.refreshStatusEffect(target, "power", Infinity);
  rules.refreshStatusEffect(target, "haste", 1000);
  rules.refreshStatusEffect(target, "power", 1000, { attackMultiplier: 2 });
  const haste = list[1];
  assert.equal(rules.removeStatusEffectState(target, "power"), true);
  assert.equal(target.statusEffects, list); assert.deepEqual(list, [haste]); assert.equal(list[0], haste);
});
