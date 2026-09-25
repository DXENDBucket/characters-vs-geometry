import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { BattleLoadout, battleCardTime } = load("src/game/battleLoadout.ts");
const { BattleWorld } = load("src/game/battleWorld.ts");
const { BattleRandom } = load("src/game/battleSimulation.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { getLevelConfig } = load("src/data/levels.ts");
const { getDifficultyConfig } = load("src/config.ts");
// c currently costs over 999 and is not selectable by ?. Inject this definition only
// to cover clock-domain changes in the reusable loadout, not to change card eligibility.
const definition = id => id === "?c" ? { ...getCardDefinition("c"), id, cost: 999 } : getCardDefinition(id);
const defs = (...ids) => ids.map(definition);
const clocks = (battleTime, cardTime = battleTime) => ({ battleTime, cardTime });

test("battle worlds own independent pure card states with authoritative slot order", () => {
  const definitions = defs("A", "?A", "c", "=");
  const create = () => new BattleWorld({ levelId: "IF-1", level: getLevelConfig("IF-1"),
    difficulty: getDifficultyConfig(3), unlimitedFirepower: false }, new BattleRandom(15), definitions);
  const a = create(), b = create(); definitions.reverse();
  assert.deepEqual(a.loadout.ids, ["A", "?A", "c", "="]);
  assert.equal(a.loadout.byId.get("A"), a.loadout.cards[0]);
  a.loadout.cards[0].readyAt = 1234;
  assert.equal(b.loadout.cards[0].readyAt, 0);
  for (const card of a.loadout.cards) assert.deepEqual(Object.keys(card), ["definition", "readyAt"]);
});

test("accelerated clocks apply only to regular cards other than c, including imitator variants", () => {
  const time = clocks(1000, 9000);
  for (const id of ["A", "?A", "=", "?=", "b", "?b"]) assert.equal(battleCardTime(getCardDefinition(id), time), 9000, id);
  for (const id of ["c", "?c", "U", "m"]) assert.equal(battleCardTime(definition(id), time), 1000, id);
  assert.equal(battleCardTime({ id: "A", cost: 999 }, time), 9000);
  assert.equal(battleCardTime({ id: "A", cost: 1000 }, time), 1000);
});

test("reselection is atomic and retains native deadlines across slot removal and return", () => {
  const state = new BattleLoadout(defs("A", "B"));
  state.byId.get("A").readyAt = 900000;
  const original = state.cards, expected = state.deadlines(), prior = state.reselection.snapshot();
  assert.equal(state.reselect(defs("B"), clocks(239999, 500000)), false);
  assert.equal(state.cards, original); assert.deepEqual(state.deadlines(), expected); assert.deepEqual(state.reselection.snapshot(), prior);
  for (const definitions of [[], defs("A", "A"), defs("?A", "?B"), [undefined], Array(11).fill(getCardDefinition("A"))]) {
    assert.throws(() => state.reselect(definitions, clocks(240000)), /loadout/);
    assert.equal(state.cards, original); assert.deepEqual(state.reselection.snapshot(), prior);
  }
  assert.equal(state.reselect(defs("B"), clocks(240000, 500000)), true);
  original[0].readyAt = 1;
  assert.equal(state.reselect(defs("A", "B"), clocks(480000, 650000)), true);
  assert.equal(state.byId.get("A").readyAt, 900000);
  assert.notEqual(state.cards[0], original[0]);
});

test("imitators cannot reset cooldown by switching target or clock domain, while native slots remain independent", () => {
  const state = new BattleLoadout(defs("A", "?A"));
  state.byId.get("A").readyAt = 501000;
  state.byId.get("?A").readyAt = 502000;
  state.reselect(defs("A", "?c"), clocks(240000, 500000));
  assert.equal(state.byId.get("A").readyAt, 501000);
  assert.equal(state.byId.get("?c").readyAt, 242000);
  state.byId.get("?c").readyAt = 750000;
  state.reselect(defs("?B"), clocks(480000, 900000));
  assert.equal(state.byId.get("?B").readyAt, 1170000);
  state.reselect(defs("A"), clocks(720000, 1200000));
  assert.equal(state.byId.get("A").readyAt, 501000);
  state.reselect(defs("?="), clocks(960000, 1500000));
  assert.equal(state.byId.get("?=").readyAt, 1500000);
});

test("debug cooldown reset uses each card's authoritative clock without touching reselection memory", () => {
  const state = new BattleLoadout(defs("A", "c", "?c", "U", "="));
  for (const card of state.cards) card.readyAt = 12345;
  const old = state.reselection.snapshot();
  state.resetCooldowns(clocks(3000, 8000));
  assert.deepEqual(state.deadlines().map(card => card.readyAt), [8000, 3000, 3000, 3000, 8000]);
  assert.deepEqual(state.reselection.snapshot(), old);
});

test("loadout deadlines and remembered cooldowns retain the existing JSON snapshot contract", () => {
  const state = new BattleLoadout(defs("A", "?A"));
  state.byId.get("?A").readyAt = 600000;
  state.reselect(defs("B", "?c"), clocks(240000, 500000));
  const save = JSON.parse(JSON.stringify({ cardDeadlines: state.deadlines(), reselection: state.reselection.snapshot() }));
  const restored = new BattleLoadout(defs("B", "?c"));
  restored.restoreDeadlines(save.cardDeadlines); restored.reselection.restore(save.reselection);
  save.cardDeadlines[0].readyAt = 99;
  assert.deepEqual(restored.deadlines(), state.deadlines());
  for (const target of [state, restored]) target.reselect(defs("A", "?A"), clocks(480000, 900000));
  assert.deepEqual(restored.deadlines(), state.deadlines());
  assert.deepEqual(restored.reselection.snapshot(), state.reselection.snapshot());
});
