import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { NumberTowerController } = load("src/game/numberTowers.ts");
const { withTowerActionContext, isNumberTower, numberTowerValue, numberTowerActionLevel } = load("src/game/towerIdentity.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const topology = load("src/game/towerTopology.ts");
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

test("0 and minus are selectable cards with matching panels and unlocks", () => {
  const f = fixture(), unlock = load("src/data/cardUnlocks.ts").cardUnlockRequirement;
  assert.equal(unlock("0"), "AE-3"); assert.equal(unlock("-"), "AE-4");
  for (const [a, b] of [["0", "1"], ["-", "+"]]) {
    for (const field of ["category", "cost", "cooldown", "maxHp", "armor", "magicResistance", "attackPower"])
      assert.equal(f.getDefinition(a)[field], f.getDefinition(b)[field]);
  }
});

test("zero stores each kind independently, releases once at its own count times the equation multiplier", () => {
  const f = fixture(), a = f.place("A", 0); f.place("=", 1, 3, 2);
  const zero = f.place("0", 2); const eq = f.place("=", 3); const e = f.place("E", 4);
  f.controller.sync();
  for (let i = 0; i < 6; i++) f.controller.record(a, { kind: "attack" });
  for (let i = 0; i < 3; i++) f.controller.record(e, { kind: "attack" });
  assert.equal(f.events.length, 0); assert.equal(numberTowerValue(zero), 0);
  eq.inPlay = false; f.controller.sync();
  assert.equal(f.controller.release(zero), true);
  assert.deepEqual(f.events.map(event => event.behavior).sort((a, b) => a.type.localeCompare(b.type)), [{ type: "A", level: 12 }, { type: "E", level: 6 }]);
  assert.ok(zero.numberMemory.every(entry => entry.count === 0 && !entry.storedEvent));
  f.controller.release(zero); assert.equal(f.events.length, 2);
  f.controller.record(e, { kind: "attack" }); f.controller.release(zero);
  assert.deepEqual(f.events.at(-1).behavior, { type: "E", level: 2 });
  zero.level++; f.controller.sync(); assert.equal(numberTowerValue(zero), 1);
  assert.equal(f.controller.release(zero), false);
  f.controller.record(a, { kind: "attack" }); assert.deepEqual(f.events.at(-1).behavior, { type: "A", level: 2 });
});

test("zero retains skill payload and explosion memory across source removal, never counts imitations", () => {
  const f = fixture(), source = f.place("i", 0); f.place("=", 1); const zero = f.place("0", 2);
  f.controller.sync(); f.controller.record(source, { kind: "shock" });
  source.inPlay = false; f.controller.sync();
  f.controller.release(zero); assert.equal(f.events[0].event.kind, "shock"); assert.equal(zero.inPlay, true);
  withTowerActionContext(zero, { type: "i", level: 3, stats: {} }, () => f.controller.record(zero, { kind: "shock" }));
  assert.equal(zero.numberMemory[0].count, 0);
  const pusher = f.place("#", 0); f.controller.sync();
  const event = { kind: "skill", laneOffset: 1, columnOffset: 0 };
  f.controller.record(pusher, event); f.controller.record(pusher, event); f.controller.release(zero);
  assert.deepEqual(f.events.at(-1).event, event); assert.equal(f.events.at(-1).behavior.level, 2);
});

test("minus uses absolute difference, keeps operands working and shares zero behavior with plus", () => {
  const f = fixture(), a = f.place("A", 0); f.place("=", 1, 3, 2);
  const three = f.place("1", 2, 3, 3), minus = f.place("-", 3, 3, 3), five = f.place("1", 4, 3, 5);
  f.controller.sync(); assert.equal(numberTowerValue(minus), 2); assert.equal(numberTowerActionLevel(minus), 8);
  f.controller.record(a, { kind: "attack" }); f.controller.record(a, { kind: "attack" });
  assert.deepEqual(f.events.map(event => event.behavior.level), [8]);
  three.level = 5; f.controller.sync(); assert.equal(numberTowerValue(minus), 0);
  for (let i = 0; i < 3; i++) f.controller.record(a, { kind: "attack" });
  assert.ok(f.events.some(event => event.tower === three) && f.events.some(event => event.tower === five));
  f.controller.release(minus); assert.equal(f.events.at(-1).behavior.level, 12);
  const z = fixture(), source = z.place("A", 0); z.place("=", 1);
  z.place("0", 2); const plus = z.place("+", 3); z.place("0", 4); z.controller.sync();
  z.controller.record(source, { kind: "attack" }); assert.equal(z.events.length, 0);
  assert.equal(numberTowerValue(plus), 0); z.controller.release(plus); assert.equal(z.events[0].behavior.level, 1);
});

test("minus rejects ordinary operands and neighboring operators; crossing sums are independent", () => {
  for (const expression of [["0", "-", "A"], ["0", "=", "-", "A"], ["0", "-", "+", "A"]]) {
    const f = fixture(); expression.forEach((type, column) => f.place(type, column)); f.controller.sync();
    assert.equal(f.towers[0].numberMemory, undefined);
  }
  const f = fixture(), p = f.place("+", 2, 2);
  f.place("1", 1, 2, 3); f.place("1", 3, 2, 5);
  f.place("1", 2, 1, 8); f.place("1", 2, 3, 9); f.controller.sync();
  assert.equal(p.numberValue, 8);
  assert.equal(p.numberChannels.vertical.numberValue, 17);
});

test("crossing minus has separate memories, counters, multipliers and releases only zero-valued axes", () => {
  const f = fixture(), a = f.place("A", 1); f.place("=", 2, 3, 2); f.place("1", 3, 3, 3);
  const minus = f.place("-", 4, 3, 2); f.place("1", 5, 3, 5);
  const e = f.place("E", 4, 0); f.place("=", 4, 1, 3); f.place("1", 4, 2, 4); f.place("1", 4, 4, 4);
  f.controller.sync(); f.controller.sync();
  const h = minus.numberChannels.horizontal, v = minus.numberChannels.vertical;
  assert.deepEqual([h.numberValue, h.equationLevel, v.numberValue, v.equationLevel], [2, 2, 0, 3]);
  assert.deepEqual(h.numberMemory.map(entry => entry.type), ["A"]);
  assert.deepEqual(v.numberMemory.map(entry => entry.type), ["E"]);
  for (let i = 0; i < 3; i++) f.controller.record(a, { kind: "attack" });
  for (let i = 0; i < 3; i++) f.controller.record(e, { kind: "attack" });
  assert.deepEqual(f.events.filter(event => event.tower === minus).map(event => event.behavior), [{ type: "A", level: 6 }]);
  assert.equal(h.numberMemory[0].count, 1); assert.equal(v.numberMemory[0].count, 3);
  f.controller.release(minus);
  assert.deepEqual(f.events.at(-1).behavior, { type: "E", level: 12 });
  assert.equal(h.numberMemory[0].count, 1); assert.equal(v.numberMemory[0].count, 0);
  f.controller.record(a, { kind: "attack" }); assert.deepEqual(f.events.at(-1).behavior, { type: "A", level: 6 });
  f.controller.record(e, { kind: "attack" });
  f.towers.find(t => t.column === 4 && t.lane === 4).inPlay = false; f.controller.sync();
  assert.equal(minus.numberChannels.vertical.numberValue, undefined);
  assert.equal(f.controller.release(minus), false);
  f.place("1", 4, 4, 4); f.controller.sync();
  assert.equal(minus.numberChannels.vertical.numberMemory[0].count, 1, "reconnection lost stored vertical count");
});

test("crossing ordinary plus and equals never leak source memories or shared increments", () => {
  for (const operator of ["+", "="]) {
    const f = fixture(), n = f.place("0", 1); f.place("=", 2);
    const a = f.place("A", 3); f.place(operator, 4); f.place("E", 5);
    const v = f.place("0", 4, 0); f.place("=", 4, 1); const c = f.place("C", 4, 2); f.place("M", 4, 4);
    f.controller.sync();
    assert.deepEqual(new Set(n.numberMemory.map(entry => entry.type)), new Set(["A", "E"]));
    assert.deepEqual(new Set(v.numberMemory.map(entry => entry.type)), new Set(["C", "M"]));
    f.controller.record(a, { kind: "attack" });
    assert.ok(v.numberMemory.every(entry => entry.count === 0));
    f.controller.record(c, { kind: "attack" });
    assert.equal(n.numberMemory.find(entry => entry.type === "A").count, 1);
  }
});

test("horizontal and vertical equations merge through a shared operand, not a crossing connector", () => {
  const f = fixture(), n = f.place("0", 4, 3), a = f.place("A", 2, 3), e = f.place("E", 4, 1);
  f.place("=", 3, 3, 2); f.place("=", 4, 2, 5);
  f.controller.sync();
  assert.equal(n.equationLevel, 5);
  f.controller.record(a, { kind: "attack" }); f.controller.record(e, { kind: "attack" }); f.controller.release(n);
  assert.deepEqual(new Set(f.events.map(event => event.behavior.type)), new Set(["A", "E"]));
  assert.ok(f.events.every(event => event.behavior.level === 5));
});

test("legacy operator counts migrate once without copying them to a newly added axis", () => {
  const f = fixture(), a = f.place("A", 0); f.place("=", 1); f.place("1", 2, 3, 3);
  const p = f.place("+", 3); f.place("1", 4, 3, 5);
  p.numberValue = 8; p.numberMemory = [{ type: "A", sourceIds: [a.id], count: 7 }];
  f.controller.sync(); assert.equal(p.numberChannels.horizontal.numberMemory[0].count, 7);
  f.place("1", 3, 2, 3); f.place("1", 3, 4, 5); f.controller.sync();
  assert.equal(p.numberChannels.vertical.numberMemory, undefined);
  f.controller.record(a, { kind: "attack" });
  assert.equal(f.events.filter(event => event.tower === p).length, 1);
});

test("= and 1 use standard functional panels and unlock together after AE-3", () => {
  const f = fixture();
  for (const [id, cost, cooldown] of [["=", 1000, 30000], ["1", 100, 2000]]) {
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

test("all numbers learn remote sources across ordinary towers in A=E=1=B=2", () => {
  const f = fixture(), a = f.place("A", 0);
  f.place("=", 1); const e = f.place("E", 2);
  f.place("=", 3); const one = f.place("1", 4);
  f.place("=", 5); const b = f.place("B", 6);
  f.place("=", 7); const two = f.place("1", 8, 3, 2);
  const unrelated = f.place("A", 4, 2);
  f.controller.sync();
  for (const number of [one, two]) {
    assert.equal(number.numberMemory.length, 3);
    for (const source of [a, e, b]) {
      assert.deepEqual(number.numberMemory.find(entry => entry.type === source.type).sourceIds, [source.id]);
    }
  }
  f.controller.record(unrelated, { kind: "attack" }); assert.equal(f.events.length, 0);
  f.controller.record(a, { kind: "attack" });
  assert.deepEqual(f.events.map(event => event.tower), [one]);
  assert.equal(two.numberMemory.find(entry => entry.type === "A").count, 1);
  f.controller.record(e, { kind: "attack" });
  assert.equal(two.numberMemory.find(entry => entry.type === "A").count, 1);
  f.controller.record(a, { kind: "attack" });
  assert.equal(f.events.at(-1).tower, two);
  assert.deepEqual(f.events.at(-1).behavior, { type: "A", level: 2 });
});

test("branched cyclic equations traverse ordinary towers once and stop at expensive operands", () => {
  const f = fixture(), number = f.place("1", 2, 2, 2), e = f.place("E", 4, 2);
  const b = f.place("B", 2, 4), a = f.place("A", 4, 4);
  for (const [column, lane] of [[3, 2], [2, 3], [4, 3], [3, 4], [5, 4], [7, 4]]) f.place("=", column, lane);
  f.place("@", 6, 4); const x = f.place("X", 8, 4);
  f.controller.sync(); f.controller.sync();
  assert.equal(number.numberMemory.length, 3);
  f.controller.record(x, { kind: "attack" }); assert.equal(f.events.length, 0);
  for (const source of [a, e, b]) {
    assert.deepEqual(number.numberMemory.find(entry => entry.type === source.type).sourceIds, [source.id]);
    f.controller.record(source, { kind: "attack" });
  }
  assert.equal(f.events.length, 0);
  assert.ok(number.numberMemory.every(entry => entry.count === 1));
  f.controller.record(a, { kind: "attack" });
  assert.equal(f.events.length, 1);
});

test("a broken remote equation retains old memories but never learns newly disconnected sources", () => {
  const f = fixture(), a = f.place("A", 0);
  const connector = f.place("=", 1); f.place("E", 2);
  f.place("=", 3); const number = f.place("1", 4, 3, 2);
  f.controller.sync(); f.controller.record(a, { kind: "attack" });
  connector.inPlay = false; f.controller.sync();
  const replacement = f.place("A", 0); f.controller.sync();
  f.controller.record(replacement, { kind: "attack" }); assert.equal(f.events.length, 0);
  f.controller.record(a, { kind: "attack" }); assert.equal(f.events.length, 1);
  f.place("=", 5); const newcomer = f.place("1", 6);
  f.controller.sync();
  assert.deepEqual(newcomer.numberMemory.find(entry => entry.type === "A").sourceIds, [a.id]);
  assert.equal(newcomer.numberMemory.find(entry => entry.type === "A").count, 0);
  assert.equal(number.numberMemory.find(entry => entry.type === "A").count, 0);
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

test("AE-4 panel, wave pool and rewards", () => {
  const level = load("src/data/levels.ts").getLevelConfig("AE-4");
  assert.equal(level.totalWaves, 20); assert.equal(level.unlockAfter, "AE-3");
  assert.deepEqual(level.enemyKinds, ["circle", "triangle", "triangle2", "triangle3", "equals", "equals2", "equals3", "mortarTriangle", "pentagon"]);
  assert.deepEqual([level.firstWaveWeight, level.waveWeightIncrement, level.waveWeightIncrementGrowth, level.startingChars], [25, 18, 3, 500]);
  for (const [id, cost, cd] of [["+", 1000, 30000], ["&", 4200, 120000]]) {
    const card = fixture().getDefinition(id);
    assert.deepEqual([card.cost, card.cooldown, card.category, card.attackPower], [cost, cd, "function", 0]);
    assert.equal(load("src/data/cardUnlocks.ts").cardUnlockRequirement(id), "AE-4");
  }
  assert.equal(load("src/game/upgrades.ts").isMaxHpUpgradeable("&"), true);
});

test("plus shares counters only within plus terms of a mixed equation", () => {
  const f = fixture(), number = f.place("1", 0, 3, 2);
  f.place("=", 1); const a = f.place("A", 2);
  f.place("+", 3); const e = f.place("E", 4);
  f.place("+", 5); const m = f.place("M", 6);
  f.place("+", 7); const w = f.place("W", 8);
  f.place("=", 9); const i = f.place("I", 10);
  f.controller.sync();
  assert.equal(number.numberMemory.length, 5);
  f.controller.record(a, { kind: "attack" });
  for (const source of [a, e, m, w]) assert.equal(number.numberMemory.find(entry => entry.type === source.type).count, 1);
  assert.equal(number.numberMemory.find(entry => entry.type === "I").count, 0);
  f.controller.record(e, { kind: "attack" });
  assert.deepEqual(new Set(f.events.map(entry => entry.behavior.type)), new Set(["A", "E", "M", "W"]));
  assert.ok(f.events.every(entry => entry.tower === number && entry.behavior.level === 2));
  f.controller.record(i, { kind: "attack" }); assert.equal(f.events.length, 4);
});

test("A+C+E advances every learned kind once per source action, without recursive propagation", () => {
  const f = fixture(), a = f.place("A", 0); f.place("+", 1);
  const c = f.place("C", 2); f.place("+", 3); const e = f.place("E", 4);
  f.place("=", 5); const number = f.place("1", 6, 3, 3);
  const unrelated = f.place("C", 8);
  f.controller.sync();
  f.controller.record(unrelated, { kind: "attack" });
  assert.ok(number.numberMemory.every(entry => entry.count === 0));
  for (const [index, source] of [a, c, e].entries()) {
    f.controller.record(source, { kind: "attack" });
    assert.equal(number.numberMemory.length, 3);
    assert.ok(number.numberMemory.every(entry => entry.count === (index + 1) % 3));
    assert.equal(f.events.length, index === 2 ? 3 : 0);
  }
  assert.deepEqual(new Set(f.events.map(event => event.behavior.type)), new Set(["A", "C", "E"]));
  for (const event of f.events) {
    assert.equal(event.behavior.level, 3);
    assert.equal(event.event.kind, event.behavior.type === "E" ? "attack" : "combined");
    withTowerActionContext(number, { ...event.behavior, stats: {} }, () => f.controller.record(number, { kind: "attack" }));
  }
  assert.equal(f.events.length, 3);
  assert.ok(number.numberMemory.every(entry => entry.count === 0));
});

test("adjacent operators and expensive operands cannot bridge equations", () => {
  for (const expression of [["1", "=", "+", "A"], ["1", "+", "=", "A"], ["1", "=", "@", "=", "A"]]) {
    const f = fixture(); expression.forEach((type, column) => f.place(type, column));
    f.controller.sync(); assert.equal(f.towers[0].numberMemory?.length ?? 0, 0);
  }
  const f = fixture(), copiedNumber = f.place("@", 0);
  copiedNumber.copiedType = "1"; f.place("=", 1); const source = f.place("A", 2);
  f.controller.sync(); f.controller.record(source, { kind: "attack" });
  assert.equal(copiedNumber.numberMemory?.length ?? 0, 0); assert.equal(f.events.length, 0);
});

test("3+5 preserves both numbers and lets the plus imitate as 8 through the full equation", () => {
  const f = fixture(), a = f.place("A", 0);
  f.place("=", 1); const three = f.place("1", 2, 3, 3), plus = f.place("+", 3), five = f.place("1", 4, 3, 5);
  f.place("=", 5); const e = f.place("E", 6);
  f.controller.sync(); f.controller.sync();
  assert.deepEqual([three, plus, five].map(tower => numberTowerValue(tower)), [3, 8, 5]);
  assert.equal(plus.type, "+"); assert.equal(plus.level, 1); assert.ok(isNumberTower(plus));
  for (const tower of [three, plus, five]) {
    assert.equal(tower.numberMemory.length, 2);
    for (const source of [a, e]) assert.deepEqual(tower.numberMemory.find(entry => entry.type === source.type).sourceIds, [source.id]);
  }
  for (let i = 0; i < 8; i++) f.controller.record(a, { kind: "attack" });
  assert.deepEqual(f.events.map(event => [event.tower.id, event.behavior.level]), [[three.id, 3], [five.id, 5], [three.id, 3], [plus.id, 8]]);
  assert.ok([three, plus, five].every(tower => tower.numberMemory.find(entry => entry.type === "E").count === 0));
  f.controller.record(plus, { kind: "attack" }); assert.equal(f.events.length, 4);
});

test("3+5+2 computes local pairs 8 and 7, excluding equality neighbors", () => {
  const f = fixture(), a = f.place("A", 0);
  f.place("=", 1); const three = f.place("1", 2, 3, 3), p = f.place("+", 3), five = f.place("1", 4, 3, 5);
  const q = f.place("+", 5), two = f.place("1", 6, 3, 2);
  f.place("=", 7); const other = f.place("1", 8, 3, 20);
  f.controller.sync();
  assert.deepEqual([three, p, five, q, two, other].map(tower => numberTowerValue(tower)), [3, 8, 5, 7, 2, 20]);
  for (let i = 0; i < 10; i++) f.controller.record(a, { kind: "attack" });
  for (const [plus, level] of [[p, 8], [q, 7]]) assert.deepEqual(f.events.filter(event => event.tower === plus).map(event => event.behavior), [{ type: "A", level }]);
  three.level = 4; p.level = 50; five.levelBonus = 100; f.controller.sync();
  assert.deepEqual([three, p, five, q, two, other].map(tower => numberTowerValue(tower)), [4, 9, 5, 7, 2, 20]);
  q.inPlay = false; f.controller.sync();
  assert.equal(p.numberValue, 9); assert.equal(q.numberValue, undefined);
  assert.deepEqual(two.numberMemory[0].sourceIds, [a.id]);
});

test("numeric plus groups do not accept ordinary towers or bridge adjacent operators", () => {
  for (const reversed of [false, true]) {
    const f = fixture(), n = f.place("1", reversed ? 2 : 0, 3, 3);
    const p = f.place("+", 1), a = f.place("A", reversed ? 0 : 2);
    f.controller.sync(); f.controller.record(a, { kind: "attack" });
    assert.equal(n.numberMemory, undefined); assert.equal(p.numberValue, undefined); assert.equal(f.events.length, 0);
  }
  const f = fixture(); f.place("1", 1, 3, 3); const p = f.place("+", 2); f.place("1", 3, 3, 5);
  f.place("=", 2, 2); const a = f.place("A", 2, 1);
  f.controller.sync(); f.controller.record(a, { kind: "attack" });
  assert.equal(p.numberValue, 8); assert.equal(p.numberMemory, undefined);
});

test("a level-2 equals makes number 9 imitate at level 18 after exactly nine actions", () => {
  const f = fixture(), a = f.place("A", 0); const eq = f.place("=", 1, 3, 2), nine = f.place("1", 2, 3, 9);
  eq.levelBonus = 100; nine.levelBonus = 100; nine.mirrorLevelBonus = 50;
  f.controller.sync();
  assert.equal(nine.equationLevel, 2); assert.equal(numberTowerValue(nine), 9); assert.equal(numberTowerActionLevel(nine), 18);
  for (let i = 0; i < 8; i++) f.controller.record(a, { kind: "attack" });
  assert.equal(f.events.length, 0);
  f.controller.record(a, { kind: "attack" });
  assert.deepEqual(f.events[0].behavior, { type: "A", level: 18 });
  assert.equal(nine.numberMemory[0].count, 0);
});

test("equation level is the maximum valid equals level across the entire current component", () => {
  const f = fixture(), a = f.place("A", 0); f.place("=", 1, 3, 2); f.place("E", 2);
  const high = f.place("=", 3, 3, 4), n = f.place("1", 4, 3, 3);
  const broken = f.place("=", 5, 3, 20); f.place("@", 6);
  f.place("=", 4, 2, 30);
  f.controller.sync();
  assert.equal(numberTowerActionLevel(n), 12);
  for (let i = 0; i < 2; i++) f.controller.record(a, { kind: "attack" });
  high.level = 1; f.controller.sync();
  assert.equal(numberTowerActionLevel(n), 6); assert.equal(n.numberMemory.find(entry => entry.type === "A").count, 2);
  f.controller.record(a, { kind: "attack" }); assert.equal(f.events.at(-1).behavior.level, 6);
  high.inPlay = false; broken.inPlay = false; f.controller.sync();
  assert.equal(n.equationLevel, undefined); assert.equal(numberTowerActionLevel(n), 3);
  assert.deepEqual(n.numberMemory.find(entry => entry.type === "A").sourceIds, [a.id]);
});

test("numeric plus uses equals level plus its own level minus one without changing its operands or interval", () => {
  const f = fixture(), a = f.place("A", 0); const eq = f.place("=", 1, 3, 2);
  const three = f.place("1", 2, 3, 3), p = f.place("+", 3, 3, 3), five = f.place("1", 4, 3, 5);
  const q = f.place("+", 5, 3, 4), two = f.place("1", 6, 3, 2);
  p.levelBonus = 10; q.mirrorLevelBonus = 20;
  f.controller.sync();
  assert.deepEqual([three, p, five, q, two].map(tower => numberTowerActionLevel(tower)), [6, 32, 10, 35, 4]);
  assert.deepEqual([three, p, five, q, two].map(tower => numberTowerValue(tower)), [3, 8, 5, 7, 2]);
  for (let i = 0; i < 10; i++) f.controller.record(a, { kind: "attack" });
  assert.deepEqual(f.events.filter(event => event.tower === p).map(event => event.behavior.level), [32]);
  assert.deepEqual(f.events.filter(event => event.tower === q).map(event => event.behavior.level), [35]);
  eq.inPlay = false; f.controller.sync();
  assert.deepEqual([three, p, five, q, two].map(tower => numberTowerActionLevel(tower)), [3, 24, 5, 28, 2]);
  p.level++; f.controller.sync();
  assert.equal(numberTowerActionLevel(p), 32); assert.equal(numberTowerActionLevel(q), 28);
});

test("numeric plus cycles compute each adjacent pair and stop imitating when broken", () => {
  const f = fixture(), a = f.place("A", 0, 1); f.place("=", 1, 1);
  const numbers = [[2, 1, 3], [4, 1, 5], [2, 3, 2], [4, 3, 1]].map(([c, l, n]) => f.place("1", c, l, n));
  const pluses = [[3, 1], [2, 2], [4, 2], [3, 3]].map(([c, l]) => f.place("+", c, l));
  f.controller.sync(); f.controller.sync();
  assert.deepEqual(pluses.map(tower => numberTowerValue(tower)), [8, 5, 6, 3]);
  for (let i = 0; i < 11; i++) f.controller.record(a, { kind: "attack" });
  assert.equal(f.events.filter(event => pluses.includes(event.tower)).length, 7);
  numbers[1].inPlay = false; numbers[2].inPlay = false; f.controller.sync(); f.events.length = 0;
  assert.ok(pluses.every(p => !isNumberTower(p) && p.numberValue === undefined));
  for (let i = 0; i < 20; i++) f.controller.record(a, { kind: "attack" });
  assert.ok(f.events.every(event => !pluses.includes(event.tower)));
  numbers[1].inPlay = true; f.controller.sync();
  assert.equal(pluses[0].numberValue, 8); assert.equal(pluses[2].numberValue, 6);
});

test("topology swaps compose in activation order and removal recomputes the remaining permutation", () => {
  const f = fixture(), first = f.place("&", 1), second = f.place("&", 5), target = f.place("A", 9);
  first.placedOrder = 1; second.placedOrder = 2;
  first.topologyTarget = { lane: 3, column: 5 }; first.topologyOrder = 10;
  second.topologyTarget = { lane: 3, column: 9 }; second.topologyOrder = 20;
  topology.syncTowerTopology(f.towers);
  assert.deepEqual(topology.towerCell(first), { lane: 3, column: 9 });
  assert.deepEqual(topology.towerCell(second), { lane: 3, column: 1 });
  assert.deepEqual(topology.towerCell(target), { lane: 3, column: 5 });
  assert.equal(first.column, 1); assert.equal(target.column, 9);
  first.inPlay = false; topology.syncTowerTopology(f.towers);
  assert.deepEqual(topology.towerCell(second), { lane: 3, column: 9 });
  assert.deepEqual(topology.towerCell(target), { lane: 3, column: 5 });
  second.inPlay = false; topology.syncTowerTopology(f.towers);
  assert.equal(topology.towerCell(target).column, 9);
});

test("logical auras, equations and range outlines include remote cells and leave holes", () => {
  const f = fixture(), e = f.place("e", 2), swap = f.place("&", 3), remote = f.place("A", 10, 6);
  for (const tower of f.towers) {
    tower.x = load("src/config.ts").BOARD_X + (tower.column + .5) * load("src/config.ts").CELL_WIDTH;
    tower.y = load("src/config.ts").BOARD_Y + (tower.lane + .5) * load("src/config.ts").CELL_HEIGHT;
  }
  swap.topologyTarget = { lane: remote.lane, column: remote.column }; swap.topologyOrder = 0;
  topology.syncTowerTopology(f.towers);
  assert.equal(topology.inFriendlyRange(e, remote, 2, true), true);
  assert.equal(topology.inFriendlyRange(e, swap, 2, true), false);
  const lines = [], graphics = { lineStyle() { return this; }, lineBetween(...args) { lines.push(args); return this; } };
  load("src/render/towerLogicalRange.ts").drawLogicalTowerRange(graphics, e, 2, true, 0xffffff);
  const { CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
  const edge = tower => [tower.x - e.x - CELL_WIDTH / 2, tower.y - e.y - CELL_HEIGHT / 2,
    tower.x - e.x + CELL_WIDTH / 2, tower.y - e.y - CELL_HEIGHT / 2];
  assert.ok(lines.some(line => JSON.stringify(line) === JSON.stringify(edge(remote))));
  assert.ok(lines.some(line => JSON.stringify(line) === JSON.stringify(edge(swap))));
  f.place("=", 4); const number = f.place("1", 5); topology.syncTowerTopology(f.towers); f.controller.sync();
  assert.deepEqual(number.numberMemory.find(entry => entry.type === "A").sourceIds, [remote.id]);
});
