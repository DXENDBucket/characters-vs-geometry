import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { NumberTowerController } = load("src/game/numberTowers.ts");
const { withTowerActionContext } = load("src/game/towerIdentity.ts");
const { cardDefinitions } = load("src/data/cards.ts");
function fixture() {
  const towers = [], events = [];
  const getDefinition = id => cardDefinitions.find(card => card.id === id);
  const controller = new NumberTowerController(() => ({ towers, getDefinition,
    imitate: (tower, behavior, event) => events.push({ tower, behavior, event }) }));
  const place = (type, column, lane = 3, level = 1) => {
    const tower = { id: `tower:${towers.length}`, type, column, lane, level, inPlay: true, transient: false };
    towers.push(tower); return tower;
  };
  return { towers, events, getDefinition, controller, place };
}

test("= and 1 use standard functional panels and unlock together after AE-3", () => {
  const f = fixture();
  for (const [id, cost, cooldown] of [["=", 1000, 60000], ["1", 100, 2000]]) {
    const card = f.getDefinition(id);
    assert.deepEqual([card.cost, card.cooldown, card.category, card.maxHp, card.armor, card.magicResistance, card.attackPower],
      [cost, cooldown, "function", 1200, 150, 0, 0]);
    assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement(id), "AE-3");
  }
});

test("A=1=2 propagates source identities and counts only recorded sources independently", () => {
  const f = fixture(), source = f.place("A", 0);
  f.place("=", 1); const one = f.place("1", 2);
  f.place("=", 3); const two = f.place("1", 4, 3, 2);
  const unrelated = f.place("A", 10);
  f.controller.sync();
  for (const number of [one, two]) assert.deepEqual(number.numberMemory, [{ type: "A", sourceIds: [source.id], count: 0 }]);
  f.controller.record(unrelated, { kind: "attack" }); assert.equal(f.events.length, 0);
  f.controller.record(source, { kind: "attack" });
  assert.deepEqual(f.events.map(e => [e.tower.id, e.behavior.level]), [[one.id, 1]]);
  assert.equal(two.numberMemory[0].count, 1);
  f.controller.record(source, { kind: "attack" });
  assert.deepEqual(f.events.map(e => [e.tower.id, e.behavior.level]), [[one.id, 1], [one.id, 1], [two.id, 2]]);
  assert.equal(two.numberMemory[0].count, 0);
});

test("A=number=E keeps separate per-type counters and preserves memories after disconnection", () => {
  const f = fixture(), a = f.place("A", 0);
  const connector = f.place("=", 1), number = f.place("1", 2, 3, 2);
  f.place("=", 3); const e = f.place("E", 4);
  f.controller.sync();
  f.controller.record(a, { kind: "attack" });
  f.controller.record(e, { kind: "attack" });
  assert.equal(f.events.length, 0);
  connector.inPlay = false; f.controller.sync();
  f.controller.record(a, { kind: "attack" });
  assert.equal(f.events[0].behavior.type, "A");
  assert.equal(number.numberMemory.find(entry => entry.type === "E").count, 1);
  number.level = 3;
  f.controller.record(e, { kind: "attack" }); assert.equal(f.events.length, 1);
  f.controller.record(e, { kind: "attack" }); assert.equal(f.events[1].behavior.level, 3);
});

test("vertical connections exclude expensive sources, allow transient effect cards and never copy counters", () => {
  const f = fixture(), number = f.place("1", 2, 2, 2);
  f.place("=", 2, 3); const expensive = f.place("@", 2, 4);
  f.controller.sync(); assert.equal(number.numberMemory?.length ?? 0, 0);
  expensive.inPlay = false;
  const effect = f.place("t", 2, 4); effect.transient = true;
  f.controller.sync();
  f.controller.record(effect, { kind: "targeted" });
  assert.equal(number.numberMemory[0].count, 1);
  f.place("=", 3, 2); const newcomer = f.place("1", 4, 2, 2);
  f.controller.sync(); assert.equal(newcomer.numberMemory[0].count, 0);
  assert.deepEqual(newcomer.numberMemory[0].sourceIds, [effect.id]);
});

test("source deaths remove identity references without forgetting types or counts; chain cycles terminate", () => {
  const f = fixture(), a = f.place("A", 0, 1);
  f.place("=", 1, 1); const number = f.place("1", 2, 1, 2);
  f.place("=", 3, 1); f.place("1", 4, 1);
  f.place("=", 2, 2); f.place("=", 4, 2);
  f.place("1", 2, 3); f.place("=", 3, 3); f.place("1", 4, 3);
  f.controller.sync(); f.controller.record(a, { kind: "attack" });
  a.inPlay = false; f.controller.sync();
  assert.deepEqual(number.numberMemory, [{ type: "A", sourceIds: [], count: 1 }]);
  const replacement = f.place("A", 0, 1); f.controller.sync();
  assert.deepEqual(number.numberMemory[0].sourceIds, [replacement.id]);
  assert.equal(number.numberMemory[0].count, 1);
});

test("imitations cannot recursively count, temporary levels never change n, and action payloads are retained", () => {
  const f = fixture(), source = f.place("i", 0);
  f.place("=", 1); const number = f.place("1", 2);
  number.levelBonus = 50; number.mirrorLevelBonus = 10;
  f.controller.sync();
  f.controller.record(source, { kind: "shock" });
  assert.equal(f.events[0].behavior.level, 1);
  assert.equal(f.events[0].event.kind, "shock");
  withTowerActionContext(number, { type: "i", level: 1, stats: {} }, () => f.controller.record(number, { kind: "shock" }));
  f.controller.record(number, { kind: "attack" });
  assert.equal(f.events.length, 1);
});

test("borrowed action contexts never grant persistent zeal, unyielding or slow auras", () => {
  const { towerAuraSources, syncUnyieldingAuras } = load("src/game/towerAuras.ts");
  const { slowAuraSources } = load("src/game/slowAura.ts");
  const f = fixture(), number = f.place("1", 2);
  for (const type of ["e", "g", "T"]) {
    withTowerActionContext(number, { type, level: 5, stats: {} }, () => {
      assert.equal(towerAuraSources(f.towers).hasZeal, false);
      syncUnyieldingAuras(f.towers);
      assert.equal(number.unyieldingRatio, 0);
      assert.equal(slowAuraSources(f.towers).hasAura, false);
    });
  }
});
